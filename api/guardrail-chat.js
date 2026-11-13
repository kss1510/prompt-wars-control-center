// POST /api/guardrail-chat  { message }  — one turn with the fictional Round 2 chatbot.
// Built-in rule-based bot by default; set CHATBOT_ENGINE=ai to use Gemini (rule bot answers when busy).
import { jsonHandler } from './_lib/http.js';
import { chatTurn } from './_lib/core.js';

export const config = { maxDuration: 30 };

export default jsonHandler(({ store, gemini, caller, body, chatModels, chatEngine }) =>
  chatTurn({ store, gemini, caller, message: body.message, engine: chatEngine, chatModels }));
