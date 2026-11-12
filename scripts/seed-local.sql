begin;
select pg_advisory_xact_lock(hashtext('myfamily/local-seed')) as seed_lock \gset
create temporary table seed_image_targets (gift_id uuid, item_id uuid, object_prefix text) on commit drop;

do $seed$
declare
  seed jsonb := convert_from(decode('__SEED_PAYLOAD__', 'base64'), 'UTF8')::jsonb;
  family_group record;
  person record;
  gift record;
  target_family uuid;
  family_owner uuid;
  actual_owner uuid;
  legacy_owner uuid;
  target_item uuid;
  general_category uuid;
  test_event uuid := 'd2fe4287-4d18-4b4e-a0f7-0a61524c3b4a';
  test_start timestamptz;
begin
  select id into legacy_owner from auth.users
  where lower(email) = lower(seed->>'legacy_owner_email');

  for family_group in
    select seed->>'official' as name, seed->>'alias' as alias, seed->'members' as members, false as test
    union all select 'Test', null, seed->'test_members', true
  loop
    select (member->>'id')::uuid into strict family_owner
    from jsonb_array_elements(family_group.members) as member where member->>'role' = 'owner';

    select id into target_family from public.families
    where name = family_group.name and (alias is not distinct from family_group.alias or created_by = family_owner)
    order by created_at limit 1;
    if target_family is null and family_group.test then
      select id into target_family from public.families
      where name = 'Familia de pruebas MyFamily' and created_by = family_owner;
      update public.families set name = 'Test' where id = target_family;
    end if;
    if target_family is null then
      perform set_config('request.jwt.claim.sub', family_owner::text, true);
      target_family := public.create_family(family_group.name);
      update public.families set alias = family_group.alias where id = target_family;
      if not family_group.test then
        update public.family_modules set enabled = false
        where family_id = target_family and module_name <> 'wishlist';
      end if;
    end if;
    select user_id into strict actual_owner from public.family_members
    where family_id = target_family and role = 'owner';

    for person in select * from jsonb_to_recordset(family_group.members)
      as members(id uuid, role text, month smallint, day smallint)
    loop
      insert into public.family_members (family_id, user_id, role)
      values (target_family, person.id, case
        when person.id = actual_owner then 'owner'
        when person.role = 'owner' then 'admin' else person.role end)
      on conflict (family_id, user_id) do update set role = 'admin'
      where family_members.role = 'member' and excluded.role = 'admin';
      insert into public.family_member_birthdays (family_id, user_id, month, day)
      values (target_family, person.id, person.month, person.day) on conflict do nothing;
    end loop;

    if legacy_owner is not null and actual_owner = legacy_owner and family_owner <> legacy_owner then
      perform set_config('request.jwt.claim.sub', legacy_owner::text, true);
      perform set_config('request.jwt.claims', '{"aal":"aal2"}', true);
      perform public.transfer_family_ownership(target_family, family_owner);
      actual_owner := family_owner;
    end if;
    if legacy_owner is not null and legacy_owner <> actual_owner
      and exists (select from public.family_members where family_id = target_family and user_id = legacy_owner)
      and not exists (select from jsonb_array_elements(family_group.members) member
        where (member->>'id')::uuid = legacy_owner)
    then
      perform set_config('request.jwt.claim.sub', actual_owner::text, true);
      perform public.remove_family_member(target_family, legacy_owner);
    end if;

    if family_group.test then
      update public.family_modules set enabled = true where family_id = target_family;
      insert into public.family_modules (family_id, module_name, enabled, enabled_at, enabled_by)
      values (target_family, 'games', true, now(), actual_owner)
      on conflict (family_id, module_name) do update set enabled = true;
    end if;
    select id into strict general_category from public.gift_event_categories
    where family_id = target_family and name = 'Todos';

    for gift in select * from jsonb_to_recordset(case when family_group.test then
      jsonb_build_array(jsonb_build_object(
        'id', '80e31735-2ca7-4f7b-96e0-0391dcc392a9', 'user_id', family_owner,
        'name', 'Juego de mesa de prueba', 'quantity', 1, 'bought', true
      )) else seed->'gifts' end)
      as items(id uuid, user_id uuid, name text, match_name text, description text,
        link text, quantity smallint, bought boolean)
    loop
      select id into target_item from public.gift_items
      where family_id = target_family and owner_id = gift.user_id
        and (id = gift.id or name in (gift.name, gift.match_name))
      order by (id = gift.id) desc, created_at limit 1;
      if target_item is null then
        insert into public.gift_items (id, family_id, owner_id, name, description, links, desired_quantity)
        values (gift.id, target_family, gift.user_id, gift.name, gift.description,
          case when gift.link is not null then array[gift.link] end, gift.quantity)
        returning id into target_item;
        insert into public.gift_item_events (item_id, event_category_id)
        values (target_item, general_category);
        if gift.bought then
          insert into public.gift_purchases (item_id, quantity_purchased, purchased_at)
          values (target_item, gift.quantity, null);
        end if;
      end if;
      insert into seed_image_targets select gift.id, target_item, target_family || '/' || gift.user_id
      where not family_group.test and exists (
        select from public.gift_items where id = target_item and image_url is null
      );
    end loop;
    if family_group.test then
      insert into public.calendar_events (id, family_id, created_by, title, starts_at, ends_at, timezone)
      values (test_event, target_family, actual_owner, 'Merienda familiar de prueba',
        now() + interval '1 day', now() + interval '25 hours', 'Europe/Madrid')
      on conflict (id) do nothing;
      select starts_at into strict test_start from public.calendar_events
      where id = test_event and family_id = target_family;
      insert into public.calendar_event_reminders
        (event_id, recipient_id, occurrence_start, minutes_before, scheduled_for)
      values (test_event, family_owner, test_start, 1440, test_start - interval '1 day')
      on conflict do nothing;
      insert into public.gift_calendar_event_links (item_id, event_id, family_id)
      values (target_item, test_event, target_family) on conflict do nothing;
    end if;
  end loop;
end;
$seed$;

select coalesce(jsonb_agg(jsonb_build_array(gift_id, object_prefix, item_id)), '[]')
from seed_image_targets;
commit;
