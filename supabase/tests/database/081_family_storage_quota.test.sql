begin;
-- Match Storage API's transaction context while exercising its RLS policies.
set local storage.allow_delete_query = 'true';
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, role, email, raw_user_meta_data, created_at, updated_at)
values ('81000000-0000-4000-8000-000000000001','authenticated','quota@example.test','{}',now(),now());
insert into public.families(id,name,created_by) values
  ('81000000-1000-4000-8000-000000000001','Quota A','81000000-0000-4000-8000-000000000001'),
  ('81000000-1000-4000-8000-000000000002','Quota B','81000000-0000-4000-8000-000000000001');
insert into public.expense_collections(id,family_id,created_by,name) values
  ('81000000-2000-4000-8000-000000000001','81000000-1000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Receipts A'),
  ('81000000-2000-4000-8000-000000000002','81000000-1000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Receipts A second');
insert into private.family_storage_limits(family_id,limit_bytes)
values ('81000000-1000-4000-8000-000000000001',100);

select ok(not has_table_privilege('authenticated','private.family_storage_limits','select'),'client cannot inspect quota overrides');
select ok(not has_table_privilege('authenticated','private.family_storage_limits','update'),'client cannot raise its quota');
select ok(not has_table_privilege('service_role','private.family_storage_limits','insert'),'service uploads cannot change quotas');
select ok(not has_function_privilege('authenticated','private.enforce_family_storage_quota()','execute'),'trigger function is not a client API');
select ok(not has_function_privilege('service_role','private.reject_unfinished_storage_probe()','execute'),'probe check is not a service API');
select ok(not has_function_privilege('anon','public.family_storage_has_capacity(text,text,bigint)','execute'),'anonymous clients cannot inspect capacity');
select ok(not has_function_privilege('authenticated','public.family_storage_has_capacity(text,text,bigint)','execute'),'authenticated clients cannot inspect capacity');
select ok(has_function_privilege('service_role','public.family_storage_has_capacity(text,text,bigint)','execute'),'only service uploads can diagnose capacity');
select ok(not has_function_privilege('service_role','private.family_storage_used_bytes(uuid,text,text,uuid,bigint)','execute'),'service clients cannot query private usage totals');
select is(public.family_storage_has_capacity('gift-images','81000000-1000-4000-8000-000000000001/owner/first',100),true,
  'diagnostic accepts the exact available family capacity');

insert into storage.objects(bucket_id,name,metadata) values
  ('gift-images','81000000-1000-4000-8000-000000000001/owner/gift','{"size":20}'),
  ('expense-receipts','81000000-2000-4000-8000-000000000001/owner/receipt','{"size":"30"}'),
  ('expense-receipts','81000000-2000-4000-8000-000000000002/owner/receipt','{"size":10}');
select lives_ok($$insert into storage.objects(bucket_id,name,metadata) values
  ('family-documents','81000000-1000-4000-8000-000000000001/owner/document','{"size":40}')$$,
  'three buckets and multiple receipt collections share the exact family limit');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values
  ('gift-images','81000000-1000-4000-8000-000000000001/owner/excess','{"size":1}')$$,
  'P0001','FAMILY_STORAGE_QUOTA_EXCEEDED','one extra byte is rejected');
select lives_ok($$update storage.objects set metadata='{"size":40,"mimetype":"application/pdf"}'
  where name='81000000-1000-4000-8000-000000000001/owner/document'$$,
  'metadata replacement does not double-count the object');
select lives_ok($$insert into storage.objects(id,bucket_id,name,metadata)
  select id,bucket_id,name,'{"size":40}'::jsonb from storage.objects
  where name='81000000-1000-4000-8000-000000000001/owner/document'
  on conflict (id) do update set metadata=excluded.metadata$$,
  'Storage upsert excludes the existing row before its INSERT conflict check');
select throws_ok($$update storage.objects set metadata='{"size":41}'
  where name='81000000-1000-4000-8000-000000000001/owner/document'$$,
  'P0001','FAMILY_STORAGE_QUOTA_EXCEEDED','larger replacement cannot exceed quota');
