# Prompt Wars Control Center

React + Vite + Supabase operations portal for **Prompt Wars: AI Survival Arena** (ACM GITAM AI/ML Domain).
Offline event, ~50–60 participants. Date, time and venue: to be confirmed (set them in **Event settings**).

> **Taking over the event?** Read [docs/HANDOVER.md](docs/HANDOVER.md) first (status, access, event-day runbook,
> fallbacks), then [docs/EVENT-DAY.md](docs/EVENT-DAY.md). Live app: https://prompt-wars-gitam.vercel.app

It manages teams, round submissions, the per-round AI platform rule, judging, scores and the leaderboard.
The **database** (Postgres row-level security, triggers and RPCs) is the security boundary; the React UI
only gives friendly feedback.

## Features

- Email/password accounts (Supabase Auth). Roles `student`, `judge`, `host`; signup always creates `student`.
- **One account per team, self-registered**: the representative signs up with the team name and every member's
  name and role — teams of 5 (configurable) as in the approved proposal: Pilot, two Prompt Crafters,
  Debugger/Verifier and Strategist/Scribe (no role used more than its slots); teammates don't need accounts. The representative submits for the team and can
  fix team details until the host finalizes teams. Hosts can still create, edit, import (CSV) and delete teams.
- **Different AI platform every round** per team, enforced by a database unique constraint (see policy below).
- Round-specific deliverables, deadlines on the database clock, one active submission per team per round.
- Criterion-level judging validated against each rubric in the database; database-computed leaderboard
  that counts only fully scored, non-rejected work; ties are shown, never silently broken.
- **Round 3 HTML checker & live preview** (no AI): explains HTML/CSS/JavaScript errors with line numbers and
  runs the app in a sandbox; the file is saved with the submission so judges can open the real app.
- **Judge auto-checks** for every round (prompt length, test counts, checker result, plan change…) —
  advisory only; judges give the official score.
- Leaderboard updates live and applies the confirmed **tie-break: Round 4 → 3 → 2 → 1** automatically.
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
- The approved list is organizer-managed (**AI platforms** page). Confirmed 18 Oct 2026: **ChatGPT, Gemini,
  Claude, DeepSeek**, plus **Microsoft Copilot** and **Perplexity** as backups (six in total, so a team
  still has options if one service is down or blocked on the campus network).
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

