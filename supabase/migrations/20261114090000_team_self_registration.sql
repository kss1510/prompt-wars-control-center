-- Prompt Wars Control Center — teams register themselves at sign-up (organizer decision, 14 Nov 2026)
-- Apply AFTER 20261113090000_one_account_per_team.sql. Safe to run more than once. No rows are deleted.
--
-- The representative signs up and registers the team in one go: team name + every member's name.
--   * register_team(): a signed-in student without a team creates their team and becomes its
--     representative. Team size (3–4 names including the representative), unique team names and
--     "one team per account" are enforced here; registration closes when teams are finalized.
--   * update_my_team(): the representative may fix the team name / member names until teams
--     are finalized.
--   * The team guards accept these two RPCs through a transaction-local flag that only these
--     SECURITY DEFINER functions set. Clients cannot set it: PostgREST exposes neither SET nor
--     set_config, and direct table writes by students are still refused by RLS and the guards.
-- Hosts keep every existing tool (create, edit, import, delete, finalize).

begin;

create or replace function public.trusted_team_rpc()
returns boolean language sql stable set search_path = ''
as $$ select coalesce(current_setting('app.team_rpc', true), '') = 'on' $$;

create or replace function public.teams_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare settings public.event_settings;
begin
  if auth.uid() is not null and not public.is_host() and not public.trusted_team_rpc() then
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
     and (new.member_names is distinct from old.member_names
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

create or replace function public.team_members_guard()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare settings public.event_settings;
begin
  if auth.uid() is not null and not public.is_host() and not public.trusted_team_rpc() then
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

-- Shared validation for self-service team details. Returns the cleaned member list.
create or replace function public.validate_team_details(p_team_id bigint, p_team_name text, p_member_names text[])
returns text[] language plpgsql stable security definer set search_path = ''
as $$
declare
  settings public.event_settings;
  names text[];
begin
  select * into settings from public.event_settings;
  if settings.teams_locked then
    raise exception 'Team registration is closed (teams are finalized). Contact the event host.';
  end if;
  if not public.has_text(p_team_name) or length(trim(p_team_name)) > 60 then
    raise exception 'Team name must be 1–60 characters.';
  end if;
  if exists (select 1 from public.teams t where lower(t.name) = lower(trim(p_team_name))
             and t.id is distinct from p_team_id) then
    raise exception 'The team name "%" is already taken. Choose another.', trim(p_team_name);
  end if;
  names := coalesce(array(
    select trim(x.n) from unnest(coalesce(p_member_names, '{}')) with ordinality as x(n, i)
    where trim(coalesce(x.n, '')) <> '' order by x.i), '{}');
  if cardinality(names) not between settings.team_min_size and settings.team_max_size then
    raise exception 'Teams need % to % members including you (you entered %).',
      settings.team_min_size, settings.team_max_size, cardinality(names);
  end if;
  return names;
end;
$$;

-- p_member_names: everyone on the team, including the representative's own name.
create or replace function public.register_team(p_team_name text, p_member_names text[])
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  names text[];
  tid bigint;
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if (select p.role from public.profiles p where p.id = uid) is distinct from 'student' then
    raise exception 'Organizer and judge accounts do not register a team.';
  end if;
  if exists (select 1 from public.team_members m where m.user_id = uid) then
    raise exception 'Your account already represents a team.';
  end if;
  names := public.validate_team_details(null, p_team_name, p_member_names);
  perform set_config('app.team_rpc', 'on', true);
  insert into public.teams (name, member_names) values (trim(p_team_name), names) returning id into tid;
  insert into public.team_members (team_id, user_id) values (tid, uid);
  perform set_config('app.team_rpc', '', true);
  return tid;
exception when unique_violation then
  raise exception 'The team name "%" is already taken. Choose another.', trim(p_team_name);
end;
$$;

-- The representative fixes their own team's name / member names until teams are finalized.
create or replace function public.update_my_team(p_team_name text, p_member_names text[])
returns void language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  tid bigint;
  names text[];
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  select m.team_id into tid from public.team_members m where m.user_id = uid;
  if tid is null then raise exception 'Your account is not linked to a team.'; end if;
  names := public.validate_team_details(tid, p_team_name, p_member_names);
  perform set_config('app.team_rpc', 'on', true);
  update public.teams set name = trim(p_team_name), member_names = names where id = tid;
  perform set_config('app.team_rpc', '', true);
exception when unique_violation then
  raise exception 'The team name "%" is already taken. Choose another.', trim(p_team_name);
end;
$$;

revoke all on function public.trusted_team_rpc(), public.validate_team_details(bigint, text, text[]),
  public.register_team(text, text[]), public.update_my_team(text, text[]) from public, anon, authenticated;
grant execute on function public.register_team(text, text[]), public.update_my_team(text, text[]) to authenticated;

commit;
