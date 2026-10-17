// DEMO MODE ONLY (npm run dev:demo). Sample data lives in this browser's localStorage and never
// touches Supabase. Personas replace sign-in, so there is NO real authorization here — the
// rules below mirror the database so rehearsals behave like the real event, nothing more.
import { ROUNDS, EVENT_DEFAULTS, SUBMISSION_FIELDS } from '../data.js';
import { missingDeliverables, platformChoiceError, scoreError, isRoundAccepting, isRoundClosed, teamSizeIssues, roundFor } from './rules.js';

const KEY = 'pw-demo-v1';
const now = () => new Date().toISOString();
const persona = (id, full_name, role) => ({ id, full_name, email: `${id}@demo.local`, role });

function seed() {
  const profiles = [
    persona('demo-host', 'Demo Host', 'host'),
    persona('demo-judge', 'Demo Judge', 'judge'),
    ...['Asha', 'Bilal', 'Chitra', 'Dev'].map((n, i) => persona(`demo-nova-${i + 1}`, `${n} (demo)`, 'student')),
    ...['Esha', 'Farhan', 'Gauri', 'Hari', 'Isha'].map((n, i) => persona(`demo-orbit-${i + 1}`, `${n} (demo)`, 'student')),
    persona('demo-unassigned', 'Jay (demo, unassigned)', 'student')
  ];
  const teams = [
    { id: 1, name: 'Demo Team Nova', captain_id: 'demo-nova-1', created_at: now() },
    { id: 2, name: 'Demo Team Orbit', captain_id: null, created_at: now() }
  ];
  const memberships = [
    ...[1, 2, 3, 4].map(i => ({ team_id: 1, user_id: `demo-nova-${i}`, created_at: now() })),
    ...[1, 2, 3, 4, 5].map(i => ({ team_id: 2, user_id: `demo-orbit-${i}`, created_at: now() }))
  ];
  return {
    seq: 100,
    profiles, teams, memberships,
    settings: { ...EVENT_DEFAULTS },
    rounds: ROUNDS.map(r => ({ id: r.id, name: r.name, max_points: r.max, criteria_max: r.criteria.map(c => c.max),
      duration_minutes: r.minutes, status: 'upcoming', opens_at: null, closes_at: null })),
    platforms: ['ChatGPT', 'Gemini', 'Claude'].map((name, i) => ({ id: i + 1, name, is_active: true })),
    selections: [], submissions: [], scores: [], audit: []
  };
}

export const DEMO_PERSONAS = () => seed().profiles;

