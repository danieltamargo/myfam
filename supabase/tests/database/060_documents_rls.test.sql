begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('60000000-0000-4000-8000-000000000001', 'authenticated', 'documents-owner@example.test', '{"name":"Owner"}', now(), now()),
  ('60000000-0000-4000-8000-000000000002', 'authenticated', 'documents-admin@example.test', '{"name":"Admin"}', now(), now()),
  ('60000000-0000-4000-8000-000000000003', 'authenticated', 'documents-author@example.test', '{"name":"Author"}', now(), now()),
  ('60000000-0000-4000-8000-000000000004', 'authenticated', 'documents-selected@example.test', '{"name":"Selected"}', now(), now()),
  ('60000000-0000-4000-8000-000000000005', 'authenticated', 'documents-member@example.test', '{"name":"Member"}', now(), now()),
  ('60000000-0000-4000-8000-000000000006', 'authenticated', 'documents-outsider@example.test', '{"name":"Outsider"}', now(), now());

insert into public.families (id, name, created_by)
values
  ('60000000-1000-4000-8000-000000000001', 'Documents family', '60000000-0000-4000-8000-000000000001'),
  ('60000000-1000-4000-8000-000000000002', 'Other family', '60000000-0000-4000-8000-000000000006');

insert into public.family_members (family_id, user_id, role)
values
  ('60000000-1000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'owner'),
  ('60000000-1000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', 'admin'),
  ('60000000-1000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', 'member'),
  ('60000000-1000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000004', 'member'),
  ('60000000-1000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000005', 'member'),
  ('60000000-1000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000006', 'owner');

insert into public.family_documents (
  id, family_id, owner_id, display_name, original_name, mime_type, size_bytes,
  storage_path, folder_name, visibility, expires_at, status
)
values
  (
    '60000000-2000-4000-8000-000000000001',
    '60000000-1000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000003',
    'Documento privado del miembro',
    'privado.pdf',
    'application/pdf',
    2048,
    '60000000-1000-4000-8000-000000000001/60000000-0000-4000-8000-000000000003/60000000-2000-4000-8000-000000000001',
    'Legal',
    'private',
    null,
    'active'
  ),
  (
    '60000000-2000-4000-8000-000000000002',
    '60000000-1000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000003',
    'Documento compartido',
    'compartido.pdf',
    'application/pdf',
    4096,
    '60000000-1000-4000-8000-000000000001/60000000-0000-4000-8000-000000000003/60000000-2000-4000-8000-000000000002',
    'Salud',
    'selected_members',
    now() + interval '7 days',
    'active'
  ),
  (
    '60000000-2000-4000-8000-000000000003',
    '60000000-1000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000003',
    'Documento caducado',
    'caducado.pdf',
    'application/pdf',
    1024,
    '60000000-1000-4000-8000-000000000001/60000000-0000-4000-8000-000000000003/60000000-2000-4000-8000-000000000003',
    null,
    'selected_members',
    now() - interval '1 day',
    'active'
  ),
  (
    '60000000-2000-4000-8000-000000000004',
    '60000000-1000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000006',
    'Documento de otra familia',
    'otro.pdf',
    'application/pdf',
    512,
    '60000000-1000-4000-8000-000000000002/60000000-0000-4000-8000-000000000006/60000000-2000-4000-8000-000000000004',
    null,
    'private',
    null,
    'active'
  );

insert into public.family_document_members (document_id, family_id, user_id, added_by)
values
  (
    '60000000-2000-4000-8000-000000000002',
    '60000000-1000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000004',
    '60000000-0000-4000-8000-000000000003'
  ),
  (
    '60000000-2000-4000-8000-000000000003',
    '60000000-1000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000004',
    '60000000-0000-4000-8000-000000000003'
  );

insert into storage.objects (bucket_id, name, owner_id)
select 'family-documents', storage_path, owner_id
from public.family_documents;

select has_table('public', 'family_documents', 'private document metadata table exists');
select has_table('public', 'family_document_members', 'explicit document readers table exists');
select has_index('public', 'family_documents', 'family_documents_family_status_updated_idx', 'document pagination index exists');
select has_index('public', 'family_document_members', 'family_document_members_user_idx', 'reader RLS join is indexed');
select has_function('public', 'begin_family_document_upload', 'upload reservation RPC exists');
select has_function('public', 'complete_family_document_upload', array['uuid'], 'upload completion RPC exists');
select has_function('public', 'prepare_family_document_download', array['uuid'], 'sensitive download RPC exists');
select has_function('public', 'update_family_document_access', 'document access RPC exists');
select has_function('public', 'prepare_family_document_delete', array['uuid', 'bigint'], 'document deletion reservation exists');
select is((select public from storage.buckets where id = 'family-documents'), false, 'document bucket is private');
select is((select file_size_limit from storage.buckets where id = 'family-documents'), 15728640::bigint, 'bucket enforces the 15 MB limit');
select ok(
  exists (
    select 1
    from storage.buckets as bucket,
      unnest(bucket.allowed_mime_types) as mime_type
    where bucket.id = 'family-documents' and mime_type = 'application/pdf'
  ),
  'bucket has an explicit MIME allowlist'
);
select ok(not has_table_privilege('authenticated', 'public.family_documents', 'insert'), 'metadata cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.family_documents', 'update'), 'metadata cannot be updated directly');
select ok(not has_table_privilege('authenticated', 'public.family_documents', 'delete'), 'metadata cannot be deleted directly');
select ok(not has_table_privilege('authenticated', 'public.family_document_members', 'insert'), 'readers cannot be inserted directly');
select ok(has_table_privilege('service_role', 'public.family_documents', 'select'), 'service role can verify and back up document metadata');
select ok(has_table_privilege('service_role', 'public.family_documents', 'delete'), 'service role can perform administrative cleanup');

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_documents), 0, 'family owner cannot see a private member document');
select is((select count(*)::integer from storage.objects where bucket_id = 'family-documents'), 0, 'family owner cannot open its private object');
select throws_ok(
  $$select public.prepare_family_document_download('60000000-2000-4000-8000-000000000001')$$,
  '42501',
  'Document download permission required',
  'family owner cannot request a signed download without explicit permission'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_documents), 0, 'family admin has no implicit private document access');

