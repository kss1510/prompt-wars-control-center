# Prompt Wars Control Center

React + Vite + Supabase operations portal for **Prompt Wars: AI Survival Arena** (ACM GITAM AI/ML Domain) —
23 October 2026, 3:00–5:00 PM IST, ICT Classroom, GITAM University. Offline event, ~50–60 participants.

It manages teams, round submissions, the per-round AI platform rule, judging, scores and the leaderboard.
The **database** (Postgres row-level security, triggers and RPCs) is the security boundary; the React UI
only gives friendly feedback.

## Features

- Email/password accounts (Supabase Auth). Roles `student`, `judge`, `host`; signup always creates `student`.
- Teams of **4–5** (configurable), captains, roster CSV import/export, host-controlled **team freeze**.
- **Different AI platform every round** per team, enforced by a database unique constraint (see policy below).
- Round-specific deliverables, deadlines on the database clock, one active submission per team per round.
- Criterion-level judging validated against each rubric in the database; database-computed leaderboard
  that counts only fully scored, non-rejected work; ties are shown, never silently broken.
- Round tracker (team × round: platform + status), judging queue, readiness checklist, audit log,
  CSV exports and full JSON backup.
- **Demo mode** for rehearsal with sample data that never touches Supabase.

## Rounds (130 points total)

| Round | Max | Rubric | Required deliverables |
|---|---:|---|---|
| 1 · Prompt Golf (12 min) | 25 | Target match & structure 15 · Constraint compliance 5 · Brevity & clarity 5 | Prompt, generated output |
| 2 · Guardrail Challenge (13 min) | 30 | Test design 10 · Evidence & explanation 10 · Responsible analysis 10 | Test prompts, observed responses, analysis |
| 3 · Artifact Forge (18 min) | 35 | Working functionality 15 · Required features 10 · Usability & visual clarity 10 | Prompt(s), file name, local demo details |
| 4 · AI Survival Dilemma (18 min) | 40 | Accuracy & feasibility 15 · Constraints 10 · Adaptation 10 · Clarity 5 | Prompts, initial plan, revised plan, risks & mitigation |

Timing: 61 challenge minutes inside the 120-minute window, leaving 59 minutes for briefing, transitions,
judging and results. (Earlier text mentioned a 90-minute event; the official window is two hours and is
configurable under **Event settings**.) Hosts can change each round's minutes when opening it.

## AI platform policy

- Each team declares **one approved AI platform per round** and may **not reuse** it in another round.
- The approved list is organizer-managed (**AI platforms** page). ChatGPT, Gemini and Claude are seeded.
  **The fourth platform is not seeded — organizers must confirm and add it.** Until then the readiness
  checklist and the platforms page show a warning, and Round 4 will have no valid option for most teams.
- A team can change its choice until it submits that round or the round closes. After that only a host can
  correct it, with a reason recorded in the audit log; the correction follows through to the submission.
- A **rejected** submission does not strand a platform: the declaration belongs to the team-round, so the
  team may switch (while the round is open) and resubmit, and other rounds are unaffected.
- The platform is **participant-declared**. The portal does not integrate with AI providers and cannot detect
  which tool was used; judges may ask to see it.
- Enforcement: `team_round_platforms` has `PRIMARY KEY (team_id, round_id)` and `UNIQUE (team_id, platform_id)`;
  students can only write through the `select_round_platform` RPC; submissions must reference the declared
  platform through a foreign key.

## Artifact Forge local-demo rule

Apps only need to run on the team's own laptop (open the HTML file, or `http://localhost:PORT`). Public
hosting is **not** required. A localhost URL only works on the machine running it, so the portal never
treats one as evidence — it rejects localhost links in the evidence field. Required instead: the file name
and **local demo details** (seat/laptop and how to open it). A judge verifies at the team's seat and ticks
**Local demo verified** on the submission. A screenshot link (shareable URL) is optional.
File uploads are not implemented.

## Local setup (Windows PowerShell)

```powershell
npm install
Copy-Item .env.example .env   # then edit .env with the Project URL and publishable key
npm run dev                   # http://localhost:5173
```

