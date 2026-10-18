import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUNDS, EVENT_DEFAULTS } from '../../src/data.js';
import {
  missingDeliverables, platformOptions, platformChoiceError, duplicatePlatformTeams, scoreError,
  teamSizeIssues, buildLeaderboard, eventTiming, readinessChecks, parseRosterCsv, isRoundAccepting, isRoundClosed, toCsv
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

test('teams of three or four pass; other sizes are flagged without hardcoding a team count', () => {
  const teams = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `T${i + 1}` }));
  const memberships = [];
  teams.forEach((t, i) => { for (let m = 0; m < (i < 10 ? 3 : 4); m++) memberships.push({ team_id: t.id, user_id: `${t.id}-${m}` }); });
  assert.equal(memberships.length, 50);
  assert.deepEqual(teamSizeIssues(teams, memberships, 3, 4), [], '10 teams of 3 + 5 teams of 4 = 50 participants');
  const extra = [...memberships, { team_id: 1, user_id: 'a' }, { team_id: 1, user_id: 'b' }, { team_id: 99, user_id: 'x' }];
  const issues = teamSizeIssues([...teams, { id: 99, name: 'Solo' }], extra, 3, 4);
  assert.deepEqual(issues.map(i => i.message), ['T1 has 5 members (needs 3–4).', 'Solo has 1 member (needs 3–4).']);
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

test('readiness checks flag missing fourth platform, unlocked teams and unconfirmed tie-break', () => {
  const checks = readinessChecks({
    settings: EVENT_DEFAULTS, platforms: platforms.slice(0, 3), teams: [], memberships: [], profiles: [], rounds: ROUNDS
  });
  const failed = checks.filter(c => !c.ok).map(c => c.label);
  assert.ok(failed.includes('At least 4 approved AI platforms'));
  assert.ok(failed.includes('Teams finalized'));
  assert.ok(!failed.includes('Tie-break rule confirmed'), 'the confirmed tie-break is part of the defaults');
  assert.ok(checks.find(c => c.label.startsWith('Round durations')).ok);
});

test('roster CSV parsing handles headers, captains and bad lines; CSV output escapes quotes', () => {
  const { rows, errors } = parseRosterCsv('email,team,captain\nA@x.edu, Team One ,yes\nb@x.edu,Team One\nbad-line');
  assert.deepEqual(rows, [{ email: 'a@x.edu', team: 'Team One', captain: true }, { email: 'b@x.edu', team: 'Team One', captain: false }]);
  assert.equal(errors.length, 1);
  assert.equal(toCsv([['a"b', 1]]), '"a""b","1"');
});