reset role;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_documents), 1, 'selected reader sees only the active shared document');
select is((select count(*)::integer from storage.objects where bucket_id = 'family-documents'), 1, 'selected reader can access only its shared object');
select is(
  public.prepare_family_document_download('60000000-2000-4000-8000-000000000002'),
  '60000000-1000-4000-8000-000000000001/60000000-0000-4000-8000-000000000003/60000000-2000-4000-8000-000000000002',
  'authorized download returns only the canonical object path'
);
select throws_ok(
  $$select public.update_family_document_access(
    '60000000-2000-4000-8000-000000000002',
    1,
    'Salud',
    'private',
    array[]::uuid[],
    null
  )$$,
  '42501',
  'Document owner permission required',
  'selected reader cannot change document permissions'
);
select throws_ok(
  $$select public.prepare_family_document_delete('60000000-2000-4000-8000-000000000002', 1)$$,
  '42501',
  'Document owner permission required',
  'selected reader cannot delete the document'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_documents), 3, 'author sees active and expired metadata they own');
select is((select count(*)::integer from storage.objects where bucket_id = 'family-documents'), 2, 'author cannot download an expired object');
select throws_ok(
  $$select public.prepare_family_document_download('60000000-2000-4000-8000-000000000003')$$,
  '42501',
  'Document download permission required',
  'expiry blocks even the owner from downloading the object'
);
select is(
  public.update_family_document_access(
    '60000000-2000-4000-8000-000000000002',
    1,
    'Seguros',
    'selected_members',
    array['60000000-0000-4000-8000-000000000005']::uuid[],
    now() + interval '14 days'
  )::integer,
  2,
  'author updates logical folder, expiry and readers atomically'
);
select is(
  (select count(*)::integer from public.family_document_members where document_id = '60000000-2000-4000-8000-000000000002' and user_id = '60000000-0000-4000-8000-000000000005'),
  1,
  'access update replaces the explicit reader set'
);
select is(
  (select folder_name from public.family_documents where id = '60000000-2000-4000-8000-000000000002'),
  'Seguros',
  'folder remains logical metadata instead of changing the object path'
);
select ok(
  (
    select storage_path like '60000000-1000-4000-8000-000000000001/60000000-0000-4000-8000-000000000003/%'
    from public.family_documents
    where id = '60000000-2000-4000-8000-000000000002'
  ),
  'object path contains only trusted family, owner and document UUIDs'
);
select throws_ok(
  $$select public.update_family_document_access(
    '60000000-2000-4000-8000-000000000002',
    2,
    '../ruta',
    'private',
    array[]::uuid[],
    null
  )$$,
  '23514',
  null,
  'database rejects a logical folder that contains a path'
);
select throws_ok(
  $$select public.update_family_document_access(
    '60000000-2000-4000-8000-000000000002',
    2,
    'Seguros',
    'selected_members',
    array['60000000-0000-4000-8000-000000000006']::uuid[],
    null
  )$$,
  '23503',
  'Every selected user must belong to the family',
  'document sharing rejects a reader from another family'
);
select lives_ok(
  $$select public.begin_family_document_upload(
    '60000000-1000-4000-8000-000000000001',
    'Póliza nueva',
    'poliza.pdf',
    'application/pdf',
    8192,
    'Legal',
    'private',
    array[]::uuid[],
    null
  )$$,
  'family member can reserve a private upload'
);
select ok(
  (
    select storage_path = format('%s/%s/%s', family_id, owner_id, id)
    from public.family_documents
    where display_name = 'Póliza nueva'
  ),
  'upload RPC generates the canonical path without user path input'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    values (
      'family-documents',
      '60000000-1000-4000-8000-000000000001/60000000-0000-4000-8000-000000000003/ruta-forjada',
      '60000000-0000-4000-8000-000000000003'
    )$$,
  '42501',
  null,
  'storage rejects any forged or user-selected object path'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id)
    select 'family-documents', storage_path, owner_id
    from public.family_documents
    where display_name = 'Póliza nueva'$$,
  'pending owner can upload only to the reserved object path'
);
select is(
  public.complete_family_document_upload(
    (select id from public.family_documents where display_name = 'Póliza nueva')
  )::integer,
  2,
  'upload completion activates metadata after the object exists'
);
select is(
  public.complete_family_document_upload(
    (select id from public.family_documents where display_name = 'Póliza nueva')
  )::integer,
  2,
  'upload completion can be retried without duplicating state'
);

