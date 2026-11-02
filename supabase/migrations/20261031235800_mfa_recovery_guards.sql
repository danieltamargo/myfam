begin;
do $guard$
declare
  signature text;
  definition text;
  body text;
begin
  foreach signature in array array[
    'public.replace_my_mfa_recovery_codes(text[])',
    'public.complete_my_mfa_recovery()'
  ] loop
    select pg_get_functiondef(signature::regprocedure), prosrc into definition, body
      from pg_proc where oid = signature::regprocedure;
    if body like '%private.require_session_mfa()%' then raise exception 'Unexpected existing recovery guard'; end if;
    execute replace(definition, body, E'\nbegin\n  perform private.require_session_mfa();\n' || body || E'\nend;\n');
  end loop;
end;
$guard$;
grant execute on function public.get_my_mfa_recovery_state(), public.replace_my_mfa_recovery_codes(text[]), public.complete_my_mfa_recovery() to service_role;
notify pgrst, 'reload schema';
commit;
