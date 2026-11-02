begin;

-- Owner edits must have the same outcome regardless of hidden coordination.
-- Existing allocations survive reductions; coordination RPCs still enforce capacity.
drop trigger gift_items_enforce_capacity on public.gift_items;
drop function private.enforce_gift_item_capacity();

commit;
