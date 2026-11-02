begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,role,email,raw_user_meta_data,created_at,updated_at)
select ('34000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated',
  'resource-audit-'||n||'@example.test','{"name":"Fixture"}',now(),now() from generate_series(1,3) n;
insert into public.families(id,name,created_by) values
  ('34000000-1000-4000-8000-000000000001','Fixture','34000000-0000-4000-8000-000000000001');
insert into public.family_members(family_id,user_id,role) values
  ('34000000-1000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','owner'),
  ('34000000-1000-4000-8000-000000000001','34000000-0000-4000-8000-000000000002','admin'),
  ('34000000-1000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','member');
insert into public.family_documents(id,family_id,owner_id,display_name,original_name,mime_type,size_bytes,storage_path,visibility,status) values
  ('34000000-2000-4000-8000-000000000001','34000000-1000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','Private document','fixture.pdf','application/pdf',2048,'34000000-1000-4000-8000-000000000001/34000000-0000-4000-8000-000000000003/34000000-2000-4000-8000-000000000001','private','active');
select set_config('request.jwt.claims','{"sub":"34000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select set_config('tests.note',public.create_family_note('34000000-1000-4000-8000-000000000001','Private note','Private content','private',array[]::uuid[])::text,true);
select set_config('tests.shared_note',public.create_family_note('34000000-1000-4000-8000-000000000001','Family note','Family content','family',array[]::uuid[])::text,true);
select public.update_family_document_access('34000000-2000-4000-8000-000000000001',1,'Confidential folder','private',array[]::uuid[],null);
select is((select count(*) from public.audit_logs),0::bigint,'member actor receives no additional audit grant');
reset role;
select set_config('request.jwt.claims','{"sub":"34000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.family_notes where id=current_setting('tests.note')::uuid),0::bigint,'owner cannot read private note');
select is((select count(*) from public.family_documents),0::bigint,'owner cannot read private document');
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.note')::uuid),0::bigint,'owner cannot infer private note UUID or visibility from audit');
select is((select count(*) from public.audit_logs where module_name='documents'),0::bigint,'owner cannot infer document UUID or folder metadata from audit');
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.shared_note')::uuid),1::bigint,'family note audit remains visible to owner');
select set_config('tests.owner_note',public.create_family_note('34000000-1000-4000-8000-000000000001','Owner private note','Private','private',array[]::uuid[])::text,true);
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.owner_note')::uuid),1::bigint,'owner actor retains own private note audit');
reset role;
select set_config('request.jwt.claims','{"sub":"34000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.note')::uuid or module_name='documents'),0::bigint,'admin outside audience cannot read private note or document audit');
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.shared_note')::uuid),1::bigint,'admin retains family note audit');
reset role;

insert into public.family_document_members(document_id,family_id,user_id,added_by) values
  ('34000000-2000-4000-8000-000000000001','34000000-1000-4000-8000-000000000001','34000000-0000-4000-8000-000000000002','34000000-0000-4000-8000-000000000003');
set local role authenticated;
select is((select metadata->>'folder_name' from public.audit_logs where module_name='documents'),'Confidential folder','admin in current document audience can read corresponding audit');
reset role;
delete from public.family_document_members where document_id='34000000-2000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*) from public.audit_logs where module_name='documents'),0::bigint,'revoking document audience also revokes audit metadata');
reset role;
insert into public.audit_logs(family_id,user_id,action,module_name,resource_type,resource_id,metadata) values
  ('34000000-1000-4000-8000-000000000001','34000000-0000-4000-8000-000000000003','documents.deleted','documents','family_document','34000000-2000-4000-8000-000000000099','{"mime_type":"application/pdf","size_bytes":2048}'),
  ('34000000-1000-4000-8000-000000000001','34000000-0000-4000-8000-000000000002','documents.deleted','documents','family_document','34000000-2000-4000-8000-000000000098','{"mime_type":"application/pdf"}');
set local role authenticated;
select is((select count(*) from public.audit_logs where resource_id='34000000-2000-4000-8000-000000000099'),0::bigint,'deleted private document remains hidden from nonactor');
select is((select count(*) from public.audit_logs where resource_id='34000000-2000-4000-8000-000000000098'),1::bigint,'admin actor retains own deleted document audit');
reset role;
select set_config('request.jwt.claims','{"sub":"34000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select set_config('tests.habit',public.create_family_habit('34000000-1000-4000-8000-000000000001','Private habit',null,'private',array[]::uuid[])::text,true);
select public.set_family_habit_completion(current_setting('tests.habit')::uuid,current_date,true);
select set_config('tests.shared_habit',public.create_family_habit('34000000-1000-4000-8000-000000000001','Shared habit',null,'selected_members',array['34000000-0000-4000-8000-000000000002'::uuid])::text,true);
select set_config('tests.list',public.create_family_list('34000000-1000-4000-8000-000000000001','Private list',null,'private',array[]::uuid[])::text,true);
select set_config('tests.item',public.add_family_list_item(current_setting('tests.list')::uuid,'Private item',1,null)::text,true);
select set_config('tests.deleted_item',public.add_family_list_item(current_setting('tests.list')::uuid,'Deleted private title',1,null)::text,true);
select public.delete_family_list_item(current_setting('tests.deleted_item')::uuid,1);
select set_config('tests.shared_list',public.create_family_list('34000000-1000-4000-8000-000000000001','Family list',null,'family',array[]::uuid[])::text,true);
select set_config('tests.shared_item',public.add_family_list_item(current_setting('tests.shared_list')::uuid,'Family item',1,null)::text,true);
select is((select count(*) from public.audit_logs),0::bigint,'member actor still has no audit grants in habits or lists');
reset role;
select set_config('request.jwt.claims','{"sub":"34000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.habit')::uuid),0::bigint,'admin cannot infer private habit existence or completion dates');
select is((select count(*) from public.audit_logs where resource_id=current_setting('tests.shared_habit')::uuid),1::bigint,'selected admin can read shared habit audit');
select is((select count(*) from public.audit_logs where resource_id in (current_setting('tests.list')::uuid,current_setting('tests.item')::uuid,current_setting('tests.deleted_item')::uuid)),0::bigint,'admin cannot infer private list UUIDs, items or deleted titles');
select is((select count(*) from public.audit_logs where resource_id in (current_setting('tests.shared_list')::uuid,current_setting('tests.shared_item')::uuid)),2::bigint,'family list and live item audit remain visible');
reset role;
select set_config('request.jwt.claims','{"sub":"34000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*) from public.audit_logs where resource_id in (current_setting('tests.habit')::uuid,current_setting('tests.shared_habit')::uuid,current_setting('tests.list')::uuid,current_setting('tests.item')::uuid,current_setting('tests.deleted_item')::uuid)),0::bigint,'owner outside all private audiences sees no private habit or list audit');
reset role;
select set_config('request.jwt.claims','{"sub":"34000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
delete from public.family_members where user_id='34000000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*) from public.audit_logs),0::bigint,'removed admin loses all family audit access including own records');
reset role;
select * from finish();
rollback;
