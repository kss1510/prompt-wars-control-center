// Supabase implementation of the app's data API. Every write goes to the database, where
// RLS, triggers and RPCs are the security boundary. Demo mode (demoApi.js) has the same shape.
import { SUBMISSION_FIELDS } from '../data.js';

const pick = (obj, keys) => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));
const clean = fields => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v]));
async function run(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(friendly(error));
  return data;
}
// Surface the database's own explanation (raised by our triggers/RPCs) instead of SQL jargon.
function friendly(error) {
  const msg = error?.message || String(error);
  if (/row-level security/i.test(msg)) return 'You do not have permission to do that.';
  if (/permission denied/i.test(msg)) return 'You do not have permission to change that.';
  if (/duplicate key.*teams_name_key/i.test(msg)) return 'A team with that name already exists.';
  if (/duplicate key.*team_members_user_id_key/i.test(msg)) return 'That student is already on a team.';
  if (/duplicate key.*ai_platforms_name_key/i.test(msg)) return 'That AI platform is already on the list.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Network problem — check the Wi-Fi connection and try again.';
  return msg;
}

export function createSupabaseApi(supabase) {
  return {
    mode: 'supabase',
    auth: {
      getSession: async () => (await supabase.auth.getSession()).data.session,
      onChange: cb => {
        const { subscription } = supabase.auth.onAuthStateChange((_e, session) => cb(session)).data;
        return () => subscription.unsubscribe();
      },
      signIn: async (email, password) => (await run(supabase.auth.signInWithPassword({ email, password }))).session,
      signUp: async (email, password, fullName) => run(supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })),
      signOut: () => supabase.auth.signOut()
    },

    async loadAll(user) {
      const results = await Promise.all([
        supabase.from('profiles').select('id,full_name,email,role').eq('id', user.id).single(),
        supabase.from('teams').select('id,name,captain_id,created_at').order('name'),
        supabase.from('team_members').select('team_id,user_id,created_at').order('created_at'),
        supabase.from('submissions').select('*').order('created_at', { ascending: false }),
        supabase.from('scores').select('id,submission_id,criterion_index,points,feedback,scored_by,updated_at'),
        supabase.from('leaderboard_round_scores').select('team_id,team_name,round_id,points,scored'),
        supabase.from('event_settings').select('*').single(),
        supabase.from('rounds').select('*').order('id'),
        supabase.from('ai_platforms').select('id,name,is_active').order('name'),
        supabase.from('team_round_platforms').select('team_id,round_id,platform_id,selected_by,updated_at'),
        supabase.rpc('my_team_roster')
      ]);
      for (const r of results) if (r.error) throw new Error(friendly(r.error));
      const [p, teams, memberships, submissions, scores, roundScores, settings, rounds, platforms, selections, roster] = results.map(r => r.data);
      let profiles = [];
      let audit = [];
      if (['host', 'judge'].includes(p.role)) profiles = await run(supabase.from('profiles').select('id,full_name,email,role').order('full_name'));
      if (p.role === 'host') audit = await run(supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200));
      return { profile: p, teams, memberships, submissions, scores, roundScores, settings, rounds, platforms, selections, roster: roster || [], profiles, audit };
    },

    subscribe(onChange) {
      const channel = supabase.channel('prompt-wars-live');
      for (const table of ['submissions', 'scores', 'teams', 'team_members', 'team_round_platforms', 'rounds', 'ai_platforms', 'event_settings']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange);
      }
      channel.subscribe();
      return () => supabase.removeChannel(channel);
    },

    selectPlatform: (roundId, platformId) => run(supabase.rpc('select_round_platform', { p_round: roundId, p_platform: platformId })),
    hostSetPlatform: (teamId, roundId, platformId, reason) =>
      run(supabase.rpc('host_set_round_platform', { p_team: teamId, p_round: roundId, p_platform: platformId, p_reason: reason })),

    submit: fields => run(supabase.from('submissions').insert(clean(pick(fields, ['team_id', 'round_id', ...SUBMISSION_FIELDS]))).select('id').single()),
    updateSubmission: (id, fields) => run(supabase.from('submissions').update(clean(pick(fields, SUBMISSION_FIELDS))).eq('id', id).select('id').single()),
    setStatus: (id, status, rejection_reason = null) =>
      run(supabase.from('submissions').update(status === 'Rejected' ? { status, rejection_reason } : { status }).eq('id', id).select('id').single()),
    setDemoVerified: (id, value) => run(supabase.from('submissions').update({ demo_verified: value }).eq('id', id).select('id').single()),
    deleteSubmission: id => run(supabase.from('submissions').delete().eq('id', id)),
    saveScores: (submissionId, points, feedback) =>
      run(supabase.rpc('save_scores', { p_submission: submissionId, p_points: points.map(Number), p_feedback: feedback || null })),

    async createTeam(name, memberIds = []) {
      const team = await run(supabase.from('teams').insert({ name: name.trim() }).select('id').single());
      if (memberIds.length) await run(supabase.from('team_members').insert(memberIds.map(user_id => ({ team_id: team.id, user_id }))));
      return team;
    },
    renameTeam: (id, name) => run(supabase.from('teams').update({ name: name.trim() }).eq('id', id)),
    deleteTeam: id => run(supabase.from('teams').delete().eq('id', id)),
    setCaptain: (id, userId) => run(supabase.from('teams').update({ captain_id: userId || null }).eq('id', id)),
    addMember: (teamId, userId) => run(supabase.from('team_members').insert({ team_id: teamId, user_id: userId })),
    removeMember: (teamId, userId) => run(supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId)),
    setTeamsLocked: locked => run(supabase.rpc('host_set_teams_locked', { p_locked: locked })),
    importRoster: (rows, apply) => run(supabase.rpc('host_import_roster', { p_rows: rows, p_apply: apply })),

    updateRound: (id, status, minutes = null) => run(supabase.rpc('host_update_round', { p_round: id, p_status: status, p_minutes: minutes })),
    addPlatform: name => run(supabase.from('ai_platforms').insert({ name: name.trim() })),
    updatePlatform: (id, fields) => run(supabase.from('ai_platforms').update(pick(fields, ['name', 'is_active'])).eq('id', id)),
    updateSettings: fields => run(supabase.from('event_settings').update(
      pick(fields, ['event_name', 'venue', 'starts_at', 'ends_at', 'team_min_size', 'team_max_size', 'leaderboard_visible', 'tie_break_rule'])).eq('id', true)),
    setRole: (userId, role) => run(supabase.rpc('host_set_role', { p_user: userId, p_role: role }))
  };
}
