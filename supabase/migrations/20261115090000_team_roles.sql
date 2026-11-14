-- Prompt Wars Control Center — teams of 5 with the proposal's roles (organizer decision, 15 Nov 2026)
-- Apply AFTER 20261114150000_round2_rule_bot_notes.sql. Safe to run more than once. No rows are deleted.
--
-- The approved proposal: teams of five — Pilot, two Prompt Crafters, Debugger/Verifier and
-- Strategist/Scribe.
--   * teams.member_roles: one role per member name, in the same order (empty = no roles recorded,
--     e.g. teams a host created or imported).
--   * A role may not be used more often than its slots (Pilot 1, Prompt Crafter 2,
--     Debugger/Verifier 1, Strategist/Scribe 1): a team of 5 has exactly the proposal's mix.
--   * Self-registration (register_team / update_my_team) now requires a role for every member.
--   * Team size moves from 3–4 to 5–5, only if it is still the previous 3–4 setting. A host can still
--     change it under Event settings. Existing teams are not changed; the Teams page flags any team
--     outside the limits.

begin;

alter table public.teams add column if not exists member_roles text[] not null default '{}';
-- Hosts edit roles beside names (the guard above still refuses everyone else).
grant update (member_roles) on public.teams to authenticated;

-- Null when the roles are acceptable; otherwise the message to show.
create or replace function public.team_roles_error(p_names text[], p_roles text[], p_required boolean)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  roles text[] := coalesce(p_roles, '{}');
  n int := coalesce(cardinality(p_names), 0);
  bad text;
begin
  if not p_required and cardinality(roles) = 0 then return null; end if;
  if cardinality(roles) <> n or exists (select 1 from unnest(roles) r where coalesce(trim(r), '') = '') then
    return 'Choose a role for every team member.';
  end if;
  select r into bad from unnest(roles) r
   where r not in ('Pilot', 'Prompt Crafter', 'Debugger/Verifier', 'Strategist/Scribe') limit 1;
  if bad is not null then return format('"%s" is not a team role.', bad); end if;
  if (select count(*) from unnest(roles) r where r = 'Pilot') > 1 then return 'A team has one Pilot.'; end if;
  if (select count(*) from unnest(roles) r where r = 'Prompt Crafter') > 2 then return 'A team has two Prompt Crafters.'; end if;
  if (select count(*) from unnest(roles) r where r = 'Debugger/Verifier') > 1 then return 'A team has one Debugger/Verifier.'; end if;
  if (select count(*) from unnest(roles) r where r = 'Strategist/Scribe') > 1 then return 'A team has one Strategist/Scribe.'; end if;
  return null;
end;
$$;

create or replace function public.teams_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  settings public.event_settings;
  problem text;
begin
  if auth.uid() is not null and not public.is_host() and not public.trusted_team_rpc() then
    raise exception 'Only a host can manage teams.';
  end if;
  select * into settings from public.event_settings;
  if tg_op in ('INSERT','DELETE') and auth.uid() is not null and settings.teams_locked then
    raise exception 'Teams are finalized. Unlock teams before creating or deleting a team.';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  new.member_roles := coalesce(new.member_roles, '{}');
  -- New names without new roles (e.g. a roster import): the old roles no longer line up, so drop them.
  if tg_op = 'UPDATE' and new.member_names is distinct from old.member_names
     and new.member_roles is not distinct from old.member_roles then
    new.member_roles := '{}';
  end if;
  -- Drop blank names, keeping each remaining name's role beside it.
  if cardinality(new.member_roles) > 0 then
    if cardinality(new.member_roles) <> cardinality(new.member_names) then
      raise exception 'Choose a role for every team member.';
    end if;
    select coalesce(array_agg(trim(x.n) order by x.i), '{}'), coalesce(array_agg(trim(coalesce(x.r, '')) order by x.i), '{}')
      into new.member_names, new.member_roles
      from unnest(new.member_names, new.member_roles) with ordinality as x(n, r, i)
     where trim(coalesce(x.n, '')) <> '';
  else
    new.member_names := coalesce(array(
      select trim(x.n) from unnest(new.member_names) with ordinality as x(n, i)
      where trim(coalesce(x.n, '')) <> '' order by x.i), '{}');
  end if;
  if exists (select 1 from unnest(new.member_names) n where length(n) > 80) then
    raise exception 'Member names must be at most 80 characters.';
  end if;
  if (select count(distinct lower(n)) from unnest(new.member_names) n) <> cardinality(new.member_names) then
    raise exception 'A member name is listed twice in this team.';
  end if;
  if cardinality(new.member_names) > settings.team_max_size then
    raise exception 'A team can have at most % members (this list has %).', settings.team_max_size, cardinality(new.member_names);
  end if;
  problem := public.team_roles_error(new.member_names, new.member_roles, false);
  if problem is not null then raise exception '%', problem; end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and settings.teams_locked
     and (new.member_names is distinct from old.member_names
          or new.member_roles is distinct from old.member_roles
          or (public.trusted_team_rpc() and new.name is distinct from old.name)) then
    raise exception 'Teams are finalized. Unlock teams before changing members.';
  end if;
  if new.captain_id is not null and not exists (
       select 1 from public.team_members m where m.team_id = new.id and m.user_id = new.captain_id) then
    raise exception 'The captain must be a member of this team.';
  end if;
  return new;
