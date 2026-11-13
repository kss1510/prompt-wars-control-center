// POST /api/ai-test  {}  — host checks the Gemini key and which model answers.
import { jsonHandler } from './_lib/http.js';
import { testAi } from './_lib/core.js';

export const config = { maxDuration: 30 };

export default jsonHandler(({ gemini, caller, judgeModels }) => testAi({ gemini, caller, models: judgeModels }));
