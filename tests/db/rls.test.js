// Executable database tests: schema.sql + migrations running in PGlite (real Postgres),
// with RLS enforced through the `authenticated`/`anon` roles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb, insertSubmission, VALID } from './harness.js';

async function eventFixture() {
  const t = await createDb();
  const host = await t.user('host', 'Host');
  const judge = await t.user('judge', 'Judge');
  const a = [await t.user(), await t.user(), await t.user(), await t.user()];
  const b = [await t.user(), await t.user(), await t.user(), await t.user(), await t.user()];
  const teamA = await t.team('Alpha', a);
  const teamB = await t.team('Bravo', b);
  const p = {
    chatgpt: await t.platformId('ChatGPT'),
    gemini: await t.platformId('Gemini'),
    claude: await t.platformId('Claude')
  };
  const [{ id: fourth }] = await t.as(host, `insert into public.ai_platforms (name) values ('Copilot') returning id`);
  p.fourth = Number(fourth);
  return { t, host, judge, a, b, teamA, teamB, p };
}
const choose = (t, user, round, platform) =>
  t.as(user, 'select * from public.select_round_platform($1::smallint, $2::bigint)', [round, platform]);

test('migration is re-runnable on top of the baseline schema', async () => {
  const t = await createDb({ migrateTwice: true });
  const [{ n }] = await t.sql('select count(*)::int n from public.ai_platforms');
  assert.equal(n, 3, 'seeding must not duplicate platforms');
  const rounds = await t.sql('select id, max_points, criteria_max from public.rounds order by id');
  assert.deepEqual(rounds.map(r => [r.id, r.max_points]), [[1, 25], [2, 30], [3, 35], [4, 40]]);
  for (const r of rounds) assert.equal(r.criteria_max.reduce((x, y) => x + y, 0), r.max_points);
});

test('anonymous (signed-out) clients cannot read or write anything', async () => {
  const { t } = await eventFixture();
  for (const rel of ['profiles', 'teams', 'team_members', 'submissions', 'scores', 'ai_platforms',
                     'team_round_platforms', 'rounds', 'event_settings', 'audit_log', 'leaderboard', 'leaderboard_round_scores']) {
    await t.reject(null, `select * from public.${rel}`, [], /permission denied/);
  }
  await t.reject(null, `insert into public.teams (name) values ('anon team')`, [], /permission denied/);
  await t.reject(null, `select public.is_host()`, [], /permission denied/);
});

test('students cannot escalate their role, by table write or by RPC', async () => {
  const { t, a } = await eventFixture();
  await t.reject(a[0], `update public.profiles set role = 'host' where id = $1`, [a[0]], /permission denied/);
  await t.reject(a[0], `select public.host_set_role($1, 'host')`, [a[0]], /Only a host/);
  const [{ role }] = await t.sql('select role from public.profiles where id = $1', [a[0]]);
  assert.equal(role, 'student');
});

test('hosts can promote a judge but not change their own role', async () => {
  const { t, host } = await eventFixture();
  const newcomer = await t.user();
  await t.as(host, `select public.host_set_role($1, 'judge')`, [newcomer]);
  assert.equal((await t.sql('select role from public.profiles where id=$1', [newcomer]))[0].role, 'judge');
  await t.reject(host, `select public.host_set_role($1, 'student')`, [host], /own role/);
  const audit = await t.sql(`select new_data->>'role' role from public.audit_log where table_name = 'profiles' and actor = $1`, [host]);
  assert.deepEqual(audit.map(r => r.role), ['judge'], 'role change must be audited with the host as actor');
});

test('students cannot create teams or change memberships', async () => {
  const { t, a, teamB } = await eventFixture();
  await t.reject(a[0], `insert into public.teams (name) values ('Rogue') returning id`, [], /Only a host|row-level security/);
  await t.reject(a[0], `insert into public.team_members (team_id, user_id) values ($1, $2)`, [teamB, a[0]], /Only a host|row-level security/);
  const deleted = await t.as(a[0], `delete from public.team_members where user_id = $1 returning user_id`, [a[0]]);
  assert.equal(deleted.length, 0, 'RLS must silently match zero rows for a student delete');
});

