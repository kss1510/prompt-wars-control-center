-- Prompt Wars Control Center — team size 3–4 (organizer decision, 18 Oct 2026)
-- Apply AFTER 20261018090000_round3_workspace.sql. Safe to run more than once. No rows are deleted.
-- New default limits, and the live setting moves from the old 4–5 default. A host-chosen value other
-- than 4–5 is left alone. Existing teams are not changed; the readiness checklist and "Finalize teams"
-- flag any team outside the new limits.

begin;

alter table public.event_settings
  alter column team_min_size set default 3,
  alter column team_max_size set default 4;

update public.event_settings
   set team_min_size = 3, team_max_size = 4, updated_at = now()
 where team_min_size = 4 and team_max_size = 5;

commit;
