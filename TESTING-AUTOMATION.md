# Prompt Wars automated testing

| Command | What it runs | What it proves | What it does NOT prove |
|---|---|---|---|
| `npm run test:unit` | `tests/unit/*.test.js` (Node test runner) | Rubric maxima (130 total), round deliverables, AI-platform rules, score limits, team sizes 4–5, leaderboard ties, timing, roster parsing; SQL contract checks; no committed secrets | Anything about a running database |
| `npm run test:db` | `tests/db/*.test.js` — `schema.sql` + every migration loaded into **PGlite** (real Postgres in WASM) with stand-ins for Supabase `auth.uid()` and the `anon`/`authenticated` roles | RLS policies, grants, triggers and RPCs actually behave as intended: anon denied, no role escalation, no cross-team access, duplicate platform rejected (including direct table writes), platform locked after submit/close, host corrections audited, deliverables + deadlines enforced, score limits, leaderboard excludes rejected/partial work, team freeze/size/captain, roster import all-or-nothing, migration idempotent | That the **live** Supabase project has these migrations applied, or Supabase-specific behaviour (Auth, PostgREST, Realtime) |
| `npm run test:e2e` | Playwright, Chromium. Project `signed-out` (fake Supabase env) + `demo` and `demo-mobile` (demo mode) | Sign-in/sign-up screens; full host → student → judge workflow: platform add, round open/close, distinct platform selection with used options disabled, validation messages, Artifact Forge local-demo evidence and judge verification, Round 4 plans, scoring limits, leaderboard update, team create/rename/captain/finalize, roster import, hidden standings, phone layout | Real authorization — demo personas are not auth; security is covered by `test:db` and `test:supabase` |
| `npm run test:supabase` | `tests/integration/*.test.js` against a **staging** Supabase project | Real RLS through PostgREST with a real student account | Only runs when configured |

`npm test` = unit + db + e2e. CI (`.github/workflows/ci.yml`) runs build, unit, db and e2e on every push and
pull request to `main`.

## First-time local setup (PowerShell)

```powershell
npm install
npx playwright install chromium
npm test
```

Playwright starts two Vite servers itself (ports 4173 and 4174). No real database is contacted.

## Staging Supabase tests (optional, recommended before the event)

**Use a separate staging project, never the live event project** — these tests deliberately attempt forbidden
writes. On the staging project run `supabase/schema.sql` and then the migrations, create a dedicated test
student account (confirm its email), create at least one team it is **not** on, and (for the duplicate-platform
check) put it on a team and declare a platform for one round.

```powershell
$env:PW_RUN_SUPABASE_TESTS = "1"
$env:PW_TEST_SUPABASE_URL = "https://YOUR_STAGING_REF.supabase.co"
$env:PW_TEST_SUPABASE_PUBLISHABLE_KEY = "YOUR_STAGING_PUBLISHABLE_KEY"
$env:PW_TEST_STUDENT_EMAIL = "staging-student@example.com"
$env:PW_TEST_STUDENT_PASSWORD = "staging-test-password"
npm run test:supabase
```

Only use a publishable/anon key. The tests check that anon cannot read event tables, and that a student cannot
promote themselves, create teams, submit for another team, score, control rounds, finalize teams, add platforms,
or reuse a platform.

To run them in CI: add the four `PW_TEST_*` values as repository **secrets** and set repository **variable**
`PW_RUN_SUPABASE_TESTS` = `1` (Settings → Secrets and variables → Actions). The `supabase-staging` job then runs.

The optional `PW_E2E_STUDENT_EMAIL` / `PW_E2E_STUDENT_PASSWORD` variables enable one Playwright test that signs in
to a real (staging) project.