reset role;
select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'documents.uploaded'
      and resource_id = (select id from public.family_documents where display_name = 'Póliza nueva')
  ),
  'successful upload is audited without a public URL'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'documents.access_changed'
      and resource_id = '60000000-2000-4000-8000-000000000002'
  ),
  'permission changes are audited'
);
select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'documents.downloaded'
      and resource_id = '60000000-2000-4000-8000-000000000002'
  ),
  'sensitive downloads are audited'
);

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select lives_ok(
  $$select public.prepare_family_document_delete('60000000-2000-4000-8000-000000000002', 2)$$,
  'author reserves document deletion with optimistic versioning'
);
select lives_ok(
  $$select set_config('storage.allow_delete_query', 'true', true);
    delete from storage.objects
    where bucket_id = 'family-documents'
      and name = '60000000-1000-4000-8000-000000000001/60000000-0000-4000-8000-000000000003/60000000-2000-4000-8000-000000000002';
    select set_config('storage.allow_delete_query', 'false', true)$$,
  'Storage API-authorized path lets the author delete the private object after reserving metadata'
);
select lives_ok(
  $$select public.complete_family_document_delete('60000000-2000-4000-8000-000000000002')$$,
  'author completes metadata deletion'
);
select lives_ok(
  $$select public.complete_family_document_delete('60000000-2000-4000-8000-000000000002')$$,
  'document deletion completion is idempotent'
);

reset role;
select ok(
  exists (
    select 1 from public.audit_logs
    where action = 'documents.deleted'
      and resource_id = '60000000-2000-4000-8000-000000000002'
  ),
  'completed document deletion is audited'
);

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_documents where family_id = '60000000-1000-4000-8000-000000000001'), 0, 'documents never cross family boundaries');
select throws_ok(
  $$select public.begin_family_document_upload(
    '60000000-1000-4000-8000-000000000001',
    'Cruce indebido',
    'cruce.pdf',
    'application/pdf',
    100,
    null,
    'private',
    array[]::uuid[],
    null
  )$$,
  '42501',
  'Family membership required',
  'outsider cannot reserve an upload in another family'
);

reset role;
select * from finish();
rollback;