update private.family_storage_limits set limit_bytes=90
where family_id='81000000-1000-4000-8000-000000000001';
select lives_ok($$update storage.objects set updated_at=now()
  where name='81000000-1000-4000-8000-000000000001/owner/document'$$,
  'timestamp touches remain allowed when an existing family exceeds its reduced quota');
update private.family_storage_limits set limit_bytes=100
where family_id='81000000-1000-4000-8000-000000000001';

create function pg_temp.check_versioned_storage_quota() returns setof text
language plpgsql as $test$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='storage' and table_name='objects' and column_name='is_versioned') then
    return query select skip('Storage versioning columns are absent on this release', 6);
    return;
  end if;
  return query select throws_ok($$insert into storage.objects(bucket_id,name,metadata,is_versioned) values
    ('gift-images','81000000-1000-4000-8000-000000000001/owner/versioned','{"size":1}',true)$$,
    '22023','Versioned family storage is not supported','managed uploads reject unsupported versioning');
  return query select throws_ok($$update storage.objects set is_versioned=true
    where name='81000000-1000-4000-8000-000000000001/owner/document'$$,
    '22023','Versioned family storage is not supported','changing only versioning flags cannot bypass the guard');
  return query select throws_ok($$insert into storage.objects(bucket_id,name,metadata,archived_at) values
    ('gift-images','81000000-1000-4000-8000-000000000001/owner/archived','{"size":1}',now())$$,
    '22023','Versioned family storage is not supported','managed uploads reject archived rows');
  return query select throws_ok($$insert into storage.objects(bucket_id,name,metadata,is_delete_marker) values
    ('gift-images','81000000-1000-4000-8000-000000000001/owner/marker','{"size":0}',true)$$,
    '22023','Versioned family storage is not supported','managed uploads reject delete markers');

  -- Seed a historical row to simulate data predating this quota migration.
  set constraints storage.reject_unfinished_storage_probe immediate;
  alter table storage.objects disable trigger enforce_family_storage_quota;
  execute $$insert into storage.objects(bucket_id,name,version,metadata,is_versioned,archived_at) values
    ('family-documents','81000000-1000-4000-8000-000000000001/owner/document','legacy-history','{"size":2}',true,now())$$;
  alter table storage.objects enable trigger enforce_family_storage_quota;
  set constraints storage.reject_unfinished_storage_probe deferred;
  return query select throws_ok($$update storage.objects set metadata='{"size":39}'
    where name='81000000-1000-4000-8000-000000000001/owner/document' and archived_at is null$$,
    'P0001','FAMILY_STORAGE_QUOTA_EXCEEDED','same-path history remains counted when replacing the current object');
  return query select is(public.family_storage_has_capacity('family-documents',
    '81000000-1000-4000-8000-000000000001/owner/document',39),false,
    'service diagnostic includes the same archived history as atomic enforcement');
  delete from storage.objects where version='legacy-history';
end;
$test$;
select * from pg_temp.check_versioned_storage_quota();

delete from storage.objects where name='81000000-1000-4000-8000-000000000001/owner/gift';
select lives_ok($$insert into storage.objects(bucket_id,name,metadata) values
  ('family-documents','81000000-1000-4000-8000-000000000001/owner/released','{"size":20}')$$,
  'deleting an object releases its bytes');

select lives_ok($$insert into storage.objects(bucket_id,name,metadata) values
  ('gift-images','81000000-1000-4000-8000-000000000002/owner/default','{"size":1073741824}')$$,
  'another family has an independent 1 GiB default');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values
  ('gift-images','81000000-1000-4000-8000-000000000002/owner/excess','{"size":1}')$$,
  'P0001','FAMILY_STORAGE_QUOTA_EXCEEDED','default budget is enforced');
select throws_ok($$update storage.objects set name='81000000-1000-4000-8000-000000000001/owner/moved'
  where name='81000000-1000-4000-8000-000000000002/owner/default'$$,
  'P0001','FAMILY_STORAGE_QUOTA_EXCEEDED','moving an object checks the destination family');