**Round 3 checker** (sidebar → *Round 3 checker*): teams paste or load their single `.html` file while
building. The checker is deterministic (no AI), so it does not count as an AI platform and does not give
teams an extra "debugging prompt". The preview iframe runs with `sandbox="allow-scripts allow-forms
allow-modals"` and **without** same-origin access, so a team's code cannot read the portal's sign-in session;
`localStorage` is replaced by an in-memory stand-in inside the preview. Attaching the HTML to the Round 3
submission is recommended (up to 300,000 characters): judges then see the checker result and can run the
exact app from the review screen.

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
| `event_settings` | Event window, team size limits (5–5 since `20261115090000_team_roles.sql`; `teams.member_roles` holds each member's role), `teams_locked`, `leaderboard_visible`, `tie_break_rule` |
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

### What `20261018090000_round3_workspace.sql` adds

| Object | Purpose |
|---|---|
| `submissions.artifact_html` | The team's single-file app (optional, ≤ 300,000 chars); edit rules identical to other team work |
| `ai_platforms` rows | DeepSeek, Microsoft Copilot, Perplexity |
| `event_settings.tie_break_rule` | Confirmed tie-break text (only set if empty) |

## AI judge, Round 2 chatbot and round tasks (all in the app)

- **Round tasks:** the host writes each round's task (shown to teams when the round opens) and private
  notes for the AI judge (never shown to teams) on **Rounds & scoring**. For Round 4 the host types the
  surprise update and clicks **Release update now** — it appears on every team's screen instantly.
- **Round 2 chatbot (built in, free, unlimited):** a rule-based fictional bot (`src/lib/ruleBot.js`) that
  teams test on the **Round 2 chatbot** page while Round 2 is open; the host sets its name, persona, rules
  text and per-team message cap. It deliberately has two harmless weaknesses for teams to find (described
  only in the Round 2 judge notes). Every message is stored server-side as evidence and one click copies
  the conversation into the submission. Optional: set `CHATBOT_ENGINE=ai` on Vercel to answer with Gemini
  Flash-Lite instead; whenever Gemini is busy the built-in bot answers, so Round 2 never stalls.
- **AI judge (scores each round when it closes):** teams can edit until the round closes. Then the
  host's open portal sends all of that round's entries — anonymous, in batches of up to 8 — with the task,
  private notes, rubric and automatic checks to Google Gemini, which returns a score and reason per
  criterion for every entry. Scores count immediately; the leaderboard updates round by round. Team text
  is fenced as untrusted data, manipulation attempts are flagged, and the database caps every score. A host
  can re-run the AI for one submission or override any score (human scores always win); all audited.
- **Free tier:** about 2 AI requests per round (8 for the event). Limits seen on the organizers' project:
  `gemini-3.1-flash-lite` and `gemini-3.5-flash-lite` 15/min, 500/day; `gemini-3.8-flash` 5/min, 20/day.
  The judge tries the models in that order (3.1 Flash-Lite answered the live test in about 1 s; 3.8 Flash
  took over 20 s, so it is the last backup), gives each at most 25 s, and falls through when one is busy,
  slow or out of quota (override with `GEMINI_JUDGE_MODELS`, comma-separated). **Test the AI connection**
  checks every model at once and shows each one's result and time. Google may use free-tier requests to improve its
  products — tell participants that submissions are scored with AI assistance (Google Gemini).
- **Where it runs:** Vercel functions in `api/` (deployed with every push): `ai-score-round.js`,
  `ai-score.js` (host re-run), `ai-test.js` (connection test) and `guardrail-chat.js`. They need
  `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as Vercel environment variables — server-only, never
  `VITE_`. **Keep a host signed in during the event**: the host's portal runs the judge when rounds close
  and retries anything that failed (a **Score this round now** button is on each closed round).
- **Demo mode** uses a simulated judge (no network). Locally, `npm run dev` does not run the `api/`
  functions — use the deployed site (or `npx vercel dev`) to try the real AI.
- Turn either feature off under **Event settings → AI judge & Round 2 chatbot**; judging then falls back
  to manual scoring.

Migrations `20261114120000_ai_event_workspace.sql` (tasks, judge notes, chatbot tables, AI fields,
server-only `ai_record_scores` / `ai_mark_submission`) and `20261114150000_round2_rule_bot_notes.sql`
(Round 2 judge notes describing the built-in bot).

## Judging and tie-break

- Judges see **Auto-checks** above the rubric: deliverables complete, timing vs deadline, and per round —
  R1 prompt length and rank among the shortest; R2 number of test lines and analysis length; R3 checker
  result, HTML attached, demo verified; R4 plan sizes and how much the revised plan changed. These are
  facts to help judging; they never set a score. AI auto-scoring was deliberately not built (Round 2
  entries test prompt manipulation and could manipulate an AI judge).
- Tie-break (confirmed 18 Oct 2026): higher Round 4 score, then Round 3, 2, 1. The leaderboard applies it
  automatically and shows "Ahead on tie-break (Round N)". Teams equal in every round share the rank.

## Accounts and roles

- **Team representatives** choose *Register a team* at sign-up: name, email, password, team name and the other
  members' names, each with a role. The team is created immediately (database function `register_team`), with
  checks for team size, roles, unique team name and one team per account. Registration closes when the host clicks **Finalize teams**.
- **Organizers and judges** choose *Organizer / judge* at sign-up (no team). Roles are never chosen at sign-up:
  an existing host promotes them under **Event settings → People and roles** (`judge` scores; `host` manages
  everything and can also score). Hosts cannot change their own role; give `host` only to trusted people,
  because any host can change other people's roles.
- The first host is set once in the SQL Editor:

  ```sql
  update public.profiles set role = 'host' where id = 'YOUR-AUTH-USER-UUID' returning id, email, role;
  ```

  The person signs out and back in to see the new menu.

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
[docs/EVENT-DAY.md](docs/EVENT-DAY.md) for the event-day runbook. Co-leads taking over: start with [docs/HANDOVER.md](docs/HANDOVER.md).

## Deploy

**Live site:** https://prompt-wars-gitam.vercel.app (Vercel, auto-deploys on every push to `main`).
Vercel environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only — never
`VITE_DEMO_MODE`, never a secret key. Supabase **Auth → URL Configuration**: Site URL
`https://prompt-wars-gitam.vercel.app`, redirect URLs `https://prompt-wars-gitam.vercel.app/**` and
`http://localhost:5173/**`.

**Email confirmation is OFF** (Supabase → Authentication → Sign In / Providers → Email → *Confirm email*),
decided 18 Oct 2026: Supabase's built-in email service only sends a few emails per hour, which would block
50–60 signups. This is acceptable because an account grants nothing by itself — the host assigns every
student to a team, and roles can only be changed by a host. To re-enable it, configure custom SMTP first
(Authentication → Emails → SMTP Settings, e.g. Resend).


The event can run from a host laptop on the classroom network (`npm run dev` binds `0.0.0.0`), or as a
static build (`npm run build`, deploy `dist/`) with the same two `VITE_*` variables. If deployed, set
Supabase **Auth → URL configuration** (site URL and redirect URLs) to the deployed domain.

## Security notes

- Never commit `.env`; never put the database password, `service_role` or `sb_secret_` keys in `VITE_*`.
- The browser UI is not the security boundary; RLS, triggers and RPCs are.
- Enable **Leaked password protection** in Supabase Auth (flagged by the security advisor).
