# Prompt Wars automated testing add-on

This folder overlay adds Playwright browser smoke tests, Node test-runner checks for rubric/schema contracts, an opt-in Supabase RLS test, and GitHub Actions CI.

## Install into your existing project

1. Extract this ZIP into the **root** of your current `prompt-wars-control-center` folder and allow `package.json` to be replaced by the version in the ZIP. The ZIP does not include or overwrite `src/`, `.env`, or `supabase/schema.sql`.
2. In the VS Code terminal at the project root, run:

   ```powershell
   npm install
   npx playwright install chromium
   ```

   `npm install` refreshes `package-lock.json` for the new Playwright dependency. Keep and commit the updated lockfile.
3. Run the tests:

   ```powershell
   npm run build
   npm run test:unit
   npm run test:e2e
   ```

   The Playwright tests start a Vite server on port 4173 with fake non-secret Supabase values if no environment variables are passed. They only check the signed-out UI; they do not create accounts or write to the real database.

## What the default tests prove

- Round identifiers, names, maximum points, rubric totals, and the 130-point total stay consistent.
- The SQL source includes RLS, intended role defaults, team-membership policy checks, scoring trigger, and aggregate leaderboard grants.
- The app's sign-in/signup screens render without uncaught browser exceptions.

The schema tests are **static contract checks** against `supabase/schema.sql`; they do not prove the remote Supabase project currently has those policies. The real database test below is required for that.

## Optional Supabase staging/RLS test

**Use a separate disposable Supabase test project, not the live event project.** It must have the same `supabase/schema.sql` applied, at least one team the student test account is not assigned to, and a dedicated test user with `student` role. Test attempts intentionally try forbidden writes; a misconfigured policy may allow one, so do not point them at production.

In PowerShell, set staging-only values (do not commit these values):

```powershell
$env:PW_RUN_SUPABASE_TESTS = "1"
$env:PW_TEST_SUPABASE_URL = "https://YOUR_TEST_PROJECT_REF.supabase.co"
$env:PW_TEST_SUPABASE_PUBLISHABLE_KEY = "YOUR_TEST_PUBLISHABLE_KEY"
$env:PW_TEST_STUDENT_EMAIL = "your-dedicated-student-test-account@example.com"
$env:PW_TEST_STUDENT_PASSWORD = "your-test-account-password"
npm run test:supabase
```

Only use a publishable/anon key; never use a `service_role` or secret key. The test verifies that a student cannot change their role to host, create a team, or submit to another team's ID.

## Optional authenticated Playwright dashboard test

Set `PW_E2E_STUDENT_EMAIL` and `PW_E2E_STUDENT_PASSWORD` in the local terminal before `npm run test:e2e`. Use a dedicated account in a staging/test project. This test signs in and checks student navigation. It is skipped when credentials are absent. Email confirmation must already be completed for the account.

For CI, the workflow tests build, static contracts, and the signed-out screens only. Do not store production account passwords in GitHub Actions secrets. A separate staging workflow can be configured once a staging project and dedicated test accounts are ready.

## GitHub Actions

The workflow in `.github/workflows/ci.yml` runs on pushes and pull requests to `main`. After adding the files locally, run `npm install`, then commit the updated `package.json`, `package-lock.json`, `playwright.config.js`, `tests/`, and `.github/workflows/ci.yml`.
