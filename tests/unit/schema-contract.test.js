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

const migrations = await Promise.all((await (await import('node:fs/promises')).readdir(new URL('../../supabase/migrations/', import.meta.url)))
  .filter(f => f.endsWith('.sql')).sort()
  .map(f => readFile(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8')));
const migrationSql = migrations.join('\n');

test('database round seed matches the rubric shown in the app', async () => {
  const { ROUNDS } = await import('../../src/data.js');
  for (const round of ROUNDS) {
    const maxima = round.criteria.map(c => c.max).join(',');
    assert.match(migrationSql, new RegExp(String.raw`\(${round.id},\s*'${round.name}',\s*${round.max},\s*'\{${maxima}\}',\s*${round.minutes}\)`),
      `rounds seed for ${round.name} must match src/data.js`);
  }
});

test('platform reuse is prevented by a database constraint, not only the UI', () => {
  assert.match(migrationSql, /constraint team_platform_once unique \(team_id, platform_id\)/i);
  assert.match(migrationSql, /primary key \(team_id, round_id\)/i);
  assert.match(migrationSql, /submissions_platform_declared[\s\S]*?references public\.team_round_platforms/i);
});

test('anon receives no table or function privileges after the migration', () => {
  assert.match(migrationSql, /revoke all on all tables in schema public from anon;/i);
  assert.match(migrationSql, /revoke all on all functions in schema public from public, anon, authenticated;/i);
  assert.doesNotMatch(migrationSql, /grant [^;]* to anon/i);
});

test('no secrets or service-role keys are committed in SQL or source', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = ['../../src/App.jsx', '../../src/lib/supabase.js', '../../.env.example',
    ...(await readdir(new URL('../../src/lib/', import.meta.url))).map(f => `../../src/lib/${f}`)];
  for (const f of files) {
    const text = await readFile(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /service_role\s*[:=]\s*['"]?ey|sb_secret_[A-Za-z0-9]/, `${f} must not contain secret keys`);
  }
});

test('Round 3 HTML is guarded as team work and the confirmed platforms and tie-break are seeded', () => {
  assert.match(migrationSql, /old\.risks_mitigation, old\.artifact_html\)/);
  assert.match(migrationSql, /length\(artifact_html\) <= 300000/);
  assert.match(migrationSql, /\('DeepSeek'\), \('Microsoft Copilot'\), \('Perplexity'\)/);
  assert.match(migrationSql, /tie_break_rule = 'Higher Round 4 score, then Round 3, then Round 2, then Round 1/);
});
