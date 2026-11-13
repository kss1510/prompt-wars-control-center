// POST /api/ai-score-round  { roundId }  — the AI judge scores the next batch of a CLOSED round.
// The host's open portal calls this repeatedly until { remaining: 0 }.
import { jsonHandler } from './_lib/http.js';
import { scoreRound } from './_lib/core.js';

export const config = { maxDuration: 60 };

export default jsonHandler(({ store, gemini, caller, body, judgeModels }) =>
  scoreRound({ store, gemini, caller, roundId: Number(body.roundId), models: judgeModels }));
