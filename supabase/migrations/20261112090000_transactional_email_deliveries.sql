create table public.transactional_email_deliveries (
  delivery_key text primary key,
  delivered_at timestamptz not null default now()
);

alter table public.transactional_email_deliveries enable row level security;
revoke all on public.transactional_email_deliveries from anon, authenticated;
