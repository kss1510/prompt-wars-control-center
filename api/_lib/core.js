// Server logic for the AI judge and the Round 2 chatbot. Pure functions over a `store` (database
// access) and `gemini` (AI call) so they can be tested with fakes; the Vercel handlers wire them up.
//
// Free-tier design: each closed round is scored in batches (a few requests per round), Gemini models
// are tried in order so one model's daily allowance running out falls through to the next, and the
// Round 2 chatbot is rule-based by default (optionally AI, with the rule bot as backup when busy).
import { roundFor } from '../../src/lib/rules.js';
import {
  JUDGE_SCHEMA, ROUND_JUDGE_SCHEMA, judgeSystemInstruction, judgeInput, parseJudgeOutput,
  judgeRoundSystemInstruction, judgeRoundInput, parseRoundOutput, entryLabel,
  chatbotSystemInstruction, chatbotInput
} from '../../src/lib/aiJudge.js';
import { ruleBotReply } from '../../src/lib/ruleBot.js';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const BATCH_SIZE = 8;
const isStaff = role => role === 'host' || role === 'judge';
const roundOpen = (round, now = Date.now()) =>
  Boolean(round) && round.status === 'open' && (!round.closes_at || now < new Date(round.closes_at).getTime());
export const roundClosed = (round, now = Date.now()) =>
  Boolean(round) && (round.status === 'closed' || (round.status === 'open' && round.closes_at && now >= new Date(round.closes_at).getTime()));

/** Try each model in turn; move on when one is busy / out of quota / unknown. Returns { text, model }. */
export async function callWithFallback(gemini, models, opts) {
  let last;
  for (const model of models) {
    try { return { text: await gemini({ ...opts, model }), model }; }
    catch (error) {
      last = error;
      if (!(error.busy || error.status === 404 || error.status === 429)) throw error;
    }
  }
  throw last || new Error('No AI model is configured.');
}

/** Score the next batch of unscored submissions in a CLOSED round (host only). */
export async function scoreRound({ store, gemini, caller, roundId, models, batchSize = BATCH_SIZE }) {
  if (!caller) throw new ApiError(401, 'Sign in first.');
  if (caller.role !== 'host') throw new ApiError(403, 'Only a host can run the AI judge for a round.');
  const settings = await store.getSettings();
  if (!settings?.ai_judging) throw new ApiError(409, 'AI judging is switched off by the host.');
  const round = await store.getRound(roundId);
  if (!round) throw new ApiError(404, 'Unknown round.');
  if (!roundClosed(round)) throw new ApiError(409, 'The AI judge scores all teams together once the round closes. Close the round first.');
  const pending = await store.listPendingSubmissions(roundId);
  if (!pending.length) return { scored: 0, remaining: 0 };
  const batch = pending.slice(0, batchSize);
  await Promise.all(batch.map(s => store.markSubmission(s.id, 'scoring', null)));
  try {
    const [brief, judgeNotes, transcripts] = await Promise.all([
      store.getBrief(roundId), store.getJudgeNotes(roundId),
      roundId === 2 ? store.getTranscriptsFor(batch.map(s => s.team_id)) : Promise.resolve({})
    ]);
    const { text, model } = await callWithFallback(gemini, models, {
      system: judgeRoundSystemInstruction(roundFor(roundId), batch.length),
      text: judgeRoundInput({ round: roundId, submissions: batch, brief, judgeNotes, transcripts, liveRound: round }),
      schema: ROUND_JUDGE_SCHEMA,
      thinkingLevel: 'low',
      maxOutputTokens: 16000
    });
    const results = parseRoundOutput(text, roundId, batch.map(entryLabel));
    let scored = 0;
    for (const s of batch) {
      const r = results.get(entryLabel(s));
      if (!r) { await store.markSubmission(s.id, 'failed', 'The AI judge skipped this entry; it will be retried.'); continue; }
      await store.recordScores(s.id, r.points, r.reasons, model, r.flagged);
      scored++;
    }
    return { scored, remaining: pending.length - scored, model };
  } catch (error) {
    await Promise.all(batch.map(s => store.markSubmission(s.id, 'failed', error.message).catch(() => {})));
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.busy ? 503 : 502, error.message);
  }
}

