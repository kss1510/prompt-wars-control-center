// Pure event rules shared by the UI and demo mode. The database enforces the same rules
// independently (supabase/migrations/20261017090000_event_readiness.sql) — these exist for
// fast, friendly feedback, never as the security boundary.
import { ROUNDS } from '../data.js';

export const roundFor = id => ROUNDS.find(r => r.id === Number(id));
const hasText = v => typeof v === 'string' && v.trim().length > 0;

/** Messages for missing/invalid deliverables (mirrors public.check_submission_deliverables). */
export function missingDeliverables(roundId, s) {
  const out = [];
  const round = roundFor(roundId);
  if (!round) return ['Unknown round.'];
  if (!hasText(s.title)) out.push('Add a submission title.');
  for (const f of round.fields) {
    if (f.required && !hasText(s[f.key])) out.push(`${f.label} is required.`);
  }
  if (hasText(s.evidence_url)) {
    if (!/^https?:\/\//i.test(s.evidence_url.trim())) out.push('Evidence link must start with http:// or https://.');
    else if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(s.evidence_url.trim()))
      out.push('A localhost link only works on your own laptop. Put it in the local demo details instead.');
  }
  return out;
}

/**
 * Platform options for one team in one round.
 * selections: [{team_id, round_id, platform_id}] for that team (others are ignored).
 * Returns each active platform with `usedIn` (another round number or null) plus a summary message.
 */
export function platformOptions(platforms, selections, teamId, roundId) {
  const mine = selections.filter(s => s.team_id === teamId);
  const current = mine.find(s => s.round_id === roundId)?.platform_id ?? null;
  const options = platforms
    .filter(p => p.is_active || p.id === current)
    .map(p => {
      const used = mine.find(s => s.platform_id === p.id && s.round_id !== roundId);
      return { ...p, usedIn: used ? used.round_id : null, selected: p.id === current };
    });
  const available = options.filter(o => o.usedIn === null && o.is_active);
  let message = null;
  if (!available.length) message = 'No approved AI platform is left for your team in this round. Ask the host — the approved list may need another platform.';
  else if (available.length === 1 && !current) message = `Only ${available[0].name} is still available to your team, so it must be used in this round.`;
  return { options, available, current, message };
}

/** Error message if a team may not declare this platform for this round, else null. */
export function platformChoiceError({ platforms, selections, submissions = [], teamId, roundId, platformId, roundOpenOrUpcoming = true }) {
  if (!teamId) return 'You are not assigned to a team yet. Ask the event host.';
  if (!roundOpenOrUpcoming) return `Round ${roundId} is closed. Its AI platform can no longer be changed.`;
  const platform = platforms.find(p => p.id === platformId && p.is_active);
  if (!platform) return 'That AI platform is not on the approved list.';
  const used = selections.find(s => s.team_id === teamId && s.platform_id === platformId && s.round_id !== roundId);
  if (used) return `Your team already used ${platform.name} in Round ${used.round_id}. Each round needs a different AI platform.`;
  const current = selections.find(s => s.team_id === teamId && s.round_id === roundId)?.platform_id;
  const active = submissions.some(s => s.team_id === teamId && s.round_id === roundId && s.status !== 'Rejected');
  if (current && current !== platformId && active) return `Your team already submitted Round ${roundId} with its current platform. Ask a host if it must be corrected.`;
  return null;
}

/** True when every round of every team uses distinct platforms (data integrity check). */
export function duplicatePlatformTeams(selections) {
  const seen = new Map();
  const dupes = new Set();
  for (const s of selections) {
    const key = `${s.team_id}:${s.platform_id}`;
    if (seen.has(key)) dupes.add(s.team_id);
    seen.set(key, true);
  }
  return [...dupes];
}

/** Error for a criterion score list, else null (mirrors validate_score_rubric/save_scores). */
export function scoreError(roundId, points) {
  const round = roundFor(roundId);
  if (!round) return 'Unknown round.';
  if (points.length !== round.criteria.length) return `This round needs exactly ${round.criteria.length} criterion scores.`;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const c = round.criteria[i];
    if (p === '' || p === null || p === undefined || !Number.isInteger(Number(p))) return `Enter a whole number for “${c.name}”.`;
    if (Number(p) < 0 || Number(p) > c.max) return `“${c.name}” must be between 0 and ${c.max}.`;
  }
  return null;
}

export const isRoundAccepting = (round, now = Date.now()) =>
  Boolean(round) && round.status === 'open' && (!round.closes_at || now < new Date(round.closes_at).getTime());
export const isRoundClosed = (round, now = Date.now()) =>
  Boolean(round) && (round.status === 'closed' || (round.closes_at && now >= new Date(round.closes_at).getTime()));

