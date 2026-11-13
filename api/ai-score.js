// POST /api/ai-score  { submissionId }  — host re-runs the AI judge for one submission.
import { jsonHandler } from './_lib/http.js';
import { scoreSubmission } from './_lib/core.js';

export const config = { maxDuration: 60 };

export default jsonHandler(({ store, gemini, caller, body, judgeModels }) =>
  scoreSubmission({ store, gemini, caller, submissionId: Number(body.submissionId), models: judgeModels }));
