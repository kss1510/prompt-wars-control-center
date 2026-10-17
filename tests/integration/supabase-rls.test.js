import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const enabled = process.env.PW_RUN_SUPABASE_TESTS === '1';
const url = process.env.PW_TEST_SUPABASE_URL;
const key = process.env.PW_TEST_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.PW_TEST_STUDENT_EMAIL;
const password = process.env.PW_TEST_STUDENT_PASSWORD;
const ready = enabled && Boolean(url && key && email && password);

if (enabled && !ready) {
  throw new Error('PW_RUN_SUPABASE_TESTS=1 requires PW_TEST_SUPABASE_URL, PW_TEST_SUPABASE_PUBLISHABLE_KEY, PW_TEST_STUDENT_EMAIL and PW_TEST_STUDENT_PASSWORD.');
}

// Intentionally opt-in: point these values at a dedicated staging/test project only,
// never the live event project. Uses a publishable/anon key, never service_role.
test('staging student cannot escalate role or create teams', { skip: !ready }, async () => {
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  assert.ifError(authError);
  const userId = authData.user?.id;
  assert.ok(userId, 'test account must authenticate');

  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('id,role').eq('id', userId).single();
  assert.ifError(profileError);
  assert.equal(profile.role, 'student', 'use a dedicated test account with student role');

  // With no UPDATE policy for profiles, this should either return an RLS error or no rows.
  const { data: changed, error: roleError } = await supabase
    .from('profiles').update({ role: 'host' }).eq('id', userId).select('role');
  assert.ok(roleError || !changed?.length, 'student must not be able to promote their own role');
  const { data: after, error: afterError } = await supabase
    .from('profiles').select('role').eq('id', userId).single();
  assert.ifError(afterError);
  assert.equal(after.role, 'student', 'role must remain student after rejected escalation');

  const teamName = `pw-rls-denied-${Date.now()}`;
  const { data: createdTeams, error: teamError } = await supabase
    .from('teams').insert({ name: teamName }).select('id');
  if (!teamError && createdTeams?.length) {
    // This indicates an RLS defect; best-effort cleanup to avoid leaving staging debris.
    await supabase.from('teams').delete().eq('id', createdTeams[0].id);
  }
  assert.ok(teamError || !createdTeams?.length, 'student must not create teams');

  await supabase.auth.signOut();
});

test('staging student cannot submit to a team they are not assigned to', { skip: !ready }, async (t) => {
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  assert.ifError(authError);
  const userId = authData.user?.id;

  const [{ data: teams, error: teamsError }, { data: memberships, error: membershipsError }] = await Promise.all([
    supabase.from('teams').select('id,name'),
    supabase.from('team_members').select('team_id').eq('user_id', userId)
  ]);
  assert.ifError(teamsError);
  assert.ifError(membershipsError);
  const memberIds = new Set((memberships || []).map(row => row.team_id));
  const foreignTeam = (teams || []).find(row => !memberIds.has(row.id));
  if (!foreignTeam) {
    t.skip('Create at least one team that the staging student is not assigned to.');
    return;
  }

  const { data: inserted, error: submitError } = await supabase.from('submissions').insert({
    team_id: foreignTeam.id,
    round_id: 1,
    title: `PW RLS denied ${Date.now()}`,
    prompt_text: 'Automated authorization test - should not persist',
    output_text: 'Automated authorization test - should not persist'
  }).select('id');
  if (!submitError && inserted?.length) {
    await supabase.from('submissions').delete().eq('id', inserted[0].id);
  }
  assert.ok(submitError || !inserted?.length, 'student must not submit to a non-member team');
  await supabase.auth.signOut();
});

// --- Event-readiness migration checks (require supabase/migrations applied on staging) ---

test('staging: signed-out (anon) clients cannot read event tables or standings', { skip: !ready }, async () => {
  const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const table of ['teams', 'submissions', 'scores', 'leaderboard', 'team_round_platforms', 'audit_log']) {
    const { data, error } = await anon.from(table).select('*').limit(1);
    assert.ok(error || !data?.length, `anon must not read ${table}`);
  }
});

test('staging: student cannot score, control rounds, change roles or finalize teams', { skip: !ready }, async () => {
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  const userId = authData.user.id;
  const checks = [
    supabase.rpc('host_update_round', { p_round: 1, p_status: 'open', p_minutes: 5 }),
    supabase.rpc('host_set_role', { p_user: userId, p_role: 'host' }),
    supabase.rpc('host_set_teams_locked', { p_locked: true }),
    supabase.rpc('save_scores', { p_submission: 1, p_points: [1, 1, 1], p_feedback: null }),
    supabase.from('scores').insert({ submission_id: 1, criterion_index: 0, points: 1 }).select('id'),
    supabase.from('ai_platforms').insert({ name: `pw-denied-${Date.now()}` }).select('id'),
    supabase.from('event_settings').update({ teams_locked: true }).eq('id', true).select('id')
  ];
  for (const [i, result] of (await Promise.all(checks)).entries()) {
    assert.ok(result.error || !result.data?.length, `forbidden operation #${i} must be rejected`);
  }
  await supabase.auth.signOut();
});

test('staging: a student cannot declare a platform their team used in another round', { skip: !ready }, async (t) => {
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  const { data: picks } = await supabase.from('team_round_platforms').select('round_id,platform_id');
  if (!picks?.length) { t.skip('Declare a platform for one round with the staging student first.'); return; }
  const otherRound = [1, 2, 3, 4].find(r => r !== picks[0].round_id);
  const { error: dupError } = await supabase.rpc('select_round_platform', { p_round: otherRound, p_platform: picks[0].platform_id });
  assert.ok(dupError, 'duplicate platform declaration must be rejected');
  assert.match(dupError.message, /already used|closed/);
  await supabase.auth.signOut();
});
