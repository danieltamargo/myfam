begin;

create table private.mfa_recovery_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz,
  required boolean not null default false,
  pending boolean not null default false,
  allowed_session_id uuid,
  job_id uuid
);
create table private.mfa_recovery_codes (
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  primary key (user_id, code_hash)
);
create table private.mfa_recovery_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('codes_replaced', 'codes_revoked', 'recovery_started', 'recovery_completed')),
  created_at timestamptz not null default now()
);
alter table private.mfa_recovery_state enable row level security;
alter table private.mfa_recovery_codes enable row level security;
alter table private.mfa_recovery_audit enable row level security;
revoke all on private.mfa_recovery_state, private.mfa_recovery_codes, private.mfa_recovery_audit from public, anon, authenticated, service_role;

create or replace function private.session_meets_mfa()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  request_role text := current_setting('role', true);
  caller_id uuid := (select auth.uid());
  recovery private.mfa_recovery_state%rowtype;
  session_id text := (select auth.jwt()->>'session_id');
begin
  if request_role = 'service_role' then return true; end if;
  if session_user in ('postgres', 'supabase_admin')
    and coalesce(request_role, 'none') not in ('authenticated', 'anon') then return true; end if;
  if caller_id is null then return false; end if;
  select * into recovery from private.mfa_recovery_state where user_id = caller_id;
  if recovery.started_at is not null then
    if recovery.pending then return false; end if;
    -- Revoked JWTs remain cryptographically valid; retain this fence after recovery.
    if not exists (select 1 from auth.sessions as s
      where s.id::text = session_id and s.user_id = caller_id and s.created_at >= recovery.started_at)
    then return false; end if;
    if recovery.required and recovery.allowed_session_id::text is distinct from session_id then return false; end if;
    if recovery.required and (select auth.jwt()->>'aal') is distinct from 'aal2' then return false; end if;
  end if;
  if (select auth.jwt()->>'aal') = 'aal2' then return true; end if;
  return not exists (select 1 from auth.mfa_factors as f where f.user_id = caller_id and f.status = 'verified');
end;
$$;

create function public.get_my_mfa_recovery_state()
returns table (required boolean, pending boolean, session_valid boolean, allowed boolean)
language sql stable security definer set search_path = '' as $$
  select coalesce(s.required, false), coalesce(s.pending, false),
    s.started_at is null or exists (select 1 from auth.sessions as a
      where a.id::text = (select auth.jwt()->>'session_id') and a.user_id = (select auth.uid()) and a.created_at >= s.started_at),
    s.allowed_session_id::text = (select auth.jwt()->>'session_id')
  from (select (select auth.uid()) as user_id) as caller
  left join private.mfa_recovery_state as s on s.user_id = caller.user_id
  where caller.user_id is not null;
$$;

create function public.replace_my_mfa_recovery_codes(p_hashes text[])
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid());
begin
  if caller_id is null or (select auth.jwt()->>'aal') is distinct from 'aal2'
    or not private.session_meets_mfa() then raise exception 'Verified second factor required' using errcode = '42501'; end if;
  if p_hashes is null or cardinality(p_hashes) not in (0, 8)
    or exists (select 1 from unnest(p_hashes) as h where h is null or h !~ '^[a-f0-9]{64}$')
    or (select count(distinct h) from unnest(p_hashes) as h) <> cardinality(p_hashes)
  then raise exception 'Invalid recovery hashes' using errcode = '22023'; end if;
  insert into private.mfa_recovery_state(user_id) values (caller_id) on conflict do nothing;
  perform 1 from private.mfa_recovery_state where user_id = caller_id for update;
  -- Recheck after taking the same lock used by recovery.
  if exists (select 1 from private.mfa_recovery_state where user_id = caller_id and (required or pending))
    then raise exception 'Recovery in progress' using errcode = '42501'; end if;
  delete from private.mfa_recovery_codes where user_id = caller_id;
  insert into private.mfa_recovery_codes(user_id, code_hash) select caller_id, h from unnest(p_hashes) as h;
  insert into private.mfa_recovery_audit(user_id, event) values (caller_id, case when cardinality(p_hashes) = 0 then 'codes_revoked' else 'codes_replaced' end);
end;
$$;

create function public.begin_mfa_recovery(p_user_id uuid, p_code_hash text, p_job_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare recovery private.mfa_recovery_state%rowtype;
begin
  if p_job_id is null then return false; end if;
  select * into recovery from private.mfa_recovery_state where user_id = p_user_id for update;
  if not found or recovery.required or not exists (select 1 from private.mfa_recovery_codes
    where user_id = p_user_id and code_hash = p_code_hash) then return false; end if;
  delete from private.mfa_recovery_codes where user_id = p_user_id;
  update private.mfa_recovery_state set started_at = clock_timestamp(), required = true, pending = true,
    allowed_session_id = null, job_id = p_job_id where user_id = p_user_id;
  insert into private.mfa_recovery_audit(user_id, event) values (p_user_id, 'recovery_started');
  return true;
end;
$$;

create function public.bind_mfa_recovery_session(p_user_id uuid, p_job_id uuid, p_session_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update private.mfa_recovery_state as r set allowed_session_id = p_session_id, pending = false, job_id = null
    where r.user_id = p_user_id and r.job_id = p_job_id and r.pending and r.required
    and exists (select 1 from auth.sessions as s where s.id = p_session_id and s.user_id = p_user_id and s.created_at >= r.started_at);
  if not found then raise exception 'Recovery session rejected' using errcode = '42501'; end if;
end;
$$;

create function public.complete_my_mfa_recovery()
returns void language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid());
begin
  perform 1 from private.mfa_recovery_state where user_id = caller_id for update;
  if (select auth.jwt()->>'aal') is distinct from 'aal2' or not private.session_meets_mfa()
    then raise exception 'Recovery second factor required' using errcode = '42501'; end if;
  update private.mfa_recovery_state set required = false, allowed_session_id = null
    where user_id = caller_id and required and not pending;
  if not found then raise exception 'Recovery not active' using errcode = '42501'; end if;
  insert into private.mfa_recovery_audit(user_id, event) values (caller_id, 'recovery_completed');
end;
$$;

revoke all on function public.get_my_mfa_recovery_state(), public.replace_my_mfa_recovery_codes(text[]), public.complete_my_mfa_recovery() from public, anon, authenticated, service_role;
grant execute on function public.get_my_mfa_recovery_state(), public.replace_my_mfa_recovery_codes(text[]), public.complete_my_mfa_recovery() to authenticated;
revoke all on function public.begin_mfa_recovery(uuid, text, uuid), public.bind_mfa_recovery_session(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.begin_mfa_recovery(uuid, text, uuid), public.bind_mfa_recovery_session(uuid, uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
