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