test('a team can declare a different platform each round, but never reuse one', async () => {
  const { t, a, b, p } = await eventFixture();
  await choose(t, a[0], 1, p.chatgpt);
  await choose(t, a[1], 2, p.gemini);
  await choose(t, a[2], 3, p.claude);
  await t.reject(a[3], 'select public.select_round_platform(4::smallint, $1::bigint)', [p.chatgpt],
    /already used ChatGPT in Round 1/);
  await choose(t, a[3], 4, p.fourth);
  const rows = await t.sql('select round_id, platform_id from public.team_round_platforms where team_id = (select team_id from public.team_members where user_id=$1) order by round_id', [a[0]]);
  assert.equal(new Set(rows.map(r => Number(r.platform_id))).size, 4);

  // Another team may use the same platform in the same round.
  await choose(t, b[0], 1, p.chatgpt);
});

test('the uniqueness rule also holds for direct table writes (no bypass path)', async () => {
  const { t, a, teamA, p } = await eventFixture();
  await choose(t, a[0], 1, p.chatgpt);
  await t.reject(a[0], `insert into public.team_round_platforms (team_id, round_id, platform_id) values ($1, 2, $2)`,
    [teamA, p.gemini], /permission denied/);
  await t.reject(a[0], `update public.team_round_platforms set platform_id = $1`, [p.gemini], /permission denied/);
  // Even the trusted maintenance role cannot create a duplicate.
  await assert.rejects(t.sql(`insert into public.team_round_platforms (team_id, round_id, platform_id) values ($1, 2, $2)`,
    [teamA, p.chatgpt]), /team_platform_once/);
});

test('platform choice can change before submitting, is locked after submitting, and after the round closes', async () => {
  const { t, a, p } = await eventFixture();
  await t.openRound(1);
  await choose(t, a[0], 1, p.chatgpt);
  await choose(t, a[1], 1, p.gemini); // change of mind before submitting
  await t.as(a[0], ...insertSubmission(await teamOf(t, a[0]), 1));
  await t.reject(a[0], 'select public.select_round_platform(1::smallint, $1::bigint)', [p.claude], /already submitted Round 1/);
  await t.closeRound(1);
  await t.reject(a[0], 'select public.select_round_platform(1::smallint, $1::bigint)', [p.claude], /Round 1 is closed/);
  const [{ platform_id }] = await t.sql('select platform_id from public.submissions');
  assert.equal(Number(platform_id), p.gemini, 'submission records the declared platform');
});

test('inactive or unknown platforms are rejected; students without a team get a clear message', async () => {
  const { t, host, a, p } = await eventFixture();
  await t.as(host, 'update public.ai_platforms set is_active = false where id = $1', [p.gemini]);
  await t.reject(a[0], 'select public.select_round_platform(1::smallint, $1::bigint)', [p.gemini], /not on the approved list/);
  await t.reject(a[0], 'select public.select_round_platform(1::smallint, 999999::bigint)', [], /not on the approved list/);
  const loner = await t.user();
  await t.reject(loner, 'select public.select_round_platform(1::smallint, $1::bigint)', [p.chatgpt], /not assigned to a team/);
  await t.reject(a[0], `insert into public.ai_platforms (name) values ('Sneaky')`, [], /row-level security/);
});

test('a rejected submission does not strand the platform; the team can switch and resubmit', async () => {
  const { t, host, a, p } = await eventFixture();
  const team = await teamOf(t, a[0]);
  await t.openRound(1);
  await choose(t, a[0], 1, p.chatgpt);
  const [{ id }] = await t.as(a[0], ...insertSubmission(team, 1));
  await t.as(host, `update public.submissions set status = 'Rejected', rejection_reason = 'wrong round' where id = $1`, [id]);
  await choose(t, a[0], 1, p.gemini);
  await t.as(a[0], ...insertSubmission(team, 1));
  // ChatGPT is now free for another round.
  await choose(t, a[0], 2, p.chatgpt);
});

