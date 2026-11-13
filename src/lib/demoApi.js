// DEMO MODE ONLY (npm run dev:demo). Sample data lives in this browser's localStorage and never
// touches Supabase. Personas replace sign-in, so there is NO real authorization here — the
// rules below mirror the database so rehearsals behave like the real event, nothing more.
import { ROUNDS, EVENT_DEFAULTS, SUBMISSION_FIELDS, DEFAULT_ROUND_TASKS, DEFAULT_JUDGE_NOTES, DEFAULT_CHATBOT } from '../data.js';
import { simulateJudge, simulateChatbot } from './aiJudge.js';
import { missingDeliverables, platformChoiceError, scoreError, isRoundAccepting, isRoundClosed, teamSizeIssues, teamsWithoutRepresentative, normalizeNames, memberNamesError, teamRegistrationError, roundFor } from './rules.js';

const KEY = 'pw-demo-v4'; // v4: in-app tasks, Round 2 chatbot, simulated AI judge
const now = () => new Date().toISOString();
const persona = (id, full_name, role) => ({ id, full_name, email: `${id}@demo.local`, role });

function seed() {
  const profiles = [
    persona('demo-host', 'Demo Host', 'host'),
    persona('demo-judge', 'Demo Judge', 'judge'),
    // One account per team: only the representatives sign in. Teammates are names on the team.
    persona('demo-nova-1', 'Asha (demo)', 'student'),
    persona('demo-orbit-1', 'Esha (demo)', 'student'),
    persona('demo-unassigned', 'Jay (demo, unassigned)', 'student'),
    persona('demo-unassigned-2', 'Hari (demo, unassigned)', 'student')
  ];
  const teams = [
    { id: 1, name: 'Demo Team Nova', member_names: ['Asha', 'Bilal', 'Chitra', 'Dev'], created_at: now() },
    { id: 2, name: 'Demo Team Orbit', member_names: ['Esha', 'Farhan', 'Gauri'], created_at: now() }
  ];
  const memberships = [
    { team_id: 1, user_id: 'demo-nova-1', created_at: now() },
    { team_id: 2, user_id: 'demo-orbit-1', created_at: now() }
  ];
  return {
    seq: 100,
    profiles, teams, memberships,
    settings: { ...EVENT_DEFAULTS },
    rounds: ROUNDS.map(r => ({ id: r.id, name: r.name, max_points: r.max, criteria_max: r.criteria.map(c => c.max),
      duration_minutes: r.minutes, status: 'upcoming', opens_at: null, closes_at: null })),
    platforms: ['ChatGPT', 'Gemini', 'Claude', 'DeepSeek', 'Microsoft Copilot', 'Perplexity'].map((name, i) => ({ id: i + 1, name, is_active: true })),
    selections: [], submissions: [], scores: [], audit: [],
    briefs: ROUNDS.map(r => ({ round_id: r.id, brief: DEFAULT_ROUND_TASKS[r.id], update_text: null, update_released_at: null })),
    judgeNotes: ROUNDS.map(r => ({ round_id: r.id, notes: DEFAULT_JUDGE_NOTES[r.id] })),
    chatConfig: { ...DEFAULT_CHATBOT },
    chatMessages: []
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
        profiles: staff ? db.profiles : [],
        audit: isHost() ? db.audit.slice(0, 200) : [],
        briefs: db.briefs.filter(b => staff || round(b.round_id)?.status !== 'upcoming'),
        judgeNotes: staff ? db.judgeNotes : [],
        chatConfig: staff || round(2)?.status !== 'upcoming' ? db.chatConfig : null,
        chatMessages: db.chatMessages.filter(m => staff || m.team_id === myTeam)
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
        submitted_by: me().id, created_at: now(), updated_at: now(), demo_verified: false, rejection_reason: null,
        ai_status: 'pending', ai_error: null, ai_model: null, ai_flagged: false };
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
        const row = { submission_id: submissionId, criterion_index: i, points: Number(p), feedback: feedback?.trim() || null, scored_by: me().id, source: 'human', updated_at: now() };
        audit('scores', existing ? 'UPDATE' : 'INSERT', existing ? { ...existing } : null, row);
        if (existing) Object.assign(existing, row); else db.scores.push({ id: ++db.seq, ...row });
      });
      syncStatus(s);
      save();
      return points.reduce((n, p) => n + Number(p), 0);
    },

    async createTeam(name, repId = null, memberNames = []) {
      need(isHost(), 'Only a host can manage teams.');
      need(!db.settings.teams_locked, 'Teams are finalized. Unlock teams before creating or deleting a team.');
      need(name.trim().length >= 1 && name.trim().length <= 60, 'Team names must be 1–60 characters.');
      need(!db.teams.some(t => t.name.toLowerCase() === name.trim().toLowerCase()), 'A team with that name already exists.');
      const names = normalizeNames(memberNames);
      const problem = memberNamesError(names, db.settings.team_max_size);
      need(!problem, problem);
      const team = { id: ++db.seq, name: name.trim(), member_names: names, created_at: now() };
      db.teams.push(team);
      audit('teams', 'INSERT', null, team);
      save();
      if (repId) await this.addMember(team.id, repId);
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
    async setMemberNames(id, memberNames) {
      need(isHost(), 'Only a host can manage teams.');
      need(!db.settings.teams_locked, 'Teams are finalized. Unlock teams before changing members.');
      const names = normalizeNames(memberNames);
      const problem = memberNamesError(names, db.settings.team_max_size);
      need(!problem, problem);
      const t = db.teams.find(x => x.id === id);
      audit('teams', 'UPDATE', { ...t }, { ...t, member_names: names });
      t.member_names = names;
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
    async registerTeam(teamName, memberNames) {
      need(me(), 'Sign in first.');
      need(role() === 'student', 'Organizer and judge accounts do not register a team.');
      need(!teamOf(me().id), 'Your account already represents a team.');
      need(!db.settings.teams_locked, 'Team registration is closed (teams are finalized). Contact the event host.');
      const names = normalizeNames(memberNames);
      const error = teamRegistrationError({ teamName, names, min: db.settings.team_min_size, max: db.settings.team_max_size, takenNames: db.teams.map(t => t.name) });
      need(!error, error);
      const team = { id: ++db.seq, name: teamName.trim(), member_names: names, created_at: now() };
      db.teams.push(team);
      db.memberships.push({ team_id: team.id, user_id: me().id, created_at: now() });
      audit('teams', 'INSERT', null, team);
      save();
      return team.id;
    },
    async updateMyTeam(teamName, memberNames) {
      const tid = teamOf(me()?.id);
      need(tid, 'Your account is not linked to a team.');
      need(!db.settings.teams_locked, 'Team registration is closed (teams are finalized). Contact the event host.');
      const names = normalizeNames(memberNames);
      const error = teamRegistrationError({ teamName, names, min: db.settings.team_min_size, max: db.settings.team_max_size,
        takenNames: db.teams.filter(t => t.id !== tid).map(t => t.name) });
      need(!error, error);
      const t = db.teams.find(x => x.id === tid);
      audit('teams', 'UPDATE', { ...t }, { ...t, name: teamName.trim(), member_names: names });
      Object.assign(t, { name: teamName.trim(), member_names: names });
      save();
    },
    /** Link the team's single representative account. */
    async addMember(teamId, userId) {
      need(isHost(), 'Only a host can change team membership.');
      need(!db.settings.teams_locked, 'Teams are finalized. A host must unlock teams before changing membership.');
      need(db.profiles.find(p => p.id === userId)?.role === 'student', 'Only student accounts can be team members.');
      need(!db.memberships.some(m => m.user_id === userId), 'That account already represents a team.');
      need(!db.memberships.some(m => m.team_id === teamId), 'This team already has its representative account. Remove it first to assign a different one.');
      db.memberships.push({ team_id: teamId, user_id: userId, created_at: now() });
      audit('team_members', 'INSERT', null, { team_id: teamId, user_id: userId });
      save();
    },
    async removeMember(teamId, userId) {
      need(isHost(), 'Only a host can change team membership.');
      need(!db.settings.teams_locked, 'Teams are finalized. A host must unlock teams before changing membership.');
      db.memberships = db.memberships.filter(m => !(m.team_id === teamId && m.user_id === userId));
      audit('team_members', 'DELETE', { team_id: teamId, user_id: userId }, null);
      save();
    },
    async setTeamsLocked(locked) {
      need(isHost(), 'Only a host can finalize teams.');
      if (locked) {
        need(db.teams.length, 'Create teams before finalizing.');
        const issues = [
          ...teamSizeIssues(db.teams, db.settings.team_min_size, db.settings.team_max_size).map(i => i.message.replace(/\.$/, '')),
          ...teamsWithoutRepresentative(db.teams, db.memberships).map(t => `${t.name} has no representative account`)
        ];
        need(!issues.length, `Cannot finalize: ${issues.join('; ')}.`);
      }
      db.settings.teams_locked = locked;
      save();
    },
    /** Rows: one per participant {team, name, email?}; email only on the representative's row. */
    async importRoster(rows, apply) {
      need(isHost(), 'Only a host can import a roster.');
      need(!db.settings.teams_locked, 'Teams are finalized. Unlock teams before importing.');
      const { team_min_size: min, team_max_size: max } = db.settings;
      const report = [];
      const plan = new Map();
      const repEmails = new Set();
      rows.forEach((r, i) => {
        const team = (r.team || '').trim(), name = (r.name || '').trim(), email = (r.email || '').trim().toLowerCase() || null;
        let message = null;
        if (!team || !name) message = 'Team and name are required.';
        else {
          const key = team.toLowerCase();
          const info = plan.get(key) || { name: team, names: [], emails: [] };
          if (info.names.some(n => n.toLowerCase() === name.toLowerCase())) message = 'This name is listed twice for the team.';
          else {
            info.names.push(name);
            if (email) {
              const p = db.profiles.find(x => x.email.toLowerCase() === email);
              const current = p && db.teams.find(t => t.id === teamOf(p.id));
              if (!p) message = 'No registered account with this email (the representative must sign up first).';
              else if (p.role !== 'student') message = `Account is a ${p.role}, not a student.`;
              else if (repEmails.has(email)) message = 'This email is already a representative in this file.';
              else if (current && current.name.toLowerCase() !== key) message = `This account already represents team ${current.name}.`;
              else { info.emails.push(email); repEmails.add(email); }
            }
          }
          plan.set(key, info);
        }
        report.push({ row: i + 1, team, name, email, status: message ? 'error' : 'ok', message: message || (email ? 'Representative (signs in and submits).' : 'Member.') });
      });
      for (const [key, info] of plan) {
        const n = info.names.length;
        if (info.emails.length > 1) report.push({ row: null, team: info.name, status: 'error', message: 'More than one representative email: each team has exactly one account.' });
        if (n < min || n > max) report.push({ row: null, team: info.name, status: 'error', message: `Lists ${n} member${n === 1 ? '' : 's'}; teams need ${min}–${max}.` });
        const existing = db.teams.find(t => t.name.toLowerCase() === key);
        const rep = existing && db.memberships.find(m => m.team_id === existing.id);
        const repEmail = rep && db.profiles.find(p => p.id === rep.user_id)?.email.toLowerCase();
        if (repEmail && info.emails.length === 1 && repEmail !== info.emails[0])
          report.push({ row: null, team: info.name, status: 'error', message: 'This team already has a different representative. Remove it on the Teams page first.' });
      }
      const errors = report.filter(r => r.status === 'error').length;
      if (apply && !errors) {
        for (const [key, info] of plan) {
          let t = db.teams.find(x => x.name.toLowerCase() === key);
          if (!t) {
            const created = await this.createTeam(info.name, null, info.names);
            t = db.teams.find(x => x.id === created.id);
          } else t.member_names = info.names;
          if (info.emails.length === 1 && !db.memberships.some(m => m.team_id === t.id)) {
            await this.addMember(t.id, db.profiles.find(p => p.email.toLowerCase() === info.emails[0]).id);
          }
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
    async updateBrief(roundId, fields) {
      need(isHost(), 'Only a host can edit round tasks.');
      const b = db.briefs.find(x => x.round_id === roundId);
      audit('round_briefs', 'UPDATE', { ...b }, { ...b, ...fields });
      Object.assign(b, fields);
      save();
    },
    async updateJudgeNotes(roundId, notes) {
      need(isHost(), 'Only a host can edit judge notes.');
      db.judgeNotes.find(x => x.round_id === roundId).notes = notes;
      save();
    },
    async updateChatConfig(fields) {
      need(isHost(), 'Only a host can change the chatbot.');
      audit('guardrail_config', 'UPDATE', { ...db.chatConfig }, { ...db.chatConfig, ...fields });
      Object.assign(db.chatConfig, fields);
      save();
    },
    /** Simulated AI judge (demo only): same rules as the server, deterministic scores. */
    async aiScore(submissionId, force = false) {
      const s = db.submissions.find(x => x.id === submissionId);
      need(s, 'Submission not found.');
      need(isStaff() || teamOf(me()?.id) === s.team_id, 'You can only request scoring for your own team.');
      need(db.settings.ai_judging, 'AI judging is switched off by the host.');
      need(s.status !== 'Rejected', 'Rejected submissions are not scored.');
      if (s.ai_status === 'scored' && !(force && isHost())) return { status: 'already-scored' };
      if (db.scores.some(x => x.submission_id === s.id && x.source === 'human')) {
        Object.assign(s, { ai_status: 'scored', ai_error: 'Kept the human score.' });
        save();
        return { status: 'scored' };
      }
      const result = simulateJudge(s);
      db.scores = db.scores.filter(x => x.submission_id !== s.id);
      result.points.forEach((p, i) => db.scores.push({ id: ++db.seq, submission_id: s.id, criterion_index: i, points: p,
        feedback: result.reasons[i], scored_by: null, source: 'ai', updated_at: now() }));
      Object.assign(s, { ai_status: 'scored', ai_error: null, ai_model: result.model, ai_flagged: result.flagged, ai_scored_at: now() });
      syncStatus(s);
      audit('scores', 'INSERT', null, { submission_id: s.id, points: result.points, source: 'ai' });
      save();
      return { status: 'scored', total: result.points.reduce((a, b) => a + b, 0), ...result };
    },
    async requeueAi(submissionId) {
      need(isHost(), 'Only a host can re-run the AI judge.');
      const s = db.submissions.find(x => x.id === submissionId);
      db.scores = db.scores.filter(x => !(x.submission_id === submissionId && x.source === 'ai'));
      if (s.status === 'Scored') s.status = 'Under review';
      Object.assign(s, { ai_status: 'pending', ai_error: null });
      save();
    },
    /** Simulated Round 2 chatbot (demo only). */
    async guardrailChat(message) {
      const text = String(message ?? '').trim();
      need(text, 'Type a message first.');
      need(text.length <= 1000, 'Keep each message under 1000 characters.');
      need(db.settings.ai_chatbot, 'The Round 2 chatbot is switched off by the host.');
      const cfg = db.chatConfig;
      const reply = simulateChatbot(cfg, text);
      if (isStaff()) return { reply, remaining: null, preview: true };
      const teamId = teamOf(me()?.id);
      need(teamId, 'Your account is not linked to a team.');
      need(isRoundAccepting(round(2)), 'The chatbot is available only while Round 2 is open.');
      const used = db.chatMessages.filter(m => m.team_id === teamId && m.role === 'user').length;
      need(used < cfg.max_messages_per_team, `Your team has used all ${cfg.max_messages_per_team} messages for this round.`);
      db.chatMessages.push({ id: ++db.seq, team_id: teamId, role: 'user', content: text, created_at: now() },
        { id: ++db.seq, team_id: teamId, role: 'bot', content: reply, created_at: now() });
      save();
      return { reply, remaining: cfg.max_messages_per_team - used - 1, preview: false };
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