export function createDemoApi(storage = globalThis.localStorage) {
  let session = null;
  const listeners = new Set();
  const authListeners = new Set();
  const read = () => {
    try { const raw = storage?.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* fall through */ }
    return seed();
  };
  let db = read();
  const save = () => { try { storage?.setItem(KEY, JSON.stringify(db)); } catch { /* private window */ } listeners.forEach(fn => fn()); };
  const me = () => db.profiles.find(p => p.id === session?.user?.id);
  const role = () => me()?.role;
  const isHost = () => role() === 'host';
  const isStaff = () => ['host', 'judge'].includes(role());
  const teamOf = userId => db.memberships.find(m => m.user_id === userId)?.team_id ?? null;
  const fail = msg => { throw new Error(msg); };
  const need = (ok, msg) => { if (!ok) fail(msg); };
  const audit = (table_name, action, old_data, new_data, reason = null) =>
    db.audit.unshift({ id: ++db.seq, table_name, action, old_data, new_data, actor: me()?.id, actor_role: role(), reason, created_at: now() });
  const fullyScored = s => db.scores.filter(x => x.submission_id === s.id).length === roundFor(s.round_id).criteria.length;
  const syncStatus = s => {
    if (s.status === 'Rejected') return;
    if (fullyScored(s)) s.status = 'Scored';
    else if (db.scores.some(x => x.submission_id === s.id)) s.status = 'Under review';
  };
  const round = id => db.rounds.find(r => r.id === Number(id));

  function roundScores() {
    return db.teams.flatMap(t => db.rounds.map(r => {
      const s = db.submissions.find(x => x.team_id === t.id && x.round_id === r.id && x.status === 'Scored' && fullyScored(x));
      const points = s ? db.scores.filter(x => x.submission_id === s.id).reduce((n, x) => n + x.points, 0) : 0;
      return { team_id: t.id, team_name: t.name, round_id: r.id, points, scored: Boolean(s) };
    }));
  }

  return {
    mode: 'demo',
    personas: () => db.profiles,
    reset() { db = seed(); save(); },
    auth: {
      getSession: async () => session,
      onChange: cb => { authListeners.add(cb); return () => authListeners.delete(cb); },
      async signIn(personaId) {
        need(db.profiles.some(p => p.id === personaId), 'Unknown demo persona.');
        session = { user: { id: personaId, email: `${personaId}@demo.local` } };
        authListeners.forEach(fn => fn(session));
        return session;
      },
      signUp: async () => fail('Demo mode uses sample personas instead of accounts.'),
      async signOut() { session = null; authListeners.forEach(fn => fn(null)); }
    },

    async loadAll() {
      db = read();
      const profile = me();
      need(profile, 'Choose a demo persona.');
      const staff = isStaff();
      const myTeam = teamOf(profile.id);
      const visible = staff || db.settings.leaderboard_visible;
      const ownSubs = db.submissions.filter(s => staff || s.team_id === myTeam);
      return structuredClone({
        profile, teams: db.teams,
        memberships: db.memberships.filter(m => staff || m.user_id === profile.id),
        submissions: ownSubs,
        scores: db.scores.filter(x => staff || (visible && ownSubs.some(s => s.id === x.submission_id))),
        roundScores: visible ? roundScores() : [],
        settings: db.settings, rounds: db.rounds, platforms: db.platforms,
        selections: db.selections.filter(s => staff || s.team_id === myTeam),
        roster: myTeam ? db.memberships.filter(m => m.team_id === myTeam).map(m => {
          const p = db.profiles.find(x => x.id === m.user_id);
          return { team_id: myTeam, user_id: m.user_id, full_name: p?.full_name, is_captain: db.teams.find(t => t.id === myTeam)?.captain_id === m.user_id };
        }) : [],
        profiles: staff ? db.profiles : [],
        audit: isHost() ? db.audit.slice(0, 200) : []
      });
    },

    subscribe(onChange) {
      listeners.add(onChange);
      const onStorage = e => { if (e.key === KEY) onChange(); };
      globalThis.addEventListener?.('storage', onStorage);
      return () => { listeners.delete(onChange); globalThis.removeEventListener?.('storage', onStorage); };
    },

    async selectPlatform(roundId, platformId) {
      const teamId = teamOf(me()?.id);
      const error = platformChoiceError({ platforms: db.platforms, selections: db.selections, submissions: db.submissions,
        teamId, roundId, platformId, roundOpenOrUpcoming: !isRoundClosed(round(roundId)) });
      need(!error, error);
      const existing = db.selections.find(s => s.team_id === teamId && s.round_id === roundId);
      const before = existing ? { ...existing } : null;
      if (existing) Object.assign(existing, { platform_id: platformId, selected_by: me().id, updated_at: now() });
      else db.selections.push({ team_id: teamId, round_id: roundId, platform_id: platformId, selected_by: me().id, updated_at: now() });
      db.submissions.filter(s => s.team_id === teamId && s.round_id === roundId).forEach(s => { s.platform_id = platformId; });
      audit('team_round_platforms', before ? 'UPDATE' : 'INSERT', before, { team_id: teamId, round_id: roundId, platform_id: platformId });
      save();
    },
    async hostSetPlatform(teamId, roundId, platformId, reason) {
      need(isHost(), 'Only a host can correct AI platform declarations.');
      need(reason && reason.trim().length >= 3, 'Give a short reason for the correction (it is recorded in the audit log).');
      const existing = db.selections.find(s => s.team_id === teamId && s.round_id === roundId);
      if (!platformId) {
        need(!db.submissions.some(s => s.team_id === teamId && s.round_id === roundId), 'This round has submissions linked to its platform. Choose a replacement platform instead of clearing it.');
        db.selections = db.selections.filter(s => s !== existing);
      } else {
        const used = db.selections.find(s => s.team_id === teamId && s.platform_id === platformId && s.round_id !== roundId);
        need(!used, `This team already uses that platform in Round ${used?.round_id}. Change that round first.`);
        if (existing) Object.assign(existing, { platform_id: platformId, selected_by: me().id, updated_at: now() });
        else db.selections.push({ team_id: teamId, round_id: roundId, platform_id: platformId, selected_by: me().id, updated_at: now() });
        db.submissions.filter(s => s.team_id === teamId && s.round_id === roundId).forEach(s => { s.platform_id = platformId; });
      }
      audit('team_round_platforms', 'UPDATE', existing, { team_id: teamId, round_id: roundId, platform_id: platformId }, reason.trim());
      save();
    },

    async submit(fields) {
      const teamId = Number(fields.team_id);
      const roundId = Number(fields.round_id);
      need(isHost() || teamOf(me()?.id) === teamId, 'You do not have permission to do that.');
      need(isHost() || isRoundAccepting(round(roundId)), `Round ${roundId} (${round(roundId)?.name}) is not open for submissions.`);
      const declared = db.selections.find(s => s.team_id === teamId && s.round_id === roundId);
      need(declared, `Select your team's AI platform for Round ${roundId} before submitting.`);
      need(!db.submissions.some(s => s.team_id === teamId && s.round_id === roundId && s.status !== 'Rejected'),
        `Your team already has a submission for Round ${roundId}. Edit it instead.`);
      const problems = missingDeliverables(roundId, fields);
      need(!problems.length, problems[0]);
      const row = { id: ++db.seq, team_id: teamId, round_id: roundId, platform_id: declared.platform_id, status: 'Submitted',
        submitted_by: me().id, created_at: now(), updated_at: now(), demo_verified: false, rejection_reason: null };
      for (const k of SUBMISSION_FIELDS) row[k] = typeof fields[k] === 'string' ? (fields[k].trim() || null) : (fields[k] ?? null);
      db.submissions.unshift(row);
      audit('submissions', 'INSERT', null, row);
      save();
      return { id: row.id };
    },
    async updateSubmission(id, fields) {
      const s = db.submissions.find(x => x.id === id);
      need(s, 'Submission not found.');
      need(!(isStaff() && !isHost()), 'Judges cannot edit a team\'s work.');
      if (!isHost()) {
        need(teamOf(me()?.id) === s.team_id, 'You do not have permission to do that.');
        need(s.status === 'Submitted' && isRoundAccepting(round(s.round_id)), 'This submission can no longer be edited (the round closed or review has started).');
      }
      const next = { ...s };
      for (const k of SUBMISSION_FIELDS) if (k in fields) next[k] = typeof fields[k] === 'string' ? (fields[k].trim() || null) : fields[k];
      const problems = missingDeliverables(s.round_id, next);
      need(!problems.length, problems[0]);
      audit('submissions', 'UPDATE', { ...s }, next);
      Object.assign(s, next, { updated_at: now() });
      save();
    },
    async setStatus(id, status, reason = null) {
      const s = db.submissions.find(x => x.id === id);
      need(isStaff(), 'Only judges and hosts can change a submission\'s review status.');
      need(isHost() || (status !== 'Rejected' && s.status !== 'Rejected'), 'Only a host can reject or restore a submission.');
      need(status !== 'Scored' || fullyScored(s), 'Score every rubric criterion before marking the submission as Scored.');
      if (s.status === 'Rejected' && status !== 'Rejected') {
        need(!db.submissions.some(x => x !== s && x.team_id === s.team_id && x.round_id === s.round_id && x.status !== 'Rejected'),
          `This team already has another active submission for Round ${s.round_id}.`);
      }
      audit('submissions', 'UPDATE', { ...s }, { ...s, status }, reason);
      Object.assign(s, { status, rejection_reason: status === 'Rejected' ? reason : s.rejection_reason, reviewed_by: me().id, updated_at: now() });
      save();
    },
    async setDemoVerified(id, value) {
      need(isStaff(), 'Only judges and hosts can verify a local demo.');
      const s = db.submissions.find(x => x.id === id);
      Object.assign(s, { demo_verified: value, demo_verified_by: value ? me().id : null, demo_verified_at: value ? now() : null });
      save();
    },
    async deleteSubmission(id) {
      need(isHost(), 'Only a host can delete a submission.');
      db.submissions = db.submissions.filter(s => s.id !== id);
      db.scores = db.scores.filter(x => x.submission_id !== id);
      save();
    },
    async saveScores(submissionId, points, feedback) {
      need(isStaff(), 'Only judges and hosts can enter scores.');
      const s = db.submissions.find(x => x.id === submissionId);
      need(s, 'Submission not found.');
      need(s.status !== 'Rejected', 'Rejected submissions cannot be scored.');
      const error = scoreError(s.round_id, points);
      need(!error, error);
      points.forEach((p, i) => {
        const existing = db.scores.find(x => x.submission_id === submissionId && x.criterion_index === i);
        const row = { submission_id: submissionId, criterion_index: i, points: Number(p), feedback: feedback?.trim() || null, scored_by: me().id, updated_at: now() };
        audit('scores', existing ? 'UPDATE' : 'INSERT', existing ? { ...existing } : null, row);
        if (existing) Object.assign(existing, row); else db.scores.push({ id: ++db.seq, ...row });
      });
      syncStatus(s);
      save();
      return points.reduce((n, p) => n + Number(p), 0);
    },

    async createTeam(name, memberIds = []) {
      need(isHost(), 'Only a host can manage teams.');
      need(!db.settings.teams_locked, 'Teams are finalized. Unlock teams before creating or deleting a team.');
      need(name.trim().length >= 1 && name.trim().length <= 60, 'Team names must be 1–60 characters.');
      need(!db.teams.some(t => t.name.toLowerCase() === name.trim().toLowerCase()), 'A team with that name already exists.');
      const team = { id: ++db.seq, name: name.trim(), captain_id: null, created_at: now() };
      db.teams.push(team);
      audit('teams', 'INSERT', null, team);
      save();
      for (const id of memberIds) await this.addMember(team.id, id);
      return { id: team.id };
    },
    async renameTeam(id, name) {
      need(isHost(), 'Only a host can manage teams.');
      need(!db.teams.some(t => t.id !== id && t.name.toLowerCase() === name.trim().toLowerCase()), 'A team with that name already exists.');
      const t = db.teams.find(x => x.id === id);
      audit('teams', 'UPDATE', { ...t }, { ...t, name: name.trim() });
      t.name = name.trim();
      save();
    },
    async deleteTeam(id) {
      need(isHost(), 'Only a host can manage teams.');
      need(!db.settings.teams_locked, 'Teams are finalized. Unlock teams before creating or deleting a team.');
      need(!db.submissions.some(s => s.team_id === id), 'This team has submissions and cannot be deleted.');
      db.teams = db.teams.filter(t => t.id !== id);
      db.memberships = db.memberships.filter(m => m.team_id !== id);
      db.selections = db.selections.filter(s => s.team_id !== id);
      save();
    },
    async setCaptain(id, userId) {
      need(isHost(), 'Only a host can manage teams.');
      need(!userId || db.memberships.some(m => m.team_id === id && m.user_id === userId), 'The captain must be a member of this team.');
      db.teams.find(t => t.id === id).captain_id = userId || null;
      save();
    },
    async addMember(teamId, userId) {
      need(isHost(), 'Only a host can change team membership.');
      need(!db.settings.teams_locked, 'Teams are finalized. A host must unlock teams before changing membership.');
      need(db.profiles.find(p => p.id === userId)?.role === 'student', 'Only student accounts can be team members.');
      need(!db.memberships.some(m => m.user_id === userId), 'That student is already on a team.');
      const size = db.memberships.filter(m => m.team_id === teamId).length;
      need(size < db.settings.team_max_size, `This team already has ${size} members (maximum ${db.settings.team_max_size}).`);
      db.memberships.push({ team_id: teamId, user_id: userId, created_at: now() });
      audit('team_members', 'INSERT', null, { team_id: teamId, user_id: userId });
      save();
    },
    async removeMember(teamId, userId) {
      need(isHost(), 'Only a host can change team membership.');
      need(!db.settings.teams_locked, 'Teams are finalized. A host must unlock teams before changing membership.');
      db.memberships = db.memberships.filter(m => !(m.team_id === teamId && m.user_id === userId));
      const t = db.teams.find(x => x.id === teamId);
      if (t?.captain_id === userId) t.captain_id = null;
      audit('team_members', 'DELETE', { team_id: teamId, user_id: userId }, null);
      save();
    },
    async setTeamsLocked(locked) {
      need(isHost(), 'Only a host can finalize teams.');
      if (locked) {
        need(db.teams.length, 'Create teams before finalizing.');
        const issues = teamSizeIssues(db.teams, db.memberships, db.settings.team_min_size, db.settings.team_max_size);
        need(!issues.length, `Cannot finalize: ${issues.map(i => i.message).join(' ')}`);
      }
      db.settings.teams_locked = locked;
      save();
    },
    async importRoster(rows, apply) {
      need(isHost(), 'Only a host can import a roster.');
      need(!db.settings.teams_locked, 'Teams are finalized. Unlock teams before importing.');
      const report = [];
      const seen = new Set();
      const incoming = {};
      rows.forEach((r, i) => {
        const p = db.profiles.find(x => x.email.toLowerCase() === r.email.toLowerCase());
        const current = p && db.teams.find(t => t.id === teamOf(p.id));
        let message = null;
        if (seen.has(r.email)) message = 'Duplicate email in this file.';
        else if (!p) message = 'No registered account with this email.';
        else if (p.role !== 'student') message = `Account is a ${p.role}, not a student.`;
        else if (current && current.name.toLowerCase() !== r.team.toLowerCase()) message = `Already on team ${current.name}.`;
        else if (!current) incoming[r.team.toLowerCase()] = (incoming[r.team.toLowerCase()] || 0) + 1;
        seen.add(r.email);
        report.push({ row: i + 1, email: r.email, team: r.team, status: message ? 'error' : 'ok', message: message || (current ? 'Already on this team.' : 'Will be added.') });
      });
      for (const [name, n] of Object.entries(incoming)) {
        const t = db.teams.find(x => x.name.toLowerCase() === name);
        if ((t ? db.memberships.filter(m => m.team_id === t.id).length : 0) + n > db.settings.team_max_size)
          report.push({ row: null, team: name, status: 'error', message: `Team would exceed ${db.settings.team_max_size} members.` });
      }
      const errors = report.filter(r => r.status === 'error').length;
      if (apply && !errors) {
        for (const r of rows) {
          let t = db.teams.find(x => x.name.toLowerCase() === r.team.toLowerCase());
          if (!t) {
            const created = await this.createTeam(r.team);
            t = db.teams.find(x => x.id === created.id);
          }
          const p = db.profiles.find(x => x.email.toLowerCase() === r.email.toLowerCase());
          if (!teamOf(p.id)) await this.addMember(t.id, p.id);
          if (r.captain) t.captain_id = p.id;
        }
        save();
      }
      return { ok: !errors, applied: apply && !errors, errors, rows: report };
    },

    async updateRound(id, status, minutes = null) {
      need(isHost(), 'Only a host can open or close rounds.');
      const r = round(id);
      const before = { ...r };
      if (status === 'open') Object.assign(r, { status, opens_at: r.status === 'open' ? r.opens_at : now(), closes_at: new Date(Date.now() + (minutes || r.duration_minutes) * 60000).toISOString() });
      else if (status === 'closed') Object.assign(r, { status, closes_at: !r.closes_at || new Date(r.closes_at) > new Date() ? now() : r.closes_at });
      else Object.assign(r, { status: 'upcoming', opens_at: null, closes_at: null, duration_minutes: minutes || r.duration_minutes });
      audit('rounds', 'UPDATE', before, { ...r });
      save();
      return r;
    },
    async addPlatform(name) {
      need(isHost(), 'Only a host can manage AI platforms.');
      need(name.trim() && name.trim().length <= 40, 'Platform names must be 1–40 characters.');
      need(!db.platforms.some(p => p.name.toLowerCase() === name.trim().toLowerCase()), 'That AI platform is already on the list.');
      const p = { id: ++db.seq, name: name.trim(), is_active: true };
      db.platforms.push(p);
      audit('ai_platforms', 'INSERT', null, p);
      save();
    },
    async updatePlatform(id, fields) {
      need(isHost(), 'Only a host can manage AI platforms.');
      const p = db.platforms.find(x => x.id === id);
      audit('ai_platforms', 'UPDATE', { ...p }, { ...p, ...fields });
      Object.assign(p, fields);
      save();
    },
    async updateSettings(fields) {
      need(isHost(), 'Only a host can change event settings.');
      const next = { ...db.settings, ...fields };
      need(new Date(next.ends_at) > new Date(next.starts_at), 'The event must end after it starts.');
      need(next.team_min_size >= 1 && next.team_min_size <= next.team_max_size && next.team_max_size <= 10, 'Team size limits are invalid.');
      audit('event_settings', 'UPDATE', { ...db.settings }, next);
      db.settings = next;
      save();
    },
    async setRole(userId, newRole) {
      need(isHost(), 'Only a host can change roles.');
      need(userId !== me().id, 'You cannot change your own role.');
      need(newRole === 'student' || !teamOf(userId), 'Remove this person from their team before making them a judge or host.');
      const p = db.profiles.find(x => x.id === userId);
      audit('profiles', 'UPDATE', { ...p }, { ...p, role: newRole });
      p.role = newRole;
      save();
    }
  };
}
