import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUNDS, EVENT_DEFAULTS } from '../../src/data.js';
import {
  missingDeliverables, platformOptions, platformChoiceError, duplicatePlatformTeams, scoreError,
  teamSizeIssues, teamsWithoutRepresentative, normalizeNames, memberNamesError, buildLeaderboard, eventTiming, readinessChecks,
  parseRosterCsv, isRoundAccepting, isRoundClosed, toCsv
} from '../../src/lib/rules.js';

const platforms = [
  { id: 1, name: 'ChatGPT', is_active: true },
  { id: 2, name: 'Gemini', is_active: true },
  { id: 3, name: 'Claude', is_active: true },
  { id: 4, name: 'Fourth', is_active: true }
];

test('every round lists its required deliverables and the overall maximum is 130', () => {
  assert.equal(ROUNDS.reduce((n, r) => n + r.max, 0), 130);
  const required = Object.fromEntries(ROUNDS.map(r => [r.id, r.fields.filter(f => f.required).map(f => f.key)]));
  assert.deepEqual(required, {
    1: ['prompt_text', 'output_text'],
    2: ['prompt_text', 'output_text', 'analysis_text'],
    3: ['prompt_text', 'output_text', 'artifact_filename', 'demo_details'],
    4: ['prompt_text', 'initial_plan', 'revised_plan', 'risks_mitigation']
  });
});

test('missingDeliverables reports per-round gaps and rejects localhost evidence links', () => {
  assert.deepEqual(missingDeliverables(1, { title: 't', prompt_text: 'p', output_text: 'o' }), []);
  assert.equal(missingDeliverables(4, { title: 't', prompt_text: 'p', initial_plan: 'i' }).length, 2);
  const forge = { title: 't', prompt_text: 'p', output_text: 'o', artifact_filename: 'a.html', demo_details: 'seat 3' };
  assert.deepEqual(missingDeliverables(3, forge), []);
  assert.match(missingDeliverables(3, { ...forge, evidence_url: 'http://localhost:5500' })[0], /localhost link/);
  assert.match(missingDeliverables(3, { ...forge, evidence_url: 'http://127.0.0.1/x' })[0], /localhost link/);
  assert.match(missingDeliverables(3, { ...forge, evidence_url: 'drive/shot.png' })[0], /http/);
  assert.match(missingDeliverables(2, { title: ' ', prompt_text: 'p', output_text: 'o', analysis_text: 'a' })[0], /title/);
});

test('distinct platform selections across four rounds are accepted', () => {
  const selections = [];
  for (const [round, platform] of [[1, 1], [2, 2], [3, 3], [4, 4]]) {
    assert.equal(platformChoiceError({ platforms, selections, teamId: 7, roundId: round, platformId: platform }), null);
    selections.push({ team_id: 7, round_id: round, platform_id: platform });
  }
  assert.deepEqual(duplicatePlatformTeams(selections), []);
});

test('duplicate platform for the same team is rejected with the round it was used in', () => {
  const selections = [{ team_id: 7, round_id: 1, platform_id: 1 }];
  assert.match(platformChoiceError({ platforms, selections, teamId: 7, roundId: 2, platformId: 1 }), /already used ChatGPT in Round 1/);
  // Another team is unaffected; re-confirming the same round is fine.
  assert.equal(platformChoiceError({ platforms, selections, teamId: 8, roundId: 2, platformId: 1 }), null);
  assert.equal(platformChoiceError({ platforms, selections, teamId: 7, roundId: 1, platformId: 1 }), null);
  assert.deepEqual(duplicatePlatformTeams([...selections, { team_id: 7, round_id: 3, platform_id: 1 }]), [7]);
});