/** Team-size problems against the configured limits. */
export function teamSizeIssues(teams, memberships, min, max) {
  return teams.map(t => ({ team: t, size: memberships.filter(m => m.team_id === t.id).length }))
    .filter(x => x.size < min || x.size > max)
    .map(x => ({ ...x, message: `${x.team.name} has ${x.size} member${x.size === 1 ? '' : 's'} (needs ${min}–${max}).` }));
}

/**
 * Leaderboard from authoritative per-round rows ({team_id, round_id, points, scored}).
 * Equal totals share a rank and are flagged as tied — no invented tie-break is applied.
 */
export function buildLeaderboard(teams, roundRows) {
  const rows = teams.map(t => {
    const mine = roundRows.filter(r => r.team_id === t.id);
    const rounds = Object.fromEntries(ROUNDS.map(r => [r.id, Number(mine.find(x => x.round_id === r.id)?.points || 0)]));
    return {
      ...t,
      rounds,
      score: Object.values(rounds).reduce((a, b) => a + b, 0),
      scored: mine.filter(x => x.scored).length
    };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  rows.forEach((row, i) => {
    row.rank = i > 0 && rows[i - 1].score === row.score ? rows[i - 1].rank : i + 1;
  });
  rows.forEach(row => { row.tied = rows.filter(r => r.score === row.score).length > 1 && row.score > 0; });
  return rows;
}

/** Event window vs. challenge time (all minutes). */
export function eventTiming(settings, rounds) {
  const windowMinutes = Math.round((new Date(settings.ends_at) - new Date(settings.starts_at)) / 60000);
  const challengeMinutes = rounds.reduce((n, r) => n + Number(r.duration_minutes ?? r.minutes ?? 0), 0);
  return { windowMinutes, challengeMinutes, bufferMinutes: windowMinutes - challengeMinutes };
}

/** Host readiness checklist. Each item: {ok, label, detail}. */
export function readinessChecks({ settings, platforms, teams, memberships, profiles, rounds }) {
  const active = platforms.filter(p => p.is_active);
  const sizeIssues = teamSizeIssues(teams, memberships, settings.team_min_size, settings.team_max_size);
  const students = profiles.filter(p => p.role === 'student');
  const unassigned = students.filter(p => !memberships.some(m => m.user_id === p.id));
  const timing = eventTiming(settings, rounds);
  return [
    { ok: active.length >= ROUNDS.length, label: `At least ${ROUNDS.length} approved AI platforms`,
      detail: `${active.length} active (${active.map(p => p.name).join(', ') || 'none'}). Each team needs a different platform in every round.` },
    { ok: teams.length > 0 && !sizeIssues.length, label: `Every team has ${settings.team_min_size}–${settings.team_max_size} members`,
      detail: teams.length ? (sizeIssues.map(i => i.message).join(' ') || `${teams.length} teams ready.`) : 'No teams yet.' },
    { ok: !unassigned.length, label: 'Every registered student is on a team',
      detail: unassigned.length ? `${unassigned.length} unassigned: ${unassigned.slice(0, 5).map(p => p.full_name || p.email).join(', ')}${unassigned.length > 5 ? '…' : ''}` : `${students.length} students assigned.` },
    { ok: settings.teams_locked, label: 'Teams finalized', detail: settings.teams_locked ? 'Membership is frozen.' : 'Lock teams before Round 1 starts.' },
    { ok: profiles.some(p => p.role === 'judge' || p.role === 'host'), label: 'Judges assigned', detail: `${profiles.filter(p => p.role === 'judge').length} judge account(s).` },
    { ok: timing.bufferMinutes >= 0, label: 'Round durations fit the event window',
      detail: `${timing.challengeMinutes} challenge minutes in a ${timing.windowMinutes}-minute window (${timing.bufferMinutes} min for briefing, transitions, judging and results).` },
    { ok: Boolean(settings.tie_break_rule), label: 'Tie-break rule confirmed', detail: settings.tie_break_rule || 'Not set — organizers must decide before announcing winners.' }
  ];
}

export const csvCell = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
export const toCsv = rows => rows.map(row => row.map(csvCell).join(',')).join('\r\n');

/** Parse "email,team[,captain]" lines (header optional) into roster rows. */
export function parseRosterCsv(text) {
  const rows = [];
  const errors = [];
  text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach((line, i) => {
    const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (i === 0 && /email/i.test(cells[0])) return;
    const [email, team, captain] = cells;
    if (!email || !team) { errors.push(`Line ${i + 1}: expected "email,team[,captain]".`); return; }
    rows.push({ email: email.toLowerCase(), team, captain: /^(y|yes|true|1|captain)$/i.test(captain || '') });
  });
  return { rows, errors };
}
