// Minimal Gemini client for the Interactions API (POST /v1beta/interactions, key in x-goog-api-key).
// Stateless: store=false and a single user step per call. Server-side only — never import in the browser.
// Free-tier limits seen on the organizers' project (Nov 2026): 3.8 Flash 5 RPM / 20 RPD (and >20 s to answer
// in the live test, so it is the last backup);
// 3.5 and 3.1 Flash-Lite 15 RPM / 500 RPD each. Models are tried in order (see core.callWithFallback).
// Fast models first: 3.1 Flash-Lite answered the live connection test in about 1 s.
export const DEFAULT_JUDGE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
export const DEFAULT_CHAT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
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
  const t0 = Date.now();
  const log = outcome => { try { console.log(`[gemini] ${model} ${outcome} ${Date.now() - t0}ms`); } catch { /* logging never breaks a call */ } };
  let res;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, 'Api-Revision': '2026-05-20' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    log(error?.name === 'AbortError' ? 'timeout' : 'network-error');
    throw new GeminiError(error?.name === 'AbortError' ? `took longer than ${Math.round(timeoutMs / 1000)} s` : 'could not reach the AI service', { busy: true });
  } finally {
    clearTimeout(timer);
  }
  log(`http-${res.status}`);
  if (res.status === 429) throw new GeminiError('The AI is busy (free-tier rate limit). It will be retried shortly.', { status: 429, busy: true });
  if (res.status >= 500) throw new GeminiError(`The AI service had a temporary problem (${res.status}).`, { status: res.status, busy: true });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new GeminiError(`The AI request was refused (${res.status}): ${data?.error?.message || 'unknown error'}`, { status: res.status });
  if (data?.status && !['completed', 'incomplete'].includes(data.status)) throw new GeminiError(`The AI did not finish (status: ${data.status}).`, { busy: true });
  const out = interactionText(data);
  if (!out) throw new GeminiError('The AI returned an empty answer.', { busy: true });
  return out;
}
