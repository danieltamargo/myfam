begin;

create table public.family_member_birthdays (
  family_id uuid not null,
  user_id uuid not null,
  month smallint not null check (month between 1 and 12),
  day smallint not null,
  primary key (family_id, user_id),
  foreign key (family_id, user_id)
    references public.family_members(family_id, user_id) on delete cascade,
  constraint valid_birthday_day check (
    day between 1 and case month
      when 2 then 29 when 4 then 30 when 6 then 30
      when 9 then 30 when 11 then 30 else 31 end
  )
);

alter table public.family_member_birthdays enable row level security;
revoke all on public.family_member_birthdays from anon;
grant select, insert, update, delete on public.family_member_birthdays to authenticated;

create policy birthday_family_read on public.family_member_birthdays for select to authenticated
using (private.is_family_member(family_id, (select auth.uid())));

create policy birthday_member_insert on public.family_member_birthdays for insert to authenticated
with check (
  private.is_family_member(family_id, (select auth.uid()))
  and (user_id = (select auth.uid())
    or private.has_family_role(family_id, (select auth.uid()), array['owner', 'admin']))
);

create policy birthday_member_update on public.family_member_birthdays for update to authenticated
using (
  private.is_family_member(family_id, (select auth.uid()))
  and (user_id = (select auth.uid())
    or private.has_family_role(family_id, (select auth.uid()), array['owner', 'admin']))
)
with check (
  private.is_family_member(family_id, (select auth.uid()))
  and (user_id = (select auth.uid())
    or private.has_family_role(family_id, (select auth.uid()), array['owner', 'admin']))
);

create policy birthday_member_delete on public.family_member_birthdays for delete to authenticated
using (
  private.is_family_member(family_id, (select auth.uid()))
  and (user_id = (select auth.uid())
    or private.has_family_role(family_id, (select auth.uid()), array['owner', 'admin']))
);

create policy session_mfa_required on public.family_member_birthdays
as restrictive for all to authenticated
using ((select private.session_meets_mfa()))
with check ((select private.session_meets_mfa()));

comment on table public.family_member_birthdays is
  'Optional birthdays shared within one family, without birth year. Removed with membership.';

notify pgrst, 'reload schema';
commit;