test('platform changes are blocked after submitting, after closing, for inactive platforms and without a team', () => {
  const selections = [{ team_id: 7, round_id: 1, platform_id: 1 }];
  const submissions = [{ team_id: 7, round_id: 1, status: 'Submitted' }];
  assert.match(platformChoiceError({ platforms, selections, submissions, teamId: 7, roundId: 1, platformId: 2 }), /already submitted/);
  assert.equal(platformChoiceError({ platforms, selections, submissions: [{ ...submissions[0], status: 'Rejected' }], teamId: 7, roundId: 1, platformId: 2 }), null);
  assert.match(platformChoiceError({ platforms, selections, teamId: 7, roundId: 2, platformId: 2, roundOpenOrUpcoming: false }), /closed/);
  assert.match(platformChoiceError({ platforms: [{ ...platforms[1], is_active: false }], selections, teamId: 7, roundId: 2, platformId: 2 }), /approved list/);
  assert.match(platformChoiceError({ platforms, selections, teamId: null, roundId: 2, platformId: 2 }), /not assigned/);
});

test('platformOptions explains when only one or no platform remains', () => {
  const three = platforms.slice(0, 3);
  const used = [{ team_id: 7, round_id: 1, platform_id: 1 }, { team_id: 7, round_id: 2, platform_id: 2 }];
  const r3 = platformOptions(three, used, 7, 3);
  assert.equal(r3.available.length, 1);
  assert.match(r3.message, /Only Claude is still available/);
  assert.equal(r3.options.find(o => o.id === 1).usedIn, 1);
  const r4 = platformOptions(three, [...used, { team_id: 7, round_id: 3, platform_id: 3 }], 7, 4);
  assert.equal(r4.available.length, 0);
  assert.match(r4.message, /No approved AI platform is left/);
});

test('scoreError enforces criterion count, integers and per-criterion maxima', () => {
  assert.equal(scoreError(1, [15, 5, 5]), null);
  assert.equal(scoreError(4, [15, 10, 10, 5]), null);
  assert.match(scoreError(1, [16, 5, 5]), /between 0 and 15/);
  assert.match(scoreError(1, [10, 5]), /exactly 3/);
  assert.match(scoreError(2, [1.5, 1, 1]), /whole number/);
  assert.match(scoreError(2, ['', 1, 1]), /whole number/);
  assert.match(scoreError(3, [-1, 1, 1]), /between 0/);
});

test('team size counts member names (3–4), not accounts, without hardcoding a team count', () => {
  const teams = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `T${i + 1}`,
    member_names: Array.from({ length: i < 10 ? 3 : 4 }, (_, m) => `P${i}-${m}`) }));
  assert.equal(teams.reduce((n, t) => n + t.member_names.length, 0), 50);
  assert.deepEqual(teamSizeIssues(teams, 3, 4), [], '10 teams of 3 + 5 teams of 4 = 50 participants');
  const odd = [{ ...teams[0], member_names: ['a', 'b', 'c', 'd', 'e'] }, { id: 99, name: 'Solo', member_names: ['x'] }, { id: 98, name: 'Empty' }];
  assert.deepEqual(teamSizeIssues(odd, 3, 4).map(i => i.message),
    ['T1 has 5 members (needs 3–4).', 'Solo has 1 member (needs 3–4).', 'Empty has 0 members (needs 3–4).']);
});

test('one representative account per team: teams without one are flagged', () => {
  const teams = [{ id: 1, name: 'Linked' }, { id: 2, name: 'Unlinked' }];
  assert.deepEqual(teamsWithoutRepresentative(teams, [{ team_id: 1, user_id: 'u1' }]).map(t => t.name), ['Unlinked']);
});

test('member names are trimmed, blank lines dropped, duplicates and oversize lists rejected', () => {
  assert.deepEqual(normalizeNames('  Asha Rao \n\n Bilal\r\nChitra '), ['Asha Rao', 'Bilal', 'Chitra']);
  assert.deepEqual(normalizeNames([' a ', '', null, 'b']), ['a', 'b']);
  assert.equal(memberNamesError(['Asha', 'Bilal', 'Chitra'], 4), null);
  assert.match(memberNamesError(['Asha', 'asha'], 4), /listed twice/);
  assert.match(memberNamesError(['a', 'b', 'c', 'd', 'e'], 4), /at most 4 members \(this list has 5\)/);
  assert.match(memberNamesError(['x'.repeat(81)], 4), /80 characters/);
});