test('host corrections are allowed, need a reason, cascade to the submission and are audited', async () => {
  const { t, host, a, p } = await eventFixture();
  const team = await teamOf(t, a[0]);
  await t.openRound(1);
  await choose(t, a[0], 1, p.chatgpt);
  await t.as(a[0], ...insertSubmission(team, 1));
  await t.closeRound(1);
  await t.reject(host, 'select public.host_set_round_platform($1, 1::smallint, $2, $3)', [team, p.claude, ''], /reason/);
  await t.as(host, 'select public.host_set_round_platform($1, 1::smallint, $2, $3)', [team, p.claude, 'Team declared wrong tool']);
  const [{ platform_id }] = await t.sql('select platform_id from public.submissions');
  assert.equal(Number(platform_id), p.claude);
  const [log] = await t.sql(`select reason, actor from public.audit_log where table_name='team_round_platforms' and action='UPDATE'`);
  assert.equal(log.reason, 'Team declared wrong tool');
  assert.equal(log.actor, host);
  await t.reject(a[0], 'select public.host_set_round_platform($1, 1::smallint, $2, $3)', [team, p.gemini, 'nope'], /Only a host/);
  await t.reject(host, 'select public.host_set_round_platform($1, 2::smallint, $2, $3)', [team, p.claude, 'dup'], /already uses that platform in Round 1/);
});

