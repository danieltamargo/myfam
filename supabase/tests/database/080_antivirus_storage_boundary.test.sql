begin;
-- Match Storage API's transaction context while exercising its RLS policies.
set local storage.allow_delete_query = 'true';
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id, role, email, raw_user_meta_data, created_at, updated_at)
values ('80000000-0000-4000-8000-000000000001', 'authenticated',
  'av-boundary@example.test', '{"name":"Antivirus fixture"}', now(), now());
insert into public.families(id,name,created_by) values
  ('80000000-1000-4000-8000-000000000001','Antivirus family','80000000-0000-4000-8000-000000000001');
insert into public.expense_collections(id,family_id,created_by,name) values
  ('80000000-2000-4000-8000-000000000001','80000000-1000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','Antivirus receipts');

-- Deliberately permissive fixtures prove the restrictive boundary overrides other grants.
create policy av_fixture_insert on storage.objects for insert to authenticated with check (true);
create policy av_fixture_update on storage.objects for update to authenticated using (true) with check (true);
create policy av_fixture_select on storage.objects for select to authenticated using (true);
create policy av_fixture_delete on storage.objects for delete to authenticated using (true);
insert into storage.buckets(id, name) values ('av-unrelated-fixture', 'av-unrelated-fixture');
select lives_ok($$insert into storage.objects(bucket_id, name, metadata) values
  ('gift-images', '80000000-1000-4000-8000-000000000001/owner/av-fixture', '{"size":1}'),
  ('expense-receipts', '80000000-2000-4000-8000-000000000001/owner/av-fixture', '{"size":1}'),
  ('family-documents', '80000000-1000-4000-8000-000000000001/owner/av-fixture', '{"size":1}')$$, 'privileged scanned-upload storage fixtures remain possible');

set local role authenticated;
set local request.jwt.claims = '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
select throws_ok($$insert into storage.objects(bucket_id, name) values ('gift-images', 'unscanned')$$, '42501', null, 'direct gift image INSERT denied');
select throws_ok($$insert into storage.objects(bucket_id, name) values ('expense-receipts', 'unscanned')$$, '42501', null, 'direct receipt INSERT denied');
select throws_ok($$insert into storage.objects(bucket_id, name) values ('family-documents', 'unscanned')$$, '42501', null, 'direct document INSERT denied');
select results_eq($$with changed as (update storage.objects set metadata = '{"modified":true}' where bucket_id = 'gift-images' returning id) select count(*)::integer from changed$$, array[0], 'direct image overwrite denied');
select results_eq($$with changed as (update storage.objects set metadata = '{"modified":true}' where bucket_id = 'expense-receipts' returning id) select count(*)::integer from changed$$, array[0], 'direct receipt overwrite denied');
select results_eq($$with changed as (update storage.objects set metadata = '{"modified":true}' where bucket_id = 'family-documents' returning id) select count(*)::integer from changed$$, array[0], 'direct document overwrite denied');
select lives_ok($$insert into storage.objects(bucket_id, name) values ('av-unrelated-fixture', 'allowed'); update storage.objects set metadata = '{}' where bucket_id = 'av-unrelated-fixture'$$, 'unrelated bucket INSERT and UPDATE grants remain effective');
select is((select count(*)::integer from storage.objects where name like '%/av-fixture'), 3, 'SELECT grants remain effective');
select results_eq($$with removed as (delete from storage.objects where name like '%/av-fixture' returning id) select count(*)::integer from removed$$, array[3], 'DELETE grants remain effective');
reset role;
select * from finish();
rollback;
