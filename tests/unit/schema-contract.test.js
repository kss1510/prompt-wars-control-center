import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');

test('core event tables enable row-level security', () => {
  for (const table of ['profiles', 'teams', 'team_members', 'submissions', 'scores']) {
    assert.match(sql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
      `RLS should be enabled for ${table}`);
  }
});

test('roles default to student and no profile UPDATE policy grants escalation', () => {
  assert.match(sql, /create type public\.app_role as enum\s*\('student','judge','host'\)/i);
  assert.match(sql, /role public\.app_role not null default 'student'/i);
  assert.match(sql, /No profile UPDATE policy is granted/i);
  assert.doesNotMatch(sql, /create policy[^;]*on public\.profiles for update/is);
});

test('submission policies enforce authenticated team membership or staff access', () => {
  assert.match(sql, /create or replace function public\.is_team_member/i);
  assert.match(sql, /read team submissions or staff[\s\S]*?using\s*\(public\.is_staff\(\) or public\.is_team_member\(team_id\)\)/i);
  assert.match(sql, /submit for own team or host[\s\S]*?public\.is_host\(\) or public\.is_team_member\(team_id\)/i);
});

test('database scoring trigger guards criterion limits per round', () => {
  assert.match(sql, /create or replace function public\.validate_score_rubric/i);
  assert.match(sql, /create trigger validate_score_rubric_trigger before insert or update on public\.scores/i);
  assert.match(sql, /Score exceeds this criterion maximum/i);
  assert.match(sql, /Criterion does not exist for this round/i);
});

test('leaderboard views expose aggregate standings only to authenticated users', () => {
  assert.match(sql, /create or replace view public\.leaderboard with \(security_invoker = false\)/i);
  assert.match(sql, /create or replace view public\.leaderboard_round_scores with \(security_invoker = false\)/i);
  assert.match(sql, /grant select on public\.leaderboard, public\.leaderboard_round_scores to authenticated/i);
});