`.env` is git-ignored. Use only the **publishable/anon** key in `VITE_*` variables — never `service_role`.

### Demo mode (rehearsal, no Supabase)

```powershell
npm run dev:demo
```

Choose a persona (host, judge, students). A yellow **DEMO MODE** banner is always shown. Data lives only in
that browser's localStorage; **Reset demo data** restores the sample teams. Personas are not real
authentication — real permissions exist only in event mode. Demo mode never creates a Supabase client, so it
cannot read or change event data.

## Database setup

New project: in **SQL Editor**, run `supabase/schema.sql`, then each file in `supabase/migrations/` in
filename order.

Existing project (already has `schema.sql`): run only the migration files. They are idempotent (safe to run
twice) and wrapped in a transaction. **Do not re-run `schema.sql`** afterwards — it now refuses to run on a
migrated database.

### What `20261017090000_event_readiness.sql` adds

| Object | Purpose |
|---|---|
| `event_settings` | Event window, team size limits (4–5), `teams_locked`, `leaderboard_visible`, `tie_break_rule` |
| `rounds` | Rubric maxima (read by the score trigger), duration, `upcoming/open/closed`, `opens_at`/`closes_at` |
| `ai_platforms` | Approved platform list (hosts add/deactivate) |
| `team_round_platforms` | One declared platform per team-round; unique per team |
| `audit_log` | Trigger-written history of changes with actor, role and reason (hosts only) |
| `submissions` (+cols) | Round deliverables, `platform_id`, statuses `Submitted / Under review / Scored / Rejected`, demo verification |
| Triggers | Deadline + deliverable + edit-window guard, rubric validation, status sync, team size/freeze, captain |
| RPCs | `select_round_platform`, `save_scores`, `host_update_round`, `host_set_round_platform`, `host_set_teams_locked`, `host_set_role`, `host_import_roster`, `my_team_roster` |
| Views | `leaderboard`, `leaderboard_round_scores` — only fully scored, non-rejected work, one per team-round; hidden from students when the host hides standings |
| Grants | `anon` gets nothing; `authenticated` gets only needed columns. Fixes anon access to the leaderboard views found in the audit |

The two leaderboard views stay `security_invoker = false` on purpose (aggregate standings without exposing
other teams' work), so the Supabase advisor will keep listing them; they are only granted to signed-in users.

## Host account setup

1. Register in the app and confirm the email.
2. Supabase **Authentication → Users**: copy your user UUID.
3. **SQL Editor** — promote only that account:

   ```sql
   update public.profiles set role = 'host' where id = 'YOUR-AUTH-USER-UUID' returning id, email, role;
   ```

4. Sign out and back in. Further judges/hosts can then be promoted from **Event settings → People and roles**
   (`host_set_role`; hosts cannot change their own role). There is no self-service role escalation.

## Tests

```powershell
npm run build          # production build
npm run test:unit      # rubric, rules and schema contracts (no network)
npm run test:db        # schema + migrations in real Postgres (PGlite): RLS, triggers, RPCs
npm run test:e2e       # Playwright: signed-out UI + full demo-mode workflow + phone layout
npm test               # unit + db + e2e
npm run test:supabase  # opt-in, STAGING project only — see TESTING-AUTOMATION.md
```

See [TESTING-AUTOMATION.md](TESTING-AUTOMATION.md) for what each suite proves, and
[docs/EVENT-DAY.md](docs/EVENT-DAY.md) for the event-day runbook.

## Deploy

The event can run from a host laptop on the classroom network (`npm run dev` binds `0.0.0.0`), or as a
static build (`npm run build`, deploy `dist/`) with the same two `VITE_*` variables. If deployed, set
Supabase **Auth → URL configuration** (site URL and redirect URLs) to the deployed domain.

## Security notes

- Never commit `.env`; never put the database password, `service_role` or `sb_secret_` keys in `VITE_*`.
- The browser UI is not the security boundary; RLS, triggers and RPCs are.
- Enable **Leaked password protection** in Supabase Auth (flagged by the security advisor).
