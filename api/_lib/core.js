// Server logic for the AI judge and the Round 2 chatbot. Pure functions over a `store` (database
// access) and `gemini` (AI call) so they can be tested with fakes; the Vercel handlers wire them up.
import { roundFor } from '../../src/lib/rules.js';
import { JUDGE_SCHEMA, judgeSystemInstruction, judgeInput, parseJudgeOutput, chatbotSystemInstruction, chatbotInput } from '../../src/lib/aiJudge.js';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const isStaff = role => role === 'host' || role === 'judge';
const roundOpen = (round, now = Date.now()) =>
  Boolean(round) && round.status === 'open' && (!round.closes_at || now < new Date(round.closes_at).getTime());

/** Score one submission with the AI judge and record the result. */
export async function scoreSubmission({ store, gemini, caller, submissionId, force = false, judgeModel }) {
  if (!caller) throw new ApiError(401, 'Sign in first.');
  const sub = await store.getSubmission(submissionId);
  if (!sub) throw new ApiError(404, 'Submission not found.');
  const staff = isStaff(caller.role);
  if (!staff && !(await store.isTeamMember(sub.team_id, caller.id))) throw new ApiError(403, 'You can only request scoring for your own team.');
  const settings = await store.getSettings();
  if (!settings?.ai_judging) throw new ApiError(409, 'AI judging is switched off by the host.');
  if (sub.status === 'Rejected') throw new ApiError(409, 'Rejected submissions are not scored.');
  if (sub.ai_status === 'scored' && !(force && caller.role === 'host')) return { status: 'already-scored' };
  if (sub.ai_status === 'scoring' && !force && Date.now() - new Date(sub.updated_at).getTime() < 90_000) return { status: 'in-progress' };

  await store.markSubmission(sub.id, 'scoring', null);
  try {
    const [round, brief, judgeNotes, transcript] = await Promise.all([
      store.getRound(sub.round_id), store.getBrief(sub.round_id), store.getJudgeNotes(sub.round_id),
      sub.round_id === 2 ? store.getTranscript(sub.team_id) : Promise.resolve([])
    ]);
    const text = await gemini({
      model: judgeModel,
      system: judgeSystemInstruction(roundFor(sub.round_id)),
      text: judgeInput({ submission: sub, brief, judgeNotes, transcript, round }),
      schema: JUDGE_SCHEMA,
      thinkingLevel: 'low',
      maxOutputTokens: 4096
    });
    const result = parseJudgeOutput(text, sub.round_id);
    const total = await store.recordScores(sub.id, result.points, result.reasons, judgeModel, result.flagged);
    return { status: 'scored', total, ...result };
  } catch (error) {
    await store.markSubmission(sub.id, 'failed', error.message).catch(() => {});
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.busy ? 503 : 502, error.message);
  }
}

/** One message to the fictional Round 2 chatbot. Teams' turns are stored as evidence. */
export async function chatTurn({ store, gemini, caller, message, chatModel }) {
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
  const history = teamId ? await store.getTranscript(teamId) : [];
  let reply;
  try {
    reply = await gemini({
      model: chatModel,
      system: chatbotSystemInstruction(cfg),
      text: chatbotInput(cfg, history, text),
      thinkingLevel: 'minimal',
      maxOutputTokens: 600
    });
  } catch (error) {
    throw new ApiError(error.busy ? 503 : 502, error.busy ? `${cfg.bot_name} is busy right now — wait a few seconds and send again.` : error.message);
  }
  reply = reply.trim().slice(0, 3000);
  if (teamId) await store.addMessages([{ team_id: teamId, role: 'user', content: text, sent_by: caller.id }, { team_id: teamId, role: 'bot', content: reply }]);
  const used = teamId ? await store.countUserMessages(teamId) : 0;
  return { reply, remaining: teamId ? Math.max(0, cfg.max_messages_per_team - used) : null, preview: !teamId };
}