end;
$$;

-- Self-service registration now carries one role per member (required).
drop function if exists public.register_team(text, text[]);
drop function if exists public.update_my_team(text, text[]);

create or replace function public.register_team(p_team_name text, p_member_names text[], p_member_roles text[])
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  names text[];
  kept_names text[];
  kept_roles text[];
  problem text;
  tid bigint;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if (select p.role from public.profiles p where p.id = uid) is distinct from 'student' then
    raise exception 'Organizer and judge accounts do not register a team.';
  end if;
  if exists (select 1 from public.team_members m where m.user_id = uid) then
    raise exception 'Your account already represents a team.';
  end if;
  -- Keep each named member's role beside them (rows without a name are dropped together with their role).
  select coalesce(array_agg(trim(x.n) order by x.i), '{}'), coalesce(array_agg(trim(coalesce(x.r, '')) order by x.i), '{}')
    into kept_names, kept_roles
    from unnest(coalesce(p_member_names, '{}'), coalesce(p_member_roles, '{}')) with ordinality as x(n, r, i)
   where trim(coalesce(x.n, '')) <> '';
  names := public.validate_team_details(null, p_team_name, kept_names);
  problem := public.team_roles_error(names, kept_roles, true);
  if problem is not null then raise exception '%', problem; end if;
  perform set_config('app.team_rpc', 'on', true);
  insert into public.teams (name, member_names, member_roles)
       values (trim(p_team_name), names, kept_roles) returning id into tid;
  insert into public.team_members (team_id, user_id) values (tid, uid);
  perform set_config('app.team_rpc', '', true);
  return tid;
exception when unique_violation then
  raise exception 'The team name "%" is already taken. Choose another.', trim(p_team_name);
end;
$$;

create or replace function public.update_my_team(p_team_name text, p_member_names text[], p_member_roles text[])
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tid bigint;
  names text[];
  kept_names text[];
  kept_roles text[];
  problem text;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  select m.team_id into tid from public.team_members m where m.user_id = uid;
  if tid is null then raise exception 'Your account is not linked to a team.'; end if;
  -- Keep each named member's role beside them (rows without a name are dropped together with their role).
  select coalesce(array_agg(trim(x.n) order by x.i), '{}'), coalesce(array_agg(trim(coalesce(x.r, '')) order by x.i), '{}')
    into kept_names, kept_roles
    from unnest(coalesce(p_member_names, '{}'), coalesce(p_member_roles, '{}')) with ordinality as x(n, r, i)
   where trim(coalesce(x.n, '')) <> '';
  names := public.validate_team_details(tid, p_team_name, kept_names);
  problem := public.team_roles_error(names, kept_roles, true);
  if problem is not null then raise exception '%', problem; end if;
  perform set_config('app.team_rpc', 'on', true);
  update public.teams set name = trim(p_team_name), member_names = names,
         member_roles = kept_roles where id = tid;
  perform set_config('app.team_rpc', '', true);
exception when unique_violation then
  raise exception 'The team name "%" is already taken. Choose another.', trim(p_team_name);
end;
$$;

revoke all on function public.team_roles_error(text[], text[], boolean),
  public.register_team(text, text[], text[]), public.update_my_team(text, text[], text[]) from public, anon, authenticated;
grant execute on function public.register_team(text, text[], text[]), public.update_my_team(text, text[], text[]) to authenticated;

-- Teams of 5 (only if the setting is still the previous 3–4).
alter table public.event_settings
  alter column team_min_size set default 5,
  alter column team_max_size set default 5;
update public.event_settings
   set team_min_size = 5, team_max_size = 5, updated_at = now()
 where team_min_size = 3 and team_max_size = 4;

commit;
