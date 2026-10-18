// Advisory facts shown to judges next to the rubric. They never set a score: judges decide.
import { missingDeliverables } from './rules.js';
import { checkArtifact } from './artifactCheck.js';

export const wordCount = text => (text || '').trim() ? text.trim().split(/\s+/).length : 0;
const nonEmptyLines = text => (text || '').split(/\r?\n/).filter(l => l.trim()).length;
const wordSet = text => new Set((text || '').toLowerCase().match(/[a-z0-9]+/g) || []);
const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`;

/** Share of words in the revised plan that are new compared with the initial plan (0–1). */
export function planChange(initial, revised) {
  const a = wordSet(initial), b = wordSet(revised);
  if (!b.size) return 0;
  let fresh = 0;
  for (const w of b) if (!a.has(w)) fresh++;
  return fresh / b.size;
}

/**
 * Facts for one submission. `others` = all submissions the judge can see (for comparisons),
 * `round` = live round row (for the deadline). Each fact: { label, value, tone: 'ok'|'warn'|'info' }.
 */
export function autoChecks(sub, others = [], round = null) {
  const facts = [];
  const missing = missingDeliverables(sub.round_id, sub);
  facts.push(missing.length
    ? { label: 'Deliverables', value: missing.join(' '), tone: 'warn' }
    : { label: 'Deliverables', value: 'All required parts present', tone: 'ok' });
  if (round?.closes_at && sub.created_at) {
    const mins = Math.round((new Date(round.closes_at) - new Date(sub.created_at)) / 60000);
    facts.push(mins >= 0
      ? { label: 'Timing', value: `Submitted ${mins} min before the deadline`, tone: 'info' }
      : { label: 'Timing', value: `Submitted ${-mins} min after the deadline (host entry)`, tone: 'warn' });
  }

  if (sub.round_id === 1) {
    const peers = others.filter(s => s.round_id === 1 && s.status !== 'Rejected');
    const len = (sub.prompt_text || '').trim().length;
    const rank = peers.filter(s => (s.prompt_text || '').trim().length < len).length + 1;
    facts.push({ label: 'Prompt length', value: `${wordCount(sub.prompt_text)} words · ${len} characters${peers.length > 1 ? ` · ${ordinal(rank)} shortest of ${peers.length}` : ''}`, tone: 'info' });
    facts.push({ label: 'Output length', value: `${wordCount(sub.output_text)} words`, tone: 'info' });
  }
  if (sub.round_id === 2) {
    const tests = nonEmptyLines(sub.prompt_text);
    const analysis = wordCount(sub.analysis_text);
    facts.push({ label: 'Test cases', value: `${tests} line${tests === 1 ? '' : 's'} of test prompts · ${nonEmptyLines(sub.output_text)} lines of responses`, tone: tests < 2 ? 'warn' : 'info' });
    facts.push({ label: 'Analysis', value: `${analysis} words${analysis < 40 ? ' — very short for “evidence and explanation”' : ''}`, tone: analysis < 40 ? 'warn' : 'info' });
  }
  if (sub.round_id === 3) {
    if (sub.artifact_html) {
      const result = checkArtifact(sub.artifact_html);
      facts.push({ label: 'HTML checker', value: `${result.summary} (${result.stats.lines} lines)`, tone: result.ok ? 'ok' : 'warn' });
    } else facts.push({ label: 'HTML file', value: 'Not attached — verify the app at the team’s laptop', tone: 'warn' });
    facts.push({ label: 'Local demo', value: sub.demo_verified ? 'Verified by a judge' : 'Not verified yet', tone: sub.demo_verified ? 'ok' : 'warn' });
  }
  if (sub.round_id === 4) {
    const change = planChange(sub.initial_plan, sub.revised_plan);
    facts.push({ label: 'Plans', value: `Initial ${wordCount(sub.initial_plan)} words · revised ${wordCount(sub.revised_plan)} words`, tone: 'info' });
    facts.push({ label: 'Adaptation', value: `${Math.round(change * 100)}% of the revised plan’s words are new${change < 0.15 ? ' — may not reflect the surprise update' : ''}`, tone: change < 0.15 ? 'warn' : 'info' });
    facts.push({ label: 'Risks', value: `${nonEmptyLines(sub.risks_mitigation)} risk/mitigation line(s)`, tone: 'info' });
  }
  return facts;
}
