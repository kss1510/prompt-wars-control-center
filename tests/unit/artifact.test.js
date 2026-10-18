import test from 'node:test';
import assert from 'node:assert/strict';
import { checkArtifact, previewDocument, MAX_ARTIFACT_CHARS } from '../../src/lib/artifactCheck.js';
import { autoChecks, planChange, wordCount } from '../../src/lib/autoChecks.js';

const GOOD = `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Timer</title>
<style>.t{color:red}</style></head>
<body><ul><li>one<li>two</ul><p>Text<br><img src="a.png" alt="">
<button onclick="start()">Start</button>
<script>function start(){ const s = { a: 1 }; console.log(s); }</script>
</body></html>`;

test('a valid single-file app passes the checker (optional end tags and void elements are fine)', () => {
  const r = checkArtifact(GOOD);
  assert.equal(r.ok, true);
  assert.equal(r.summary, 'No problems found.');
  assert.deepEqual(r.stats.scripts, 1);
});

test('the checker explains broken HTML, CSS and JavaScript with correct line numbers', () => {
  const bad = ['<!DOCTYPE html>', '<html><head><title>x</title>', '<style>.a { color: red; </style>', '</head><body>',
    '<div><span>hi</div>', '<button onclick="go(">Go</button>', '<script>', 'function go() {', '  console.log("x"', '}', '</script>', '</section>', '</body></html>'].join('\n');
  const r = checkArtifact(bad);
  const errors = r.issues.filter(i => i.level === 'error').map(i => [i.line, i.message]);
  assert.equal(r.ok, false);
  assert.ok(errors.some(([l, m]) => l === 3 && /CSS: the \{ on line 3/.test(m)));
  assert.ok(errors.some(([l, m]) => l === 5 && /<span>.*not closed before <\/div>/.test(m)));
  assert.ok(errors.some(([l, m]) => l === 6 && /onclick/.test(m)));
  assert.ok(errors.some(([l, m]) => l === 10 && /^JavaScript:/.test(m)));
  assert.ok(errors.some(([l, m]) => l === 12 && /<\/section> closes a tag that was never opened/.test(m)));
});

test('checker flags never-closed tags, offline risks, empty input and oversize files', () => {
  assert.match(checkArtifact('<!DOCTYPE html><title>x</title><div>open').issues[0].message, /<div> opened on line 1 is never closed/);
  assert.ok(checkArtifact('<!DOCTYPE html><title>x</title><script src="https://cdn.example/x.js"></script>').issues.some(i => i.level === 'warning' && /offline/.test(i.message)));
  assert.equal(checkArtifact('   ').ok, false);
  assert.match(checkArtifact('x'.repeat(MAX_ARTIFACT_CHARS + 1)).issues[0].message, /the limit is 3[0,]+/);
  assert.ok(checkArtifact('<div></div>').issues.some(i => /DOCTYPE/.test(i.message)));
  assert.equal(checkArtifact('<!DOCTYPE html><title>m</title><script type="module">import x from "./a.js"; export default x;</script>').ok, true, 'module scripts parse as modules');
});

test('preview injects an in-memory storage shim inside <head>, keeping the doctype first', () => {
  const out = previewDocument(GOOD);
  assert.ok(out.startsWith('<!DOCTYPE html>'));
  assert.ok(out.indexOf('localStorage') > out.indexOf('<head>'));
  assert.ok(previewDocument('<p>hi</p>').startsWith('<script>'));
});

test('auto-checks give judges advisory facts per round', () => {
  const subs = [
    { id: 1, round_id: 1, status: 'Submitted', title: 't', prompt_text: 'Write a haiku', output_text: 'rain falls' },
    { id: 2, round_id: 1, status: 'Submitted', title: 't', prompt_text: 'Please write me a long haiku about rain', output_text: 'x' }
  ];
  const r1 = autoChecks(subs[0], subs);
  assert.match(r1.find(f => f.label === 'Prompt length').value, /3 words · 13 characters · 1st shortest of 2/);
  assert.equal(r1.find(f => f.label === 'Deliverables').tone, 'ok');

  const r3 = autoChecks({ round_id: 3, title: 't', prompt_text: 'p', output_text: 'o', artifact_filename: 'a.html', demo_details: 'seat', artifact_html: GOOD }, []);
  assert.equal(r3.find(f => f.label === 'HTML checker').tone, 'ok');
  assert.equal(r3.find(f => f.label === 'Local demo').tone, 'warn');

  const same = autoChecks({ round_id: 4, title: 't', prompt_text: 'p', initial_plan: 'evacuate block A by stairs', revised_plan: 'evacuate block A by stairs', risks_mitigation: 'a\nb' }, []);
  assert.match(same.find(f => f.label === 'Adaptation').value, /may not reflect the surprise update/);
  const late = autoChecks({ ...subs[0], created_at: '2026-10-23T10:10:00Z' }, subs, { closes_at: '2026-10-23T10:00:00Z' });
  assert.match(late.find(f => f.label === 'Timing').value, /10 min after the deadline/);
  assert.equal(wordCount('  '), 0);
  assert.equal(planChange('a b', 'a b c d'), 0.5);
});
