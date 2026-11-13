-- Prompt Wars Control Center — one account per team (organizer decision, 13 Nov 2026)
-- Apply AFTER 20261018120000_team_size_3_4.sql. Safe to run more than once. No rows are deleted.
--
-- Only each team's representative signs up. The host records every participant by name in
-- teams.member_names; that list (not the number of accounts) is what the 3–4 size rule counts.
--   * teams.member_names: participant names, trimmed, unique per team, at most team_max_size.
--   * team_members: at most ONE account per team (the representative, who declares platforms
--     and submits). Existing RLS already limits submissions to that account.
--   * Finalizing teams requires 3–4 names AND a representative account for every team.
--   * Roster import takes one row per participant: {team, name, email?}; email only on the
--     representative's row. Teams in the file get exactly the names listed.

begin;

alter table public.teams add column if not exists member_names text[] not null default '{}';
do $$ begin
  alter table public.teams add constraint teams_member_names_count check (cardinality(member_names) <= 10);
exception when duplicate_object then null; end $$;

grant update (member_names) on public.teams to authenticated;

create or replace function public.teams_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare settings public.event_settings;
begin
  if auth.uid() is not null and not public.is_host() then
    raise exception 'Only a host can manage teams.';
  end if;
  select * into settings from public.event_settings;
  if tg_op in ('INSERT','DELETE') and auth.uid() is not null and settings.teams_locked then
    raise exception 'Teams are finalized. Unlock teams before creating or deleting a team.';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  new.member_names := coalesce(array(
    select trim(x.n) from unnest(new.member_names) with ordinality as x(n, i)
    where trim(coalesce(x.n, '')) <> '' order by x.i), '{}');
  if exists (select 1 from unnest(new.member_names) n where length(n) > 80) then
    raise exception 'Member names must be at most 80 characters.';
  end if;
  if (select count(distinct lower(n)) from unnest(new.member_names) n) <> cardinality(new.member_names) then
    raise exception 'A member name is listed twice in this team.';
  end if;
  if cardinality(new.member_names) > settings.team_max_size then
    raise exception 'A team can have at most % members (this list has %).', settings.team_max_size, cardinality(new.member_names);
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and settings.teams_locked
     and new.member_names is distinct from old.member_names then
    raise exception 'Teams are finalized. Unlock teams before changing members.';
  end if;
  if new.captain_id is not null and not exists (
       select 1 from public.team_members m where m.team_id = new.id and m.user_id = new.captain_id) then
    raise exception 'The captain must be a member of this team.';
  end if;
  return new;
end;
$$;

create or replace function public.team_members_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare settings public.event_settings;
begin
  if auth.uid() is not null and not public.is_host() then
    raise exception 'Only a host can change team membership.';
  end if;
  select * into settings from public.event_settings;
  if auth.uid() is not null and settings.teams_locked then
    raise exception 'Teams are finalized. A host must unlock teams before changing membership.';
  end if;
  if tg_op = 'DELETE' then
    update public.teams set captain_id = null where id = old.team_id and captain_id = old.user_id;
    return old;
  end if;
  if (select p.role from public.profiles p where p.id = new.user_id) <> 'student' then
    raise exception 'Only student accounts can be team members.';
  end if;
  if exists (select 1 from public.team_members m where m.team_id = new.team_id) then
    raise exception 'This team already has its representative account. Remove it first to assign a different one.';
  end if;
  return new;
end;
$$;