test('leaderboard applies the confirmed tie-break: Round 4, then 3, 2, 1', () => {
  const teams = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }, { id: 4, name: 'D' }];
  const rows = [
    // A and B: 45 each; B is ahead on Round 3 (Round 4 equal at 0).
    { team_id: 1, round_id: 1, points: 20, scored: true }, { team_id: 1, round_id: 2, points: 25, scored: true },
    { team_id: 2, round_id: 1, points: 25, scored: true }, { team_id: 2, round_id: 3, points: 20, scored: true },
    // C and D: identical in every round -> genuinely tied, shared rank.
    { team_id: 3, round_id: 4, points: 30, scored: true }, { team_id: 4, round_id: 4, points: 30, scored: true }
  ];
  const board = buildLeaderboard(teams, rows);
  assert.deepEqual(board.map(r => [r.name, r.score, r.rank, r.tied]), [['B', 45, 1, false], ['A', 45, 2, false], ['C', 30, 3, true], ['D', 30, 3, true]]);
  assert.equal(board[0].aheadOn, 3, 'B wins the tie-break on Round 3');
  assert.deepEqual(board[1].rounds, { 1: 20, 2: 25, 3: 0, 4: 0 });
  assert.equal(board[0].scored, 2);
  const r4 = buildLeaderboard(teams.slice(0, 2), [
    { team_id: 1, round_id: 4, points: 10, scored: true }, { team_id: 1, round_id: 3, points: 30, scored: true },
    { team_id: 2, round_id: 4, points: 20, scored: true }, { team_id: 2, round_id: 3, points: 20, scored: true }]);
  assert.deepEqual(r4.map(r => [r.name, r.rank, r.aheadOn]), [['B', 1, 4], ['A', 2, undefined]], 'Round 4 is checked before Round 3');
});

test('the official two-hour window fits the 61 challenge minutes', () => {
  const t = eventTiming(EVENT_DEFAULTS, ROUNDS);
  assert.deepEqual(t, { windowMinutes: 120, challengeMinutes: 61, bufferMinutes: 59 });
});

test('round state helpers use the deadline, not just the status flag', () => {
  const now = Date.parse('2026-10-23T10:00:00Z');
  assert.equal(isRoundAccepting({ status: 'open', closes_at: '2026-10-23T10:05:00Z' }, now), true);
  assert.equal(isRoundAccepting({ status: 'open', closes_at: '2026-10-23T09:59:00Z' }, now), false);
  assert.equal(isRoundClosed({ status: 'open', closes_at: '2026-10-23T09:59:00Z' }, now), true);
  assert.equal(isRoundAccepting({ status: 'upcoming' }, now), false);
});

test('readiness checks flag missing fourth platform, unlocked teams and teams without an account', () => {
  const checks = readinessChecks({
    settings: EVENT_DEFAULTS, platforms: platforms.slice(0, 3), teams: [], memberships: [], profiles: [], rounds: ROUNDS
  });
  const failed = checks.filter(c => !c.ok).map(c => c.label);
  assert.ok(failed.includes('At least 4 approved AI platforms'));
  assert.ok(failed.includes('Teams finalized'));
  const teams = [{ id: 1, name: 'Nova', member_names: ['A', 'B', 'C'] }, { id: 2, name: 'Orbit', member_names: ['D', 'E', 'F', 'G'] }];
  const ready = readinessChecks({ settings: EVENT_DEFAULTS, platforms, teams, memberships: [{ team_id: 1, user_id: 'u1' }],
    profiles: [{ id: 'u1', role: 'student' }, { id: 'j', role: 'judge' }], rounds: ROUNDS });
  const repCheck = ready.find(c => c.label === 'Every team has its representative account');
  assert.equal(repCheck.ok, false);
  assert.match(repCheck.detail, /Missing: Orbit/);
  assert.ok(!ready.find(c => c.label.startsWith('Every team has 5–5 members')).ok, 'teams of 3–4 no longer meet the 5-member rule');
  assert.ok(!failed.includes('Tie-break rule confirmed'), 'the confirmed tie-break is part of the defaults');
  assert.ok(checks.find(c => c.label.startsWith('Round durations')).ok);
});

