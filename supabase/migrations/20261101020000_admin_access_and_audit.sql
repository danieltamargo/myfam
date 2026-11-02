begin;

create or replace function private.session_meets_mfa()
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  request_role text := current_setting('role', true);
  caller_id uuid := (select auth.uid());
  recovery private.mfa_recovery_state%rowtype;
  session_id text := (select auth.jwt()->>'session_id');
begin
  if request_role = 'service_role' then return true; end if;
  if session_user in ('postgres', 'supabase_admin')
    and coalesce(request_role, 'none') not in ('authenticated', 'anon')
  then return true; end if;
  if caller_id is null then return false; end if;
  -- Existing restrictive policies and RPC guards also reject unexpired banned JWTs.
  if not exists (select 1 from auth.users as account where account.id = caller_id
    and (account.banned_until is null or account.banned_until <= statement_timestamp()))
  then return false; end if;
  select * into recovery from private.mfa_recovery_state where user_id = caller_id;
  if recovery.started_at is not null then
    if recovery.pending then return false; end if;
    if not exists (select 1 from auth.sessions as s
      where s.id::text = session_id and s.user_id = caller_id and s.created_at >= recovery.started_at)
    then return false; end if;
    if recovery.required and recovery.allowed_session_id::text is distinct from session_id then return false; end if;
    if recovery.required and (select auth.jwt()->>'aal') is distinct from 'aal2' then return false; end if;
  end if;
  if (select auth.jwt()->>'aal') = 'aal2' then return true; end if;
  return not exists (select 1 from auth.mfa_factors as factor
    where factor.user_id = caller_id and factor.status = 'verified');
end;
$$;

create function public.admin_record_user_operation(p_actor uuid, p_target uuid,
  p_action text, p_status text, p_operation uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_actor is null or p_operation is null or p_action is null or p_status is null
    or p_action not in ('user_invited','user_enabled','user_disabled','user_welcome_sent')
    or p_status not in ('pending','succeeded','failed') then
    raise exception 'Invalid administrative operation' using errcode = '22023';
  end if;
  insert into public.audit_logs(user_id,action,module_name,resource_type,resource_id,metadata)
  values (p_actor, p_action || '_' || p_status, 'admin', 'user', p_target,
    jsonb_build_object('operation_id',p_operation,'status',p_status));
end;
$$;

create function public.admin_auth_events(p_limit integer default 26, p_offset integer default 0)
returns table(id uuid, created_at timestamptz, actor_id text, action text)
language sql stable security definer set search_path = ''
as $$
  select entry.id, entry.created_at,
    case when entry.payload->>'actor_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then entry.payload->>'actor_id' else null end,
    case when entry.payload->>'action' ~ '^[a-z_]{1,80}$'
      then entry.payload->>'action' else 'auth_event' end
  from auth.audit_log_entries as entry
  order by entry.created_at desc, entry.id desc
  limit greatest(1, least(coalesce(p_limit,26), 26))
  offset greatest(0, least(coalesce(p_offset,0), 249975));
$$;

revoke all on function public.admin_record_user_operation(uuid,uuid,text,text,uuid),
  public.admin_auth_events(integer,integer) from public, anon, authenticated;
grant execute on function public.admin_record_user_operation(uuid,uuid,text,text,uuid),
  public.admin_auth_events(integer,integer) to service_role;

create index audit_logs_created_id_idx on public.audit_logs(created_at desc, id desc);
notify pgrst, 'reload schema';
commit;