/** Host: (re-)score a single submission now (for example after a correction). */
export async function scoreSubmission({ store, gemini, caller, submissionId, models }) {
  if (!caller) throw new ApiError(401, 'Sign in first.');
  if (caller.role !== 'host') throw new ApiError(403, 'Only a host can re-run the AI judge.');
  const sub = await store.getSubmission(submissionId);
  if (!sub) throw new ApiError(404, 'Submission not found.');
  const settings = await store.getSettings();
  if (!settings?.ai_judging) throw new ApiError(409, 'AI judging is switched off by the host.');
  if (sub.status === 'Rejected') throw new ApiError(409, 'Rejected submissions are not scored.');
  await store.markSubmission(sub.id, 'scoring', null);
  try {
    const [round, brief, judgeNotes, transcripts] = await Promise.all([
      store.getRound(sub.round_id), store.getBrief(sub.round_id), store.getJudgeNotes(sub.round_id),
      sub.round_id === 2 ? store.getTranscriptsFor([sub.team_id]) : Promise.resolve({})
    ]);
    const { text, model } = await callWithFallback(gemini, models, {
      system: judgeSystemInstruction(roundFor(sub.round_id)),
      text: judgeInput({ submission: sub, brief, judgeNotes, transcript: transcripts[sub.team_id] || [], round }),
      schema: JUDGE_SCHEMA,
      thinkingLevel: 'low',
      maxOutputTokens: 4096
    });
    const result = parseJudgeOutput(text, sub.round_id);
    const total = await store.recordScores(sub.id, result.points, result.reasons, model, result.flagged);
    return { status: 'scored', total, model, ...result };
  } catch (error) {
    await store.markSubmission(sub.id, 'failed', error.message).catch(() => {});
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.busy ? 503 : 502, error.message);
  }
}

/** Host: check the Gemini key and which model answers. */
export async function testAi({ gemini, caller, models }) {
  if (caller?.role !== 'host') throw new ApiError(403, 'Only a host can test the AI connection.');
  try {
    const { text, model } = await callWithFallback(gemini, models, { system: 'Reply with exactly: OK', text: 'Connection test. Reply with exactly: OK', thinkingLevel: undefined, maxOutputTokens: 200 });
    return { ok: true, model, reply: text.trim().slice(0, 80) };
  } catch (error) {
    throw new ApiError(error.busy ? 503 : 502, error.message);
  }
}

/** One message to the fictional Round 2 chatbot. Teams' turns are stored as evidence. */
export async function chatTurn({ store, gemini, caller, message, engine = 'rules', chatModels = [] }) {
  if (!caller) throw new ApiError(401, 'Sign in first.');
  const text = String(message ?? '').trim();
  if (!text) throw new ApiError(400, 'Type a message first.');
  if (text.length > 1000) throw new ApiError(400, 'Keep each message under 1000 characters.');
  const settings = await store.getSettings();
  if (!settings?.ai_chatbot) throw new ApiError(409, 'The Round 2 chatbot is switched off by the host.');
  const cfg = await store.getChatConfig();
  const staff = isStaff(caller.role);
  const teamId = staff ? null : await store.teamOf(caller.id);
  if (!staff && !teamId) throw new ApiError(403, 'Your account is not linked to a team.');
  if (!staff) {
    const round = await store.getRound(2);
    if (!roundOpen(round)) throw new ApiError(409, 'The chatbot is available only while Round 2 is open.');
    const used = await store.countUserMessages(teamId);
    if (used >= cfg.max_messages_per_team) throw new ApiError(429, `Your team has used all ${cfg.max_messages_per_team} messages for this round.`);
  }
  let reply = null;
  let used = 'rules';
  if (engine === 'ai' && chatModels.length) {
    try {
      const history = teamId ? await store.getTranscript(teamId) : [];
      const res = await callWithFallback(gemini, chatModels, {
        system: chatbotSystemInstruction(cfg), text: chatbotInput(cfg, history, text), thinkingLevel: 'minimal', maxOutputTokens: 600
      });
      reply = res.text;
      used = 'ai';
    } catch { reply = null; /* busy or failing: the built-in bot answers so Round 2 never stalls */ }
  }
  if (!reply) reply = ruleBotReply(cfg, text);
  reply = reply.trim().slice(0, 3000);
  if (teamId) await store.addMessages([{ team_id: teamId, role: 'user', content: text, sent_by: caller.id }, { team_id: teamId, role: 'bot', content: reply }]);
  const count = teamId ? await store.countUserMessages(teamId) : 0;
  return { reply, engine: used, remaining: teamId ? Math.max(0, cfg.max_messages_per_team - count) : null, preview: !teamId };
}
