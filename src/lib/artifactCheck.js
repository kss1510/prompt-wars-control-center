// Round 3 (Artifact Forge) checker: reads a single-file HTML app and explains problems in plain
// language. It is deterministic and uses no AI, so it does not count as an extra AI platform.
import { parse } from 'acorn';

export const MAX_ARTIFACT_CHARS = 300000;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
// HTML lets these end tags be omitted, so a missing one is not an error.
const OPTIONAL_END = new Set(['p', 'li', 'dt', 'dd', 'option', 'optgroup', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'colgroup', 'caption', 'rt', 'rp', 'html', 'head', 'body']);
const JS_TYPES = /^(|text\/javascript|application\/javascript|module|text\/babel-ignored)$/i;
const TOKEN = /<!--[\s\S]*?-->|<(script|style)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi;

const attr = (attrs, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs || '');
  return m ? (m[2] ?? m[3] ?? m[4]) : null;
};

/** Check an HTML document. Returns { ok, issues: [{level, line, message}], stats, summary }. */
export function checkArtifact(html) {
  const issues = [];
  const add = (level, line, message) => issues.push({ level, line, message });
  const source = typeof html === 'string' ? html : '';
  if (!source.trim()) return finish([{ level: 'error', line: null, message: 'Paste your HTML (or load your .html file) first.' }], source, 0, 0);
  if (source.length > MAX_ARTIFACT_CHARS) add('error', null, `The file is ${source.length.toLocaleString()} characters; the limit is ${MAX_ARTIFACT_CHARS.toLocaleString()}. Remove embedded images or unused code.`);

  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  const lineAt = idx => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };

  const stack = [];
  let scripts = 0, styles = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(source))) {
    const at = m.index;
    const line = lineAt(at);
    if (m[0].startsWith('<!--') || /^<!doctype/i.test(m[0])) continue;
    if (m[1]) {
      const kind = m[1].toLowerCase();
      const body = m[3];
      const bodyLine = lineAt(at + m[0].indexOf('>') + 1);
      if (kind === 'script') {
        scripts++;
        const src = attr(m[2], 'src');
        if (src) {
          if (/^https?:\/\//i.test(src)) add('warning', line, `Loads ${src} from the internet. It will fail if the demo laptop is offline.`);
          if (body.trim()) add('warning', line, 'A <script> with src="…" ignores the code written inside it.');
          continue;
        }
        const type = (attr(m[2], 'type') || '').trim();
        if (!JS_TYPES.test(type)) continue;
        checkJs(body, bodyLine, type.toLowerCase() === 'module', add);
      } else {
        styles++;
        checkCss(body, bodyLine, add);
      }
      continue;
    }
    if (m[4]) {
      const name = m[4].toLowerCase();
      const idx = stack.map(s => s.name).lastIndexOf(name);
      if (idx === -1) {
        if (!VOID.has(name)) add('error', line, `</${name}> closes a tag that was never opened. Remove it, or add the missing <${name}> earlier.`);
        continue;
      }
      for (const open of stack.splice(idx).slice(1)) {
        if (!OPTIONAL_END.has(open.name)) add('error', open.line, `<${open.name}> (line ${open.line}) is not closed before </${name}> on line ${line}. Add </${open.name}>.`);
      }
      continue;
    }
    if (m[5]) {
      const name = m[5].toLowerCase();
      checkHandlers(m[6], line, add);
      if (name === 'link' && /stylesheet/i.test(attr(m[6], 'rel') || '') && /^https?:\/\//i.test(attr(m[6], 'href') || '')) {
        add('warning', line, `Loads a stylesheet from ${attr(m[6], 'href')}. It will not load if the demo laptop is offline.`);
      }
      if (name === 'script' || name === 'style') { add('error', line, `<${name}> is never closed. Add </${name}>.`); continue; }
      if (!VOID.has(name) && !m[7]) stack.push({ name, line });
    }
  }
  if (/<!--(?![\s\S]*?-->)/.test(source)) add('error', lineAt(source.lastIndexOf('<!--')), 'An HTML comment <!-- is never closed with -->, which hides everything after it.');
  for (const open of stack) if (!OPTIONAL_END.has(open.name)) add('error', open.line, `<${open.name}> opened on line ${open.line} is never closed. Add </${open.name}> where that section should end.`);

  if (!/^\s*<!doctype html>/i.test(source)) add('warning', 1, 'Start the file with <!DOCTYPE html> so browsers use standards mode.');
  if (!/<title\b/i.test(source)) add('info', null, 'Add a <title> so the browser tab shows your app’s name.');
  if (!/<meta[^>]+name\s*=\s*["']?viewport/i.test(source)) add('info', null, 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> so it works on phones.');
  return finish(issues, source, scripts, styles);
}

function checkJs(code, firstLine, isModule, add) {
  if (!code.trim()) return;
  try { parse(code, { ecmaVersion: 'latest', sourceType: isModule ? 'module' : 'script', allowHashBang: true }); }
  catch (error) {
    const line = firstLine + (error.loc?.line ?? 1) - 1;
    add('error', line, `JavaScript: ${error.message.replace(/\s*\(\d+:\d+\)$/, '')}. Check line ${line} and the line just before it (missing bracket, quote or comma?).`);
  }
}

function checkHandlers(attrs, line, add) {
  const re = /\bon([a-z]+)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = re.exec(attrs || ''))) {
    const code = m[3] ?? m[4];
    try { parse(`(function(event){\n${code}\n})`, { ecmaVersion: 'latest' }); }
    catch (error) { add('error', line, `JavaScript in on${m[1]}="…": ${error.message.replace(/\s*\(\d+:\d+\)$/, '')}.`); }
  }
}

