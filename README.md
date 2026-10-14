# Prompt Wars Control Center

React + Vite + Supabase app for the Prompt Wars: AI Survival Arena event.

## Features

- Email/password signup and sign-in through Supabase Auth.
- Roles: `student`, `judge`, `host`; new accounts are always created as `student`.
- Host-managed teams and membership assignment.
- Student submission permissions enforced by Postgres Row Level Security (RLS).
- Judge/host scoring with the four preserved rubrics.
- Shared leaderboard, CSV exports, and Supabase Realtime refreshes.
- No demo data is seeded into the live database.

## Preserved event rounds

| Round | Maximum | Rubric |
|---|---:|---|
| Prompt Golf | 25 | Target match and structure 15; constraint compliance 5; brevity and clarity 5 |
| Guardrail Challenge | 30 | Quality of test design 10; evidence and explanation 10; responsible analysis 10 |
| Artifact Forge | 35 | Working functionality 15; required features 10; usability and visual clarity 10 |
| AI Survival Dilemma | 40 | Accuracy and feasibility 15; handling constraints 10; adaptation to update 10; clarity and actionability 5 |

Total: **130 points per team**. The leaderboard counts a submission only once every criterion for its round has a score. The existing rubric totals and 90-minute event concept are preserved.

## 1. Create the Supabase project

1. Open https://supabase.com/dashboard and sign in.
2. Select **New project** and choose an organization.
3. Name it `prompt-wars-control-center`, choose a strong database password, and choose a nearby region.
4. Wait for the database to finish provisioning.
5. In **Project Settings → API** (or **Connect** in the dashboard), copy the Project URL and the publishable key (older projects may call it the `anon` key). The publishable/anon key is intended for the browser when RLS is correctly configured.

## 2. Create the database

1. In this project, open `supabase/schema.sql`.
2. Copy the entire file into **SQL Editor → New query** in your Supabase dashboard.
3. Run it and check that it completes without errors.

The SQL creates tables, a signup trigger, helper functions, RLS policies and Realtime publication entries. Do not disable RLS.

## 3. Configure and run locally

Install Node.js 20 or later. From this project folder:

```bash
npm install
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Edit `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Then run:

```bash
npm run dev
```

Open the local URL Vite prints, usually `http://localhost:5173`.

## 4. Bootstrap the first host

Signup deliberately does **not** let a user choose their role.

1. Register your own account in the app.
2. If email confirmation is enabled, open the confirmation email and confirm the account.
3. In Supabase **Authentication → Users**, copy your user's UUID.
4. In **SQL Editor**, run this statement after replacing the UUID:

```sql
update public.profiles
set role = 'host'
where id = 'YOUR_AUTH_USER_UUID';
```

5. Sign out and sign in again (or refresh) to load the host role.

Only do this for the trusted event organizer. Never add a host UUID to client code.

## 5. Invite participants

- Participants create their own accounts.
- The host opens **Teams → Create team** and assigns registered accounts.
- Students can submit only for a team where they have a membership row. RLS checks membership in the database.
- Students cannot assign themselves to teams or change their own role.
- Hosts can manage teams and memberships. Judges can review and score but cannot manage the team roster.
- Use the host account to create the ten teams and assign members as registration completes.

## 6. Deploy

You can deploy the Vite `dist` output to Vercel, Netlify, or another static host:

```bash
npm run build
```

Set the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` environment variables in the hosting provider. Deploy the `dist` directory. For a production event, configure Supabase Auth site URL and allowed redirect URLs to the deployed domain.

## Security notes

- Never commit `.env`.
- Never expose the Supabase database password, `service_role` key, or any secret in `VITE_*` variables.
- The browser UI is not the security boundary; the SQL RLS policies are.
- Review Supabase Auth email confirmation, password policy, allowed redirect URLs, and backups before a live event.
- For stronger judging controls, have the host create judge accounts and promote their roles with SQL. Do not let users choose roles at signup.
- The score constraints validate the broad score range at the database level; the React client validates each criterion against the round-specific rubric. Before a high-stakes live event, add a database trigger enforcing per-round criterion limits and maximum number of score rows if desired.
