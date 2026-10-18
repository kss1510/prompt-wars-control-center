-- Prompt Wars Control Center — Round 3 workspace, platform list and tie-break
-- Apply AFTER 20261017090000_event_readiness.sql. Safe to run more than once. No rows are deleted.
--
-- Adds:
--   * submissions.artifact_html: the team's single-file HTML app (optional, up to 300,000 characters),
--     so judges can open the real app in a sandboxed preview instead of relying on a localhost URL.
--     It is team work: covered by the same edit rules as the other deliverables (judges cannot edit it).
--   * Organizer-confirmed platforms: DeepSeek (4th core) plus Microsoft Copilot and Perplexity (backups).
--   * Organizer-confirmed tie-break text. The app applies the order R4 → R3 → R2 → R1 automatically.

begin;

alter table public.submissions add column if not exists artifact_html text;
do $$ begin
  alter table public.submissions add constraint submissions_artifact_html_length
    check (artifact_html is null or length(artifact_html) <= 300000);
exception when duplicate_object then null; end $$;

-- Same guard as before, with artifact_html treated as team work.
create or replace function public.submissions_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  privileged boolean := (auth.uid() is null) or public.is_host();
  staff boolean := public.is_staff();
  declared bigint;
  rname text;
begin
  select r.name into rname from public.rounds r where r.id = new.round_id;
  if rname is null then raise exception 'Unknown round %.', new.round_id; end if;

  if tg_op = 'INSERT' then
    if not privileged and not public.round_accepting(new.round_id) then
      raise exception 'Round % (%) is not open for submissions.', new.round_id, rname;
    end if;
    select p.platform_id into declared from public.team_round_platforms p
     where p.team_id = new.team_id and p.round_id = new.round_id;
    if declared is null then
      raise exception 'Select your team''s AI platform for Round % before submitting.', new.round_id;
    end if;
    if exists (select 1 from public.submissions s where s.team_id = new.team_id
               and s.round_id = new.round_id and s.status <> 'Rejected') then
      raise exception 'Your team already has a submission for Round %. Edit it instead.', new.round_id;
    end if;
    new.platform_id := declared;
    new.status := 'Submitted';
    new.demo_verified := false;
    new.demo_verified_by := null;
    new.demo_verified_at := null;
    new.reviewed_by := null;
    new.rejection_reason := null;
    new.created_at := now();
    new.updated_at := now();
    perform public.check_submission_deliverables(new);
    return new;
  end if;

  if new.team_id <> old.team_id or new.round_id <> old.round_id
     or new.submitted_by <> old.submitted_by or new.created_at <> old.created_at then
    raise exception 'Team, round, submitter and submission time cannot be changed.';
  end if;

  if new.platform_id is distinct from old.platform_id then
    select p.platform_id into declared from public.team_round_platforms p
     where p.team_id = new.team_id and p.round_id = new.round_id;
    if new.platform_id is distinct from declared then
      raise exception 'The AI platform is changed through the round platform selection, not the submission.';
    end if;
  end if;

  if row(new.title, new.prompt_text, new.output_text, new.notes, new.analysis_text, new.evidence_text,
         new.artifact_filename, new.demo_details, new.evidence_url, new.initial_plan, new.revised_plan,
         new.risks_mitigation, new.artifact_html)
     is distinct from
     row(old.title, old.prompt_text, old.output_text, old.notes, old.analysis_text, old.evidence_text,
         old.artifact_filename, old.demo_details, old.evidence_url, old.initial_plan, old.revised_plan,
         old.risks_mitigation, old.artifact_html) then
    if staff and not privileged then
      raise exception 'Judges cannot edit a team''s work.';
    end if;
    if not privileged and (old.status <> 'Submitted' or not public.round_accepting(new.round_id)) then
      raise exception 'This submission can no longer be edited (the round closed or review has started).';
    end if;
    perform public.check_submission_deliverables(new);
  end if;

  if new.status <> old.status then
    if not staff and not privileged then
      raise exception 'Only judges and hosts can change a submission''s review status.';
    end if;
    if (new.status = 'Rejected' or old.status = 'Rejected') and not privileged then
      raise exception 'Only a host can reject or restore a submission.';
    end if;
    if new.status = 'Scored' and not coalesce(public.submission_fully_scored(new.id), false) then
      raise exception 'Score every rubric criterion before marking the submission as Scored.';
    end if;
    if old.status = 'Rejected' and exists (select 1 from public.submissions s where s.team_id = new.team_id
         and s.round_id = new.round_id and s.status <> 'Rejected' and s.id <> new.id) then
      raise exception 'This team already has another active submission for Round %.', new.round_id;
    end if;
    new.reviewed_by := coalesce(uid, old.reviewed_by);
  end if;

  if new.rejection_reason is distinct from old.rejection_reason and not privileged then
    raise exception 'Only a host can set a rejection reason.';
  end if;

  if new.demo_verified is distinct from old.demo_verified then
    if not staff and not privileged then
      raise exception 'Only judges and hosts can verify a local demo.';
    end if;
    new.demo_verified_by := case when new.demo_verified then uid end;
    new.demo_verified_at := case when new.demo_verified then now() end;
  else
    new.demo_verified_by := old.demo_verified_by;
    new.demo_verified_at := old.demo_verified_at;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

grant insert (artifact_html), update (artifact_html) on public.submissions to authenticated;

-- Organizer-confirmed platforms (18 Oct 2026). Existing names are left untouched.
insert into public.ai_platforms (name)
select v.name from (values ('DeepSeek'), ('Microsoft Copilot'), ('Perplexity')) as v(name)
where not exists (select 1 from public.ai_platforms p where lower(trim(p.name)) = lower(v.name));

-- Organizer-confirmed tie-break. Only filled in if no rule has been entered yet.
update public.event_settings
   set tie_break_rule = 'Higher Round 4 score, then Round 3, then Round 2, then Round 1. Teams equal in every round share the rank (organizers decide).',
       updated_at = now()
 where tie_break_rule is null;

commit;
