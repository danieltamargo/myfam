with candidates as (
  select
    'invitation:' || invitation.id || ':' || coalesce(invitation.updated_at, invitation.created_at) as delivery_key,
    invitation.invited_user_id as recipient_id,
    'invitation' as kind,
    coalesce(family.alias, family.name) as title,
    '/dashboard' as path
  from public.family_invitations invitation
  join public.families family on family.id = invitation.family_id
  where invitation.status = 'pending'
    and coalesce(invitation.updated_at, invitation.created_at) >= now() - interval '7 days'
    and not exists (
      select from public.family_members member
      where member.family_id = family.id and member.user_id = invitation.invited_user_id
    )

  union all

  select 'reminder:' || reminder.id, reminder.recipient_id, 'event', event.title,
    format('/family/%s/calendar?event=%s', event.family_id, event.id)
  from public.calendar_event_reminders reminder
  join public.calendar_events event on event.id = reminder.event_id
  join public.family_modules module on module.family_id = event.family_id
    and module.module_name = 'calendar' and module.enabled
  where reminder.scheduled_for <= now() and reminder.occurrence_start >= now()
    and private.can_view_calendar_event(event.id, reminder.recipient_id)

  union all

  select 'birthday:' || birthday.family_id || ':' || birthday.user_id || ':' ||
      member.user_id || ':' || extract(year from upcoming.day)::integer,
    member.user_id, 'birthday_wishlist', profile.display_name,
    format('/family/%s/wishlist?member=%s', birthday.family_id, birthday.user_id)
  from public.family_member_birthdays birthday
  join public.profiles profile on profile.id = birthday.user_id
  join public.family_members member on member.family_id = birthday.family_id
    and member.user_id <> birthday.user_id
  join public.family_modules module on module.family_id = birthday.family_id
    and module.module_name = 'wishlist' and module.enabled
  cross join lateral (
    select min(current_date + offset_days) as day
    from generate_series(0, 7) as offset_days
    where extract(month from current_date + offset_days) = birthday.month
      and extract(day from current_date + offset_days) = birthday.day
  ) upcoming
  where upcoming.day is not null

  union all

  select 'event-wishlist:' || event.id || ':' || member.user_id || ':' || event.starts_at,
    member.user_id, 'event_wishlist', event.title, format('/family/%s/wishlist', event.family_id)
  from public.calendar_events event
  join public.gift_calendar_event_links link on link.event_id = event.id
  join public.gift_items item on item.id = link.item_id and item.status = 'active'
  join public.family_members member on member.family_id = event.family_id
    and member.user_id <> item.owner_id
  join public.family_modules module on module.family_id = event.family_id
    and module.module_name = 'wishlist' and module.enabled
  join public.family_modules calendar_module on calendar_module.family_id = event.family_id
    and calendar_module.module_name = 'calendar' and calendar_module.enabled
  where event.starts_at between now() and now() + interval '7 days'
    and private.can_view_calendar_event(event.id, member.user_id)
  group by event.id, member.user_id
)
select coalesce(jsonb_agg(to_jsonb(batch)), '[]')
from (
  select candidate.delivery_key, candidate.kind, candidate.title, candidate.path,
    recipient.email, recipient.raw_user_meta_data->>'locale' as locale
  from candidates candidate
  join auth.users recipient on recipient.id = candidate.recipient_id
  where recipient.email_confirmed_at is not null and recipient.email is not null
    and (recipient.banned_until is null or recipient.banned_until <= now())
    and not exists (
      select from public.transactional_email_deliveries sent where sent.delivery_key = candidate.delivery_key
    )
  order by candidate.delivery_key
  limit 100
) batch;