select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values
  ('gift-images','81000000-1000-4000-8000-000000000001/owner/negative','{"size":-1}')$$,
  '22023','Invalid storage size','negative size is rejected');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values
  ('gift-images','81000000-1000-4000-8000-000000000001/owner/fraction','{"size":1.5}')$$,
  '22023','Invalid storage size','fractional size is rejected');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values
  ('gift-images','81000000-1000-4000-8000-000000000001/owner/missing','{}')$$,
  '22023','Invalid storage size','missing size is rejected outside a permission probe');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values
  ('gift-images','81000000-1000-4000-8000-000000000001/owner/overflow','{"size":"9223372036854775808"}')$$,
  '22023','Invalid storage size','overflow size is rejected');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values
  ('expense-receipts','81000000-1000-4000-8000-000000000002/owner/forged','{"size":1}')$$,
  '22023','Invalid storage scope','receipt prefix must identify an existing collection');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values
  ('gift-images','not-a-family/owner/forged','{"size":1}')$$,
  '22023','Invalid storage scope','malformed scope fails without another family detail');

savepoint permission_probe;
select lives_ok($$insert into storage.objects(bucket_id,name,version) values
  ('gift-images','81000000-1000-4000-8000-000000000001/owner/probe','1')$$,
  'Storage 1.33 permission probe remains compatible even at full quota');
select throws_ok('set constraints storage.reject_unfinished_storage_probe immediate',
  '22023','Invalid storage size','a size-less permission probe cannot commit');
rollback to savepoint permission_probe;
savepoint modern_permission_probe;
select lives_ok($$insert into storage.objects(bucket_id,name,version,metadata) values
  ('gift-images','81000000-1000-4000-8000-000000000001/owner/probe','1','{"mimetype":"image/png","contentLength":10}')$$,
  'Storage 1.84 permission probe metadata remains compatible');
rollback to savepoint modern_permission_probe;
delete from storage.objects where name='81000000-1000-4000-8000-000000000001/owner/released';
insert into storage.objects(bucket_id,name,version) values
  ('gift-images','81000000-1000-4000-8000-000000000001/owner/completed','1');
update storage.objects set version='complete',metadata='{"size":20}'
where name='81000000-1000-4000-8000-000000000001/owner/completed';
select lives_ok('set constraints storage.reject_unfinished_storage_probe immediate',
  'deferred validation reads the final persisted metadata');

set local role service_role;
select is(public.family_storage_has_capacity('gift-images','81000000-1000-4000-8000-000000000001/owner/service-excess',1),false,
  'service diagnostic recognizes a shared full family quota');
select is(public.family_storage_has_capacity('gift-images','81000000-1000-4000-8000-000000000001/owner/completed',20),true,
  'service diagnostic excludes the current replacement size');
select is(public.family_storage_has_capacity('expense-receipts','81000000-2000-4000-8000-000000000002/owner/service-excess',1),false,
  'receipt capacity resolves the collection to its family across buckets');
select throws_ok($$select public.family_storage_has_capacity('gift-images',
  '81000000-1000-4000-8000-000000000001/owner/invalid',-1)$$,
  '22023','Invalid storage size','diagnostic rejects negative byte sizes');
select throws_ok($$select public.family_storage_has_capacity('gift-images','invalid/owner/path',1)$$,
  '22023','Invalid storage scope','diagnostic rejects malformed scope without family details');
select throws_ok($$insert into storage.objects(bucket_id,name,metadata) values
  ('gift-images','81000000-1000-4000-8000-000000000001/owner/service-excess','{"size":1}')$$,
  'P0001','FAMILY_STORAGE_QUOTA_EXCEEDED','service role cannot bypass the accumulated quota');
reset role;
set local role authenticated;
select throws_ok($$select public.family_storage_has_capacity('gift-images',
  '81000000-1000-4000-8000-000000000001/owner/service-excess',1)$$,
  '42501',null,'authenticated callers cannot invoke capacity diagnostics');
reset role;
set local role anon;
select throws_ok($$select public.family_storage_has_capacity('gift-images',
  '81000000-1000-4000-8000-000000000001/owner/service-excess',1)$$,
  '42501',null,'anonymous callers cannot invoke capacity diagnostics');
reset role;
select * from finish();
rollback;
