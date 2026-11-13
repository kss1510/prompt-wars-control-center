// Minimal Gemini client for the Interactions API (POST /v1beta/interactions, key in x-goog-api-key).
// Stateless: store=false and a single user step per call. Server-side only — never import in the browser.
export const DEFAULT_JUDGE_MODEL = 'gemini-3.8-flash';
export const DEFAULT_CHAT_MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export class GeminiError extends Error {
  constructor(message, { status = 0, busy = false } = {}) {
    super(message);
    this.status = status;
    this.busy = busy;
  }
}

/** Text of the last model_output step (the raw REST shape: steps[].content[].text). */
export function interactionText(body) {
  const steps = Array.isArray(body?.steps) ? body.steps : [];
  const outputs = steps.filter(s => s?.type === 'model_output');
  const last = outputs[outputs.length - 1];
  const parts = Array.isArray(last?.content) ? last.content : typeof last?.content === 'string' ? [{ type: 'text', text: last.content }] : [];
  return parts.filter(p => p?.type === 'text' && typeof p.text === 'string').map(p => p.text).join('');
}

export async function callGemini({ apiKey, model, system, text, schema, thinkingLevel, maxOutputTokens = 2048, fetchImpl = fetch, timeoutMs = 45000 }) {
  if (!apiKey) throw new GeminiError('The AI is not set up yet: GEMINI_API_KEY is missing on the server.', { status: 500 });
  const body = {
    model,
    store: false,
    system_instruction: system,
    input: [{ type: 'user_input', content: [{ type: 'text', text }] }],
    generation_config: { max_output_tokens: maxOutputTokens, ...(thinkingLevel ? { thinking_level: thinkingLevel } : {}) },
    ...(schema ? { response_format: { type: 'text', mime_type: 'application/json', schema } } : {})
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, 'Api-Revision': '2026-05-20' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    throw new GeminiError(error?.name === 'AbortError' ? 'The AI took too long to answer.' : 'Could not reach the AI service.', { busy: true });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new GeminiError('The AI is busy (free-tier rate limit). It will be retried shortly.', { status: 429, busy: true });
  if (res.status >= 500) throw new GeminiError(`The AI service had a temporary problem (${res.status}).`, { status: res.status, busy: true });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new GeminiError(`The AI request was refused (${res.status}): ${data?.error?.message || 'unknown error'}`, { status: res.status });
  if (data?.status && !['completed', 'incomplete'].includes(data.status)) throw new GeminiError(`The AI did not finish (status: ${data.status}).`, { busy: true });
  const out = interactionText(data);
  if (!out) throw new GeminiError('The AI returned an empty answer.', { busy: true });
  return out;
}