test('submissions require the declared platform, an open round and the round deliverables', async () => {
  const { t, a } = await eventFixture();
  const team = await teamOf(t, a[0]);
  await t.reject(a[0], ...insertSubmission(team, 1), /not open/);
  await t.openRound(1);
  await t.reject(a[0], ...insertSubmission(team, 1), /Select your team's AI platform/);
  await choose(t, a[0], 1, await t.platformId('ChatGPT'));
  await t.reject(a[0], ...insertSubmission(team, 1, { title: 'x', prompt_text: 'p' }), /generated output/);
  await t.as(a[0], ...insertSubmission(team, 1));
  await t.reject(a[1], ...insertSubmission(team, 1), /already has a submission for Round 1/);
});

test('round-specific deliverables are enforced for rounds 2, 3 and 4', async () => {
  const { t, a, p } = await eventFixture();
  const team = await teamOf(t, a[0]);
  for (const r of [2, 3, 4]) await t.openRound(r);
  await choose(t, a[0], 2, p.chatgpt);
  await choose(t, a[0], 3, p.gemini);
  await choose(t, a[0], 4, p.claude);
  await t.reject(a[0], ...insertSubmission(team, 2, { ...VALID[2], analysis_text: ' ' }), /analysis/);
  await t.reject(a[0], ...insertSubmission(team, 3, { ...VALID[3], artifact_filename: null }), /file name/);
  await t.reject(a[0], ...insertSubmission(team, 3, { ...VALID[3], demo_details: '' }), /local demo details/);
  await t.reject(a[0], ...insertSubmission(team, 3, { ...VALID[3], evidence_url: 'http://localhost:5173' }), /localhost link/);
  await t.reject(a[0], ...insertSubmission(team, 4, { ...VALID[4], revised_plan: null }), /revised plan/);
  await t.as(a[0], ...insertSubmission(team, 2));
  await t.as(a[0], ...insertSubmission(team, 3, { ...VALID[3], evidence_url: 'https://drive.example/shot.png' }));
  await t.as(a[0], ...insertSubmission(team, 4));
  const [plans] = await t.sql('select initial_plan, revised_plan from public.submissions where round_id = 4');
  assert.deepEqual(plans, { initial_plan: 'i', revised_plan: 'r' }, 'initial and revised plans are stored separately');
});

test('students cannot submit for, or read, another team', async () => {
  const { t, a, b, teamB, p } = await eventFixture();
  await t.openRound(1);
  await choose(t, b[0], 1, p.chatgpt);
  await t.reject(a[0], ...insertSubmission(teamB, 1), /row-level security/);
  await t.as(b[0], ...insertSubmission(teamB, 1));
  assert.equal((await t.as(a[0], 'select * from public.submissions')).length, 0);
  assert.equal((await t.as(a[0], 'select * from public.team_round_platforms')).length, 0);
  assert.equal((await t.as(a[0], 'select * from public.team_members')).length, 1, 'only own membership row');
  const roster = await t.as(a[0], 'select * from public.my_team_roster()');
  assert.equal(roster.length, 4);
  assert.ok(!('email' in roster[0]), 'roster must not expose emails');
});

test('students can edit only before review starts and before the deadline; cannot touch status or platform', async () => {
  const { t, judge, a, p } = await eventFixture();
  const team = await teamOf(t, a[0]);
  await t.openRound(1);
  await choose(t, a[0], 1, p.chatgpt);
  const [{ id }] = await t.as(a[0], ...insertSubmission(team, 1));
  await t.as(a[1], `update public.submissions set output_text = 'better' where id = $1`, [id]);
  await t.reject(a[0], `update public.submissions set status = 'Scored' where id = $1`, [id], /Only judges and hosts/);
  await t.reject(a[0], `update public.submissions set platform_id = $2 where id = $1`, [id, p.gemini], /permission denied/);
  await t.as(judge, `update public.submissions set status = 'Under review' where id = $1`, [id]);
  const changed = await t.as(a[0], `update public.submissions set output_text = 'sneaky' where id = $1 returning id`, [id]);
  assert.equal(changed.length, 0, 'RLS hides submissions under review from student updates');
  await t.reject(judge, `update public.submissions set output_text = 'judge edit' where id = $1`, [id], /Judges cannot edit/);
});

test('scores respect rubric maxima, only staff can score, and totals come from the database', async () => {
  const { t, host, judge, a, p } = await eventFixture();
  const team = await teamOf(t, a[0]);
  await t.openRound(1);
  await choose(t, a[0], 1, p.chatgpt);
  const [{ id }] = await t.as(a[0], ...insertSubmission(team, 1));
  await t.reject(a[0], `select public.save_scores($1, '{15,5,5}'::smallint[])`, [id], /Only judges and hosts/);
  await t.reject(a[0], `insert into public.scores (submission_id, criterion_index, points) values ($1, 0, 15)`, [id], /row-level security/);
  await t.reject(judge, `select public.save_scores($1, '{16,5,5}'::smallint[])`, [id], /maximum \(15\)/);
  await t.reject(judge, `select public.save_scores($1, '{10,5}'::smallint[])`, [id], /exactly 3/);
  await t.reject(judge, `insert into public.scores (submission_id, criterion_index, points) values ($1, 3, 1)`, [id], /Criterion does not exist/);
  const [{ save_scores }] = await t.as(judge, `select public.save_scores($1, '{12,4,5}'::smallint[], 'nice')`, [id]);
  assert.equal(save_scores, 21);
  assert.equal((await t.sql('select status from public.submissions where id=$1', [id]))[0].status, 'Scored');
  // A host can correct a judge's score (previously blocked by the scored_by check).
  await t.as(host, `select public.save_scores($1, '{15,5,5}'::smallint[])`, [id]);
  const [lb] = await t.as(a[0], 'select total_points from public.leaderboard where team_id = $1', [team]);
  assert.equal(lb.total_points, 25);
  const audits = await t.sql(`select count(*)::int n from public.audit_log where table_name='scores'`);
  assert.ok(audits[0].n >= 6, 'score inserts and corrections are audited');
});

test('leaderboard counts only fully scored, non-rejected work and never double-counts a round', async () => {
  const { t, host, judge, a, b, teamA, teamB, p } = await eventFixture();
  for (const r of [1, 2]) await t.openRound(r);
  await choose(t, a[0], 1, p.chatgpt);
  await choose(t, b[0], 1, p.chatgpt);
  await choose(t, b[0], 2, p.gemini);
  const [{ id: a1 }] = await t.as(a[0], ...insertSubmission(teamA, 1));
  const [{ id: b1 }] = await t.as(b[0], ...insertSubmission(teamB, 1));
  const [{ id: b2 }] = await t.as(b[0], ...insertSubmission(teamB, 2));
  await t.as(judge, `select public.save_scores($1, '{10,5,5}'::smallint[])`, [a1]);
  await t.as(judge, `select public.save_scores($1, '{15,5,5}'::smallint[])`, [b1]);
  // Partially scored: only one criterion.
  await t.as(judge, `insert into public.scores (submission_id, criterion_index, points) values ($1, 0, 10)`, [b2]);
  const board = Object.fromEntries((await t.as(a[0], 'select team_name, total_points, scored_submissions from public.leaderboard'))
    .map(r => [r.team_name, [r.total_points, r.scored_submissions]]));
  assert.deepEqual(board, { Alpha: [20, 1], Bravo: [25, 1] });

  await t.reject(judge, `update public.submissions set status = 'Rejected' where id = $1`, [a1], /Only a host/);
  await t.as(host, `update public.submissions set status = 'Rejected' where id = $1`, [a1]);
  const [{ total_points }] = await t.as(a[0], 'select total_points from public.leaderboard where team_id=$1', [teamA]);
  assert.equal(total_points, 0, 'rejected work must not count');
  await t.reject(judge, `select public.save_scores($1, '{1,1,1}'::smallint[])`, [a1], /Rejected submissions cannot be scored/);
});

test('hosts can hide standings from students (scores included) but staff still see them', async () => {
  const { t, host, judge, a, teamA, p } = await eventFixture();
  await t.openRound(1);
  await choose(t, a[0], 1, p.chatgpt);
  const [{ id }] = await t.as(a[0], ...insertSubmission(teamA, 1));
  await t.as(judge, `select public.save_scores($1, '{10,5,5}'::smallint[])`, [id]);
  await t.as(host, 'update public.event_settings set leaderboard_visible = false');
  assert.equal((await t.as(a[0], 'select * from public.leaderboard')).length, 0);
  assert.equal((await t.as(a[0], 'select * from public.scores')).length, 0);
  assert.equal((await t.as(judge, 'select * from public.leaderboard')).length, 2);
  const unhidden = await t.as(a[0], 'update public.event_settings set leaderboard_visible = true returning id');
  assert.equal(unhidden.length, 0, 'RLS matches no rows for a student update');
  await t.reject(a[0], 'update public.event_settings set teams_locked = true', [], /permission denied/);
  const unchanged = await t.as(a[0], 'update public.event_settings set event_name = $1 returning id', ['x']);
  assert.equal(unchanged.length, 0);
});

test('team size limits, captain rules and team freeze are enforced', async () => {
  const { t, host, a, b, teamA, teamB } = await eventFixture();
  const extra = await t.user();
  await t.reject(host, 'insert into public.team_members (team_id, user_id) values ($1, $2)', [teamB, extra], /maximum 5/);
  await t.reject(host, 'update public.teams set captain_id = $2 where id = $1', [teamA, b[0]], /captain must be a member/);
  await t.as(host, 'update public.teams set captain_id = $2 where id = $1', [teamA, a[0]]);
  const small = await t.team('Charlie', [extra]);
  await t.reject(host, 'select public.host_set_teams_locked(true)', [], /Charlie has 1/);
  await t.as(host, 'delete from public.teams where id = $1', [small]);
  await t.reject(a[0], 'select public.host_set_teams_locked(true)', [], /Only a host/);
  await t.as(host, 'select public.host_set_teams_locked(true)');
  await t.reject(host, 'delete from public.team_members where team_id = $1 and user_id = $2', [teamA, a[3]], /Teams are finalized/);
  await t.reject(host, `insert into public.teams (name) values ('Late')`, [], /Teams are finalized/);
  await t.as(host, 'select public.host_set_teams_locked(false)');
  await t.as(host, 'delete from public.team_members where team_id = $1 and user_id = $2', [teamA, a[0]]);
  const [{ captain_id }] = await t.sql('select captain_id from public.teams where id = $1', [teamA]);
  assert.equal(captain_id, null, 'removing the captain clears the captain');
  const judge = await t.user('judge');
  await t.reject(host, 'insert into public.team_members (team_id, user_id) values ($1, $2)', [teamA, judge], /Only student accounts/);
});

test('rounds open and close on the database clock; only hosts control them', async () => {
  const { t, host, a, p } = await eventFixture();
  await t.reject(a[0], `select public.host_update_round(1::smallint, 'open')`, [], /Only a host/);
  await t.reject(a[0], `update public.rounds set status = 'open'`, [], /permission denied/);
  const [opened] = await t.as(host, `select * from public.host_update_round(1::smallint, 'open', 12)`);
  assert.equal(opened.status, 'open');
  const minutes = (new Date(opened.closes_at) - new Date(opened.opens_at)) / 60000;
  assert.ok(Math.abs(minutes - 12) < 0.1, `deadline should be 12 minutes after opening, got ${minutes}`);
  await choose(t, a[0], 1, p.chatgpt);
  await t.as(host, `select public.host_update_round(1::smallint, 'closed')`);
  await t.reject(a[0], ...insertSubmission(await teamOf(t, a[0]), 1), /not open/);
  // Hosts may still record a late entry on a team's behalf (audited).
  await t.as(host, ...insertSubmission(await teamOf(t, a[0]), 1, { ...VALID[1], submitted_by: host }));
});

test('roster import validates everything first and applies all-or-nothing', async () => {
  const t = await createDb();
  const host = await t.user('host', 'Host');
  const people = [];
  for (let i = 0; i < 6; i++) people.push(await t.user('student', `Imp${i}`));
  const rows = [0, 1, 2, 3].map(i => ({ email: `imp${i}@test.local`, team: 'Imported', captain: i === 0 }));
  const bad = [...rows, { email: 'ghost@test.local', team: 'Imported' }];
  const [{ host_import_roster: dry }] = await t.as(host, 'select public.host_import_roster($1::jsonb, true)', [JSON.stringify(bad)]);
  assert.equal(dry.ok, false);
  assert.equal(dry.applied, false);
  assert.match(dry.rows.at(-1).message, /No registered account/);
  assert.equal((await t.sql('select count(*)::int n from public.teams'))[0].n, 0, 'nothing applied when any row fails');
  const [{ host_import_roster: ok }] = await t.as(host, 'select public.host_import_roster($1::jsonb, true)', [JSON.stringify(rows)]);
  assert.equal(ok.applied, true);
  const [team] = await t.sql(`select t.captain_id, count(m.*)::int n from public.teams t join public.team_members m on m.team_id=t.id group by t.id`);
  assert.equal(team.n, 4);
  assert.equal(team.captain_id, people[0]);
  const tooMany = [4, 5].map(i => ({ email: `imp${i}@test.local`, team: 'Imported' }));
  const [{ host_import_roster: over }] = await t.as(host, 'select public.host_import_roster($1::jsonb, false)', [JSON.stringify(tooMany)]);
  assert.equal(over.ok, false);
  assert.match(JSON.stringify(over.rows), /exceed 5/);
});

async function teamOf(t, userId) {
  return Number((await t.sql('select team_id from public.team_members where user_id=$1', [userId]))[0].team_id);
}

test('re-running the baseline schema.sql after the migration is refused', async () => {
  const { readFile } = await import('node:fs/promises');
  const t = await createDb();
  const baseline = (await readFile(new URL('../../supabase/schema.sql', import.meta.url), 'utf8'))
    .replace(/create extension if not exists pgcrypto;/i, '');
  await assert.rejects(t.db.exec(baseline), /Do not re-run schema\.sql/);
  const [{ n }] = await t.sql(`select count(*)::int n from pg_policies where policyname = 'hosts edit submissions'`);
  assert.equal(n, 0, 'old policies must not come back');
});
