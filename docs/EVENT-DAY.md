# Event-day runbook — 23 October 2026, 3:00–5:00 PM IST, ICT Classroom

## Before the day

1. Migration applied to the live project (README → Database setup). Host account promoted.
2. ✅ Platforms confirmed: ChatGPT, Gemini, Claude, DeepSeek (+ Microsoft Copilot, Perplexity as backups).
   Check each opens on the classroom Wi-Fi.
3. ✅ Tie-break confirmed: Round 4 → 3 → 2 → 1 (applied automatically on the leaderboard).
4. Participants register and confirm their email. Host builds teams of 3–4 (**Teams → Create team** or
   **Import roster** with `email,team,captain`), sets captains, then **Finalize teams**.
5. Promote judges on **Event settings → People and roles**.
6. Overview → **Event readiness** shows all green.
7. Rehearse once with `npm run dev:demo`.
8. Supabase dashboard: confirm the project is not paused (free projects pause after a week without activity). Leaked-password protection needs the Pro plan — skipped.

## Run sheet (120 minutes)

| Time | What | Portal action (host) |
|---|---|---|
| 3:00 | Check-in and sign-in | Students sign in; each sees their team on Overview |
| 3:10 | Briefing: rules + AI-platform rule | — |
| ~3:20 | Round 1 — Prompt Golf (12 min) | **Rounds & scoring → Open round** |
| | Round 2 — Guardrail Challenge (13 min) | Close R1 (or let the timer expire), open R2 |
| | Round 3 — Artifact Forge (18 min) | Open R3; teams use **Round 3 checker** while building and attach their HTML; judges run the preview and/or walk to seats and tick **Local demo verified** |
| | Round 4 — AI Survival Dilemma (18 min) | Open R4; announce the surprise update mid-round |
| | Judging catch-up | **Round tracker** / Overview judging queue |
| ~4:45 | Results | Back up, then show the leaderboard |

Transitions between rounds are not pre-scheduled; keep the remaining ~59 minutes for briefing, transitions,
judging and results. Hosts can set a different number of minutes when opening any round, or set a new deadline
for an open round (e.g. if the Wi-Fi drops).

## During each round

- **Teams:** choose the round's AI platform on the round card (platforms used in earlier rounds are greyed out
  with the round they were used in), then **Submit work**. Edits are allowed until a judge starts reviewing or
  the round closes.
- **Host:** **Round tracker** shows, per team, the declared platform ("No platform" in amber) and status.
  If a team cannot submit (laptop died), the host can **Enter for a team** on Submissions — this works even
  after the deadline and is audited.
- **Judges:** Submissions → filter by round → **Review & score**. Read the **Auto-checks** box (advisory
  facts), then score. Each criterion is limited to its maximum; the database recomputes totals. Scoring
  automatically locks the team's edits. For Round 3, **Run app preview** opens the team's attached HTML.

## Corrections

- Wrong platform declared: open the submission → **Host corrections** → choose platform + reason.
- Invalid submission: **Reject submission** with a reason (it stops counting; team may resubmit while open).
- Score typo: any judge or host can re-open **Edit score** and save; the change is in the audit log.

## Results

1. Wait for the tracker to show every submission as **Scored** (or Rejected).
2. **Event settings → Full JSON backup** and **Results with platforms (CSV)**. Keep them privately
   (they contain names and emails).
3. Optional suspense: **Hide from students** before the announcement, then **Show to students**.
4. The leaderboard already applies the tie-break (R4 → R3 → R2 → R1). Only teams equal in every round show
   "tied" — organizers decide those.

## If something goes wrong

| Problem | Action |
|---|---|
| A student sees "not assigned to a team" | Teams → unlock, assign, finalize again |
| "Round is not open" | Check the round state on Rounds & scoring; set a new deadline |
| "No approved AI platform is left" | Platforms were deactivated — re-approve them on **AI platforms** |
| Portal unreachable | Collect submissions on paper/shared doc; host enters them later via **Enter for a team** |
