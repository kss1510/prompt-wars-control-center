// POST /api/guardrail-chat  { message }  — one turn with the fictional Round 2 chatbot.
import { jsonHandler } from './_lib/http.js';
import { chatTurn } from './_lib/core.js';

export const config = { maxDuration: 30 };

export default jsonHandler(({ store, gemini, caller, body, chatModel }) =>
  chatTurn({ store, gemini, caller, message: body.message, chatModel }));