create or replace function public.host_set_teams_locked(p_locked boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  settings public.event_settings;
  problems text;
begin
  if not public.is_host() then raise exception 'Only a host can finalize teams.'; end if;
  select * into settings from public.event_settings;
  if p_locked then
    if not exists (select 1 from public.teams) then raise exception 'Create teams before finalizing.'; end if;
    select string_agg(issue, '; ' order by issue) into problems from (
      select format('%s has %s member%s (needs %s–%s)', t.name, cardinality(t.member_names),
                    case when cardinality(t.member_names) = 1 then '' else 's' end,
                    settings.team_min_size, settings.team_max_size) as issue
      from public.teams t
      where cardinality(t.member_names) not between settings.team_min_size and settings.team_max_size
      union all
      select format('%s has no representative account', t.name)
      from public.teams t
      where not exists (select 1 from public.team_members m where m.team_id = t.id)
    ) issues;
    if problems is not null then
      raise exception 'Cannot finalize: %.', problems;
    end if;
  end if;
  update public.event_settings set teams_locked = p_locked, updated_at = now();
end;
$$;

-- Roster import: [{ "team": "...", "name": "...", "email": "rep@..." }, ...] — one row per participant,
-- email only on the representative's row. All-or-nothing; p_apply = false only validates.
create or replace function public.host_import_roster(p_rows jsonb, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  settings public.event_settings;
  item jsonb;
  idx integer := 0;
  v_team text;
  v_name text;
  v_email text;
  tkey text;
  tinfo jsonb;
  plan jsonb := '{}'::jsonb;
  report jsonb := '[]'::jsonb;
  errors integer := 0;
  msg text;
  prof public.profiles;
  existing_team text;
  rep_email text;
  n integer;
  tid bigint;
begin
  if not public.is_host() then raise exception 'Only a host can import a roster.'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Roster must be a JSON array.'; end if;
  select * into settings from public.event_settings;
  if settings.teams_locked then raise exception 'Teams are finalized. Unlock teams before importing.'; end if;

  for item in select * from jsonb_array_elements(p_rows) loop
    idx := idx + 1;
    v_team := trim(coalesce(item ->> 'team', ''));
    v_name := trim(coalesce(item ->> 'name', ''));
    v_email := nullif(lower(trim(coalesce(item ->> 'email', ''))), '');
    msg := null;
    prof := null;
    existing_team := null;
    if v_team = '' or v_name = '' then
      msg := 'Team and name are required.';
    elsif length(v_team) > 60 then
      msg := 'Team name is longer than 60 characters.';
    elsif length(v_name) > 80 then
      msg := 'Name is longer than 80 characters.';
    else
      tkey := lower(v_team);
      tinfo := coalesce(plan -> tkey, jsonb_build_object('name', v_team, 'names', '[]'::jsonb, 'emails', '[]'::jsonb));
      if exists (select 1 from jsonb_array_elements_text(tinfo -> 'names') x where lower(x) = lower(v_name)) then
        msg := 'This name is listed twice for the team.';
      else
        tinfo := jsonb_set(tinfo, '{names}', (tinfo -> 'names') || to_jsonb(v_name));
        if v_email is not null then
          select * into prof from public.profiles p where lower(p.email) = v_email;
          if prof.id is null then
            msg := 'No registered account with this email (the representative must sign up first).';
          elsif prof.role <> 'student' then
            msg := 'Account is a ' || prof.role || ', not a student.';
          elsif exists (select 1 from jsonb_each(plan) e, jsonb_array_elements_text(e.value -> 'emails') x where x = v_email) then
            msg := 'This email is already a representative in this file.';
          else
            select t.name into existing_team from public.team_members m join public.teams t on t.id = m.team_id
             where m.user_id = prof.id;
            if existing_team is not null and lower(existing_team) <> tkey then
              msg := 'This account already represents team ' || existing_team || '.';
            else
              tinfo := jsonb_set(tinfo, '{emails}', (tinfo -> 'emails') || to_jsonb(v_email));
            end if;
          end if;
        end if;
      end if;
      plan := jsonb_set(plan, array[tkey], tinfo);
    end if;
    if msg is not null then errors := errors + 1; end if;
    report := report || jsonb_build_object('row', idx, 'team', v_team, 'name', v_name, 'email', v_email,
                'status', case when msg is null then 'ok' else 'error' end,
                'message', coalesce(msg, case when v_email is not null then 'Representative (signs in and submits).' else 'Member.' end));
  end loop;

  for tkey, tinfo in select e.key, e.value from jsonb_each(plan) e loop
    n := jsonb_array_length(tinfo -> 'names');
    if jsonb_array_length(tinfo -> 'emails') > 1 then
      errors := errors + 1;
      report := report || jsonb_build_object('row', null, 'team', tinfo ->> 'name', 'status', 'error',
                  'message', 'More than one representative email: each team has exactly one account.');
    end if;
    if n not between settings.team_min_size and settings.team_max_size then
      errors := errors + 1;
      report := report || jsonb_build_object('row', null, 'team', tinfo ->> 'name', 'status', 'error',
                  'message', format('Lists %s member%s; teams need %s–%s.', n, case when n = 1 then '' else 's' end,
                                    settings.team_min_size, settings.team_max_size));
    end if;
    select lower(p.email) into rep_email from public.teams t join public.team_members m on m.team_id = t.id
      join public.profiles p on p.id = m.user_id where lower(t.name) = tkey;
    if rep_email is not null and jsonb_array_length(tinfo -> 'emails') = 1 and rep_email <> tinfo -> 'emails' ->> 0 then
      errors := errors + 1;
      report := report || jsonb_build_object('row', null, 'team', tinfo ->> 'name', 'status', 'error',
                  'message', 'This team already has a different representative. Remove it on the Teams page first.');
    end if;
    rep_email := null;
  end loop;

  if p_apply and errors = 0 then
    for tkey, tinfo in select e.key, e.value from jsonb_each(plan) e loop
      select t.id into tid from public.teams t where lower(t.name) = tkey;
      if tid is null then
        insert into public.teams (name, member_names)
        values (tinfo ->> 'name', array(select jsonb_array_elements_text(tinfo -> 'names')))
        returning id into tid;
      else
        update public.teams set member_names = array(select jsonb_array_elements_text(tinfo -> 'names')) where id = tid;
      end if;
      if jsonb_array_length(tinfo -> 'emails') = 1 and not exists (select 1 from public.team_members m where m.team_id = tid) then
        insert into public.team_members (team_id, user_id)
        select tid, p.id from public.profiles p where lower(p.email) = tinfo -> 'emails' ->> 0;
      end if;
      tid := null;
    end loop;
  end if;

  return jsonb_build_object('ok', errors = 0, 'applied', p_apply and errors = 0, 'errors', errors, 'rows', report);
end;
$$;

commit;
