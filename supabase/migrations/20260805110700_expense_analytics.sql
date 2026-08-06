begin;

create or replace function public.get_expense_dashboard(
  p_collection_id uuid,
  p_from date,
  p_to date,
  p_previous_from date,
  p_previous_to date,
  p_paid_by uuid default null,
  p_category_id uuid default null,
  p_granularity text default 'day'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with scoped as materialized (
    select expense.category_id, expense.paid_by, expense.amount, expense.occurred_on
    from public.expenses as expense
    where expense.collection_id = p_collection_id
      and expense.occurred_on between p_previous_from and p_to
      and (p_paid_by is null or expense.paid_by = p_paid_by)
      and (p_category_id is null or expense.category_id = p_category_id)
  ),
  current_period as (
    select * from scoped where occurred_on between p_from and p_to
  ),
  category_totals as (
    select category_id, sum(amount) as total
    from current_period
    group by category_id
  ),
  payer_totals as (
    select paid_by, sum(amount) as total
    from current_period
    group by paid_by
  ),
  series_totals as (
    select
      case
        when p_granularity = 'month'
          then date_trunc('month', occurred_on::timestamp)::date
        else occurred_on
      end as bucket,
      sum(amount) as total
    from current_period
    group by bucket
  )
  select jsonb_build_object(
    'current_total', coalesce(
      (select sum(amount) from current_period),
      0::numeric
    ),
    'previous_total', coalesce(
      (
        select sum(amount)
        from scoped
        where occurred_on between p_previous_from and p_previous_to
      ),
      0::numeric
    ),
    'by_category', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('category_id', category_id, 'total', total)
          order by total desc, category_id
        )
        from category_totals
      ),
      '[]'::jsonb
    ),
    'by_payer', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('paid_by', paid_by, 'total', total)
          order by total desc, paid_by
        )
        from payer_totals
      ),
      '[]'::jsonb
    ),
    'series', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('period', bucket, 'total', total)
          order by bucket
        )
        from series_totals
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_expense_dashboard(
  uuid,
  date,
  date,
  date,
  date,
  uuid,
  uuid,
  text
) from public, anon;

grant execute on function public.get_expense_dashboard(
  uuid,
  date,
  date,
  date,
  date,
  uuid,
  uuid,
  text
) to authenticated;

commit;
