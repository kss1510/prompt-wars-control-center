// Loads supabase/schema.sql + every migration into an in-process Postgres (PGlite)
// with minimal stand-ins for Supabase's auth schema and API roles, so RLS policies,
// triggers and RPCs can be exercised for real. This is NOT a Supabase project:
// it proves the SQL logic, not the live project's current configuration.
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../../supabase/', import.meta.url);

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

export async function migrationFiles() {
  return (await readdir(new URL('migrations/', root))).filter(f => f.endsWith('.sql')).sort();
}

export async function createDb({ migrateTwice = false } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  // pgcrypto is unused by the schema (gen_random_uuid is core Postgres) and not bundled here.
  const baseline = (await readFile(new URL('schema.sql', root), 'utf8'))
    .replace(/create extension if not exists pgcrypto;/i, '');
  await db.exec(baseline);
  const files = await migrationFiles();
  for (let pass = 0; pass < (migrateTwice ? 2 : 1); pass++) {
    for (const file of files) await db.exec(await readFile(new URL(`migrations/${file}`, root), 'utf8'));
  }
  return wrap(db);
}

let counter = 0;
function wrap(db) {
  const api = {
    db,
    /** Run SQL as the trusted maintenance user (like the SQL Editor). */
    async sql(query, params = []) { return (await db.query(query, params)).rows; },
    /** Run SQL as a signed-in user through the `authenticated` role, so RLS applies. */
    async as(userId, query, params = []) {
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId || '']);
      await db.exec(userId ? 'set role authenticated' : 'set role anon');
      try { return (await db.query(query, params)).rows; }
      finally {
        await db.exec('reset role');
        await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
      }
    },
    /** Expect a statement to be rejected; returns the error message. */
    async reject(userId, query, params = [], pattern) {
      try { await api.as(userId, query, params); }
      catch (error) {
        if (pattern && !pattern.test(error.message)) throw new Error(`Rejected with unexpected message: ${error.message}`);
        return error.message;
      }
      throw new Error(`Expected rejection but it succeeded: ${query}`);
    },
    /** Create an auth user (profile is created by the signup trigger) and set its role. */
    async user(role = 'student', name) {
      counter += 1;
      const id = `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
      const label = name || `${role}${counter}`;
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
        [id, `${label.toLowerCase()}@test.local`, { full_name: label }]);
      if (role !== 'student') await db.query(`update public.profiles set role = $2 where id = $1`, [id, role]);
      return id;
    },
    async team(name, memberIds = []) {
      const [{ id }] = (await db.query(`insert into public.teams (name) values ($1) returning id`, [name])).rows;
      for (const userId of memberIds) {
        await db.query(`insert into public.team_members (team_id, user_id) values ($1, $2)`, [id, userId]);
      }
      return Number(id);
    },
    async platformId(name) {
      return Number((await db.query(`select id from public.ai_platforms where name = $1`, [name])).rows[0].id);
    },
    async openRound(round, minutes = 15) {
      await db.query(`update public.rounds set status = 'open', opens_at = now(), closes_at = now() + make_interval(mins => $2) where id = $1`, [round, minutes]);
    },
    async closeRound(round) {
      await db.query(`update public.rounds set status = 'closed', closes_at = now() - interval '1 second' where id = $1`, [round]);
    }
  };
  return api;
}

export const VALID = {
  1: { title: 'Golf', prompt_text: 'p', output_text: 'o' },
  2: { title: 'Guard', prompt_text: 'p', output_text: 'o', analysis_text: 'a' },
  3: { title: 'Forge', prompt_text: 'p', output_text: 'o', artifact_filename: 'app.html', demo_details: 'Seat 4, open app.html' },
  4: { title: 'Plan', prompt_text: 'p', initial_plan: 'i', revised_plan: 'r', risks_mitigation: 'm' }
};

/** INSERT ... RETURNING id for a submission payload. */
export function insertSubmission(teamId, round, fields = VALID[round]) {
  const cols = ['team_id', 'round_id', ...Object.keys(fields)];
  const vals = [teamId, round, ...Object.values(fields)];
  return [`insert into public.submissions (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id`, vals];
}