test('roster CSV: one line per person, email only for the representative; CSV output escapes quotes', () => {
  const { rows, errors } = parseRosterCsv('team,name,email\n Team One , Asha Rao ,A@x.edu\nTeam One,Bilal,\nTeam One,Chitra\nbad-line');
  assert.deepEqual(rows, [
    { team: 'Team One', name: 'Asha Rao', email: 'a@x.edu' },
    { team: 'Team One', name: 'Bilal' },
    { team: 'Team One', name: 'Chitra' }
  ]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Line 5: expected "team,name,email"/);
  assert.equal(toCsv([['a"b', 1]]), '"a""b","1"');
});

test('self-registration validation mirrors the database: name, uniqueness and 3–4 members including the representative', async () => {
  const { teamRegistrationError } = await import('../../src/lib/rules.js');
  const base = { min: 3, max: 4, takenNames: ['Nova'] };
  assert.equal(teamRegistrationError({ ...base, teamName: 'Comet', names: ['Jay', 'Kiran', 'Leela'] }), null);
  assert.match(teamRegistrationError({ ...base, teamName: '  ', names: ['a', 'b', 'c'] }), /1–60 characters/);
  assert.match(teamRegistrationError({ ...base, teamName: 'x'.repeat(61), names: ['a', 'b', 'c'] }), /1–60 characters/);
  assert.match(teamRegistrationError({ ...base, teamName: 'nova', names: ['a', 'b', 'c'] }), /"nova" is already taken/);
  assert.match(teamRegistrationError({ ...base, teamName: 'Comet', names: ['Jay'] }), /need 3 to 4 members including you \(you entered 1\)/);
  assert.match(teamRegistrationError({ ...base, teamName: 'Comet', names: ['a', 'b', 'c', 'd', 'e'] }), /at most 4 members/);
  assert.match(teamRegistrationError({ ...base, teamName: 'Comet', names: ['Jay', 'jay', 'K'] }), /listed twice/);
});

test('team roles follow the approved proposal: Pilot, two Prompt Crafters, Debugger/Verifier, Strategist/Scribe', async () => {
  const { teamRolesError, rosterArrays, DEFAULT_ROLE_ORDER, teamRegistrationError } = await import('../../src/lib/rules.js');
  const five = ['A', 'B', 'C', 'D', 'E'];
  assert.equal(EVENT_DEFAULTS.team_min_size, 5);
  assert.equal(EVENT_DEFAULTS.team_max_size, 5);
  assert.equal(teamRolesError(five, DEFAULT_ROLE_ORDER), null);
  assert.match(teamRolesError(five, DEFAULT_ROLE_ORDER.slice(0, 4)), /Choose a role for every team member/);
  assert.match(teamRolesError(five, ['Pilot', 'Pilot', 'Prompt Crafter', 'Debugger/Verifier', 'Strategist/Scribe']), /one Pilot/);
  assert.match(teamRolesError(five, ['Pilot', 'Prompt Crafter', 'Prompt Crafter', 'Prompt Crafter', 'Strategist/Scribe']), /two Prompt Crafters/);
  assert.equal(teamRolesError(five, [], { required: false }), null, 'host tools may leave roles out');
  assert.deepEqual(rosterArrays([{ name: ' Asha ', role: 'Pilot' }, { name: '', role: 'Prompt Crafter' }, { name: 'Bilal', role: 'Prompt Crafter' }]),
    { names: ['Asha', 'Bilal'], roles: ['Pilot', 'Prompt Crafter'] });
  assert.match(teamRegistrationError({ teamName: 'Comet', names: five, roles: [], min: 5, max: 5 }), /Choose a role/);
  assert.equal(teamRegistrationError({ teamName: 'Comet', names: five, roles: DEFAULT_ROLE_ORDER, min: 5, max: 5 }), null);
});
