# Handover for co-leads

Everything needed to run **PROMPT WARS: AI Survival Arena** with this app, and to change it later.
Screen-by-screen steps are in the shared **User Guide**; this file is the short version that lives with the code.

## Status (tested 14 Nov 2026)

A full rehearsal ran on the live site with the real Gemini AI judge and a test team of five; everything worked.

| Step | Result |
| --- | --- |
| AI connection test | 3.1 Flash-Lite 0.9 s, 3.5 Flash-Lite 1.0 s (3.8 Flash is slow; it is only the last backup) |
| Team of 5 with roles | Saved: Pilot, 2 Prompt Crafters, Debugger/Verifier, Strategist/Scribe |
| Rounds 1–4 | AI scored 23/25, 18/30, 10/35 (no HTML attached), 32/40, each criterion with a reason; one failed first try was retried automatically |
| Round 2 chatbot, Round 4 update, leaderboard | All worked (83/130 total) |
| Cleanup | Test data removed; all rounds back to Upcoming |

Automated checks: 48 unit, 28 database-security and 21 browser tests pass (`npm test`, `npm run test:db`, `npx playwright test`).
`npm run demo:video` records a 6.5-minute captioned demo (host, participant and judge views) into `walkthrough/`.

## What runs where

| Part | Where | Notes |
| --- | --- | --- |
| App | https://prompt-wars-gitam.vercel.app | Vercel project `prompt-wars-gitam`; deploys on every push to `main` |
| Database | Supabase project `prompt-wars-control-center` | Schema = `supabase/schema.sql` + `supabase/migrations/` in order |
| AI judge | Google Gemini (free tier) via `api/` functions | Needs `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as Vercel env vars (server-only, never `VITE_`) |

Vercel, Supabase and the Gemini key stay in the lead's accounts.

## Access to hand over

1. **Host role in the app (must do).** Each co-lead signs up as *Organizer / judge*; an existing host sets them to
   **host** under **Event settings → People and roles**. Make at least two hosts (hosts cannot change their own role).
2. **GitHub (for code changes).** Repository → Settings → Collaborators → Add people.
3. **Supabase (for database changes).** Invite one co-lead to the organization, if possible.
4. **Vercel / Gemini key.** Only needed to change server keys; the lead does it, or transfers the project.

## Making changes later

| Change | Who | Lead's accounts? |
| --- | --- | --- |
| Tasks, judge notes, round minutes, team size, platforms, chatbot, leaderboard visibility, AI on/off, venue/timing | Any host, in the app | No |
| People: judges, hosts, team names, members, roles | Any host, in the app | No |
| Code (labels, fields, rules) | GitHub collaborator pushes to `main` | Usually no (if Vercel blocks a deploy by a non-owner author, the lead clicks **Redeploy**) |
| Database structure | Run the new `supabase/migrations/` file in the SQL Editor **before** pushing code that needs it | Yes |
| Server keys | Vercel project owner | Yes |

Agree a change freeze 2–3 days before the event; after it, only in-app changes. Re-run a rehearsal after any code change.

## Decisions still open

- Date, time (90-minute window) and venue → **Event settings**.
- Email confirmation is **already off** (verified 14 Nov 2026): accounts work straight away and no emails are sent,
  so many teams can sign up at once. Keep it off — Supabase's built-in sender only sends a few emails per hour.
  Addresses aren't verified, so check the **Teams** page before **Finalize teams**.
- Final round tasks and judge notes → **Rounds & scoring → Task & AI judge notes (host)** (sample tasks are loaded).
- Round 4 surprise update: the text is saved only when **Release update now** is clicked — keep it in a note.
- Leaderboard visible during the event, or hidden until the announcement → **Event settings → Standings visibility**.
- Tell the faculty coordinator that scoring uses Google Gemini with judges reviewing (the proposal mentioned human judges).

## Event day (90 minutes)

One host laptop stays signed in with the app open the whole time — it runs the AI judge when each round closes.

| Time | What | Host action |
| --- | --- | --- |
| −30 min | Laptop on charger, signed in | **Test the AI connection** |
| 0:00 | Briefing | — |
| 0:08 | Round 1 Prompt Golf, 12 min | **Open round** |
| 0:22 | Round 2 Guardrail Challenge, 13 min | **Open round** |
| 0:37 | Round 3 Artifact Forge, 18 min | **Open round** |
| 0:57 | Round 4 AI Survival Dilemma, 18 min | **Open round**; about 9 min in, **Release update now** |
| 1:15 | Round 4 closes | Check every entry is *Scored*; review any *flagged* |
| 1:20 | Results | Show the leaderboard; **Full JSON backup** |

Rounds close on their timers and are scored automatically. Ties: Round 4, then 3, 2, 1.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| No scores a minute after a round closes | Keep a host page open; **Score this round now** on the closed round |
| *Failed — retrying* | Retries every 20 s; else **Re-run AI judge** or score by hand |
| Gemini down | **Event settings → Turn AI judging off**; judges score in **Submissions** with the same rubric |
| Host laptop dies | Any host signs in elsewhere; scoring resumes |
| Teams need more time | Change **Minutes**, **Set new deadline** |
| A team couldn't submit | **Submissions → Enter for a team**, then **Re-run AI judge** |
| Wrong platform | Open the submission → **Host corrections → Reject submission** |
| Round opened by mistake | **Reset** (submissions are kept) |

## Removing rehearsal test data

The app will not delete a team that has submissions. In the Supabase SQL Editor (role `postgres`), with the test
team's exact name:

```sql
begin;
delete from public.submissions where team_id = (select id from public.teams where name = 'ZZ Rehearsal Team');
delete from public.teams where name = 'ZZ Rehearsal Team';
update public.round_briefs set update_text = null, update_released_at = null where round_id = 4;
commit;
```

Then **Reset** each round in the app so all four show Upcoming.

## After the event

Download **Full JSON backup** and **Results with platforms (CSV)** (they contain names and emails — keep them private),
use the CSV for certificates, and optionally delete the Gemini key in Google AI Studio.

## Keeping it safe

- Secret keys live only in Vercel environment variables — never in chat, code, or a `VITE_` variable.
- Database changes only from `supabase/migrations/`, in order; each should end with *Success. No rows returned*.
- Never drop tables or reset the database; every change is in **Event settings → Audit log**.
- Round 2 teams test only the fictional in-app chatbot, with harmless prompts.