function checkCss(css, firstLine, add) {
  const open = [];
  let line = firstLine;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '\n') { line++; continue; }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end === -1) { add('error', line, 'A CSS comment /* is never closed with */.'); return; }
      line += (css.slice(i, end).match(/\n/g) || []).length;
      i = end + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = css.indexOf(c, i + 1);
      if (end === -1) { add('error', line, 'A CSS string is missing its closing quote.'); return; }
      i = end;
      continue;
    }
    if (c === '{') open.push(line);
    if (c === '}') { if (!open.length) add('error', line, 'CSS: there is an extra } with no matching {.'); else open.pop(); }
  }
  for (const l of open) add('error', l, `CSS: the { on line ${l} is never closed with }.`);
}

function finish(issues, source, scripts, styles) {
  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level] || (a.line ?? 1e9) - (b.line ?? 1e9));
  const errors = issues.filter(i => i.level === 'error').length;
  const warnings = issues.filter(i => i.level === 'warning').length;
  return {
    ok: errors === 0,
    issues,
    stats: { characters: source.length, lines: source ? source.split('\n').length : 0, scripts, styles },
    summary: errors ? `${errors} problem${errors > 1 ? 's' : ''} to fix${warnings ? `, ${warnings} warning${warnings > 1 ? 's' : ''}` : ''}.`
      : warnings ? `No errors found. ${warnings} warning${warnings > 1 ? 's' : ''} worth a look.` : 'No problems found.'
  };
}

/**
 * Prepare HTML for the sandboxed preview. The iframe has no same-origin access (so a team's code
 * can never read the portal's session), which makes localStorage throw; give the app an in-memory
 * stand-in instead so common "save to localStorage" apps still run.
 */
export function previewDocument(html) {
  const shim = '<script>(function(){function S(){var d={};return{getItem:function(k){return k in d?d[k]:null},setItem:function(k,v){d[k]=String(v)},removeItem:function(k){delete d[k]},clear:function(){d={}},key:function(i){return Object.keys(d)[i]||null},get length(){return Object.keys(d).length}}}["localStorage","sessionStorage"].forEach(function(n){try{window[n].length}catch(e){Object.defineProperty(window,n,{value:S(),configurable:true})}})})();</script>';
  const source = html || '';
  const head = /<head\b[^>]*>/i.exec(source);
  if (head) return source.slice(0, head.index + head[0].length) + shim + source.slice(head.index + head[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(source);
  if (doctype) return doctype[0] + shim + source.slice(doctype[0].length);
  return shim + source;
}
