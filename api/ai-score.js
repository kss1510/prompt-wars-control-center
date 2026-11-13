// POST /api/ai-score  { submissionId, force? }  — the AI judge scores one submission.
import { jsonHandler } from './_lib/http.js';
import { scoreSubmission } from './_lib/core.js';

export const config = { maxDuration: 60 };

export default jsonHandler(({ store, gemini, caller, body, judgeModel }) =>
  scoreSubmission({ store, gemini, caller, submissionId: Number(body.submissionId), force: Boolean(body.force), judgeModel }));
