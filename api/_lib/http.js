// Shared Vercel handler plumbing: POST-only JSON, bearer token, consistent errors.
import { ApiError } from './core.js';
import { createStore } from './store.js';
import { callGemini, DEFAULT_CHAT_MODELS, DEFAULT_JUDGE_MODELS } from './gemini.js';

const list = (value, fallback) => (value ? String(value).split(',').map(s => s.trim()).filter(Boolean) : fallback);

export function jsonHandler(run) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
    try {
      const env = process.env;
      const store = createStore(env);
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const caller = await store.getCaller(token);
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const gemini = opts => callGemini({ apiKey: env.GEMINI_API_KEY, ...opts });
      const result = await run({
        store, gemini, caller, body,
        judgeModels: list(env.GEMINI_JUDGE_MODELS || env.GEMINI_JUDGE_MODEL, DEFAULT_JUDGE_MODELS),
        chatModels: list(env.GEMINI_CHAT_MODELS || env.GEMINI_CHAT_MODEL, DEFAULT_CHAT_MODELS),
        chatEngine: env.CHATBOT_ENGINE === 'ai' ? 'ai' : 'rules'
      });
      res.status(200).json(result);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 500) console.error(error);
      res.status(status).json({ error: status === 500 ? `Server error: ${error.message}` : error.message });
    }
  };
}
