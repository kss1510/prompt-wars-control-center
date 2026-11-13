// Shared Vercel handler plumbing: POST-only JSON, bearer token, consistent errors.
import { ApiError } from './core.js';
import { createStore } from './store.js';
import { callGemini, DEFAULT_CHAT_MODEL, DEFAULT_JUDGE_MODEL } from './gemini.js';

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
        judgeModel: env.GEMINI_JUDGE_MODEL || DEFAULT_JUDGE_MODEL,
        chatModel: env.GEMINI_CHAT_MODEL || DEFAULT_CHAT_MODEL
      });
      res.status(200).json(result);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 500) console.error(error);
      res.status(status).json({ error: status === 500 ? `Server error: ${error.message}` : error.message });
    }
  };
}
