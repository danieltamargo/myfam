begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('50000000-0000-4000-8000-000000000001', 'authenticated', 'notes-owner@example.test', '{"name":"Owner"}', now(), now()),
  ('50000000-0000-4000-8000-000000000002', 'authenticated', 'notes-admin@example.test', '{"name":"Admin"}', now(), now()),
  ('50000000-0000-4000-8000-000000000003', 'authenticated', 'notes-member@example.test', '{"name":"Member"}', now(), now()),
  ('50000000-0000-4000-8000-000000000004', 'authenticated', 'notes-selected@example.test', '{"name":"Selected"}', now(), now()),
  ('50000000-0000-4000-8000-000000000005', 'authenticated', 'notes-outsider@example.test', '{"name":"Outsider"}', now(), now());

insert into public.families (id, name, created_by)
values
  ('50000000-1000-4000-8000-000000000001', 'Notes family', '50000000-0000-4000-8000-000000000001'),
  ('50000000-1000-4000-8000-000000000002', 'Other family', '50000000-0000-4000-8000-000000000005');

insert into public.family_members (family_id, user_id, role)
values
  ('50000000-1000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'owner'),
  ('50000000-1000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'admin'),
  ('50000000-1000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'member'),
  ('50000000-1000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004', 'member'),
  ('50000000-1000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000005', 'owner');

insert into public.notes (
  id, family_id, created_by, notable_type, notable_id, content, metadata
)
values (
  '50000000-2000-4000-8000-000000000001',
  '50000000-1000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  'legacy_record',
  '50000000-9000-4000-8000-000000000001',
  'Contenido legado que no debe migrarse ni borrarse',
  '{"legacy":true}'
);

insert into public.family_notes (
  id, family_id, created_by, title, content, visibility
)
values
  (
    '50000000-3000-4000-8000-000000000001',
    '50000000-1000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'Planificación de vacaciones',
    E'Billetes y alojamiento\n<script>alert("xss")</script>',
    'family'
  ),
  (
    '50000000-3000-4000-8000-000000000002',
    '50000000-1000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'Sorpresa seleccionada',
    'Solo una persona debe leerla',
    'selected_members'
  ),
  (
    '50000000-3000-4000-8000-000000000003',
    '50000000-1000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'Borrador privado',
    'Contenido personal',
    'private'
  ),
  (
    '50000000-3000-4000-8000-000000000004',
    '50000000-1000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000005',
    'Vacaciones de otra familia',
    'Nunca debe cruzar la frontera',
    'family'
  );

insert into public.family_note_members (note_id, family_id, user_id, added_by)
values (
  '50000000-3000-4000-8000-000000000002',
  '50000000-1000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000004',
  '50000000-0000-4000-8000-000000000001'
);

select has_table('public', 'family_notes', 'dedicated family notes table exists');
select has_table('public', 'family_note_members', 'explicit note readership table exists');
select has_table('public', 'notes', 'legacy polymorphic notes table remains available');
select has_column('public', 'family_notes', 'search_vector', 'generated search vector exists');
select has_index('public', 'family_notes', 'family_notes_search_idx', 'notes search uses a GIN index');
select has_function('public', 'create_family_note', 'note creation RPC exists');
select has_function('public', 'update_family_note', 'note update RPC exists');
select has_function('public', 'set_family_note_archived', array['uuid', 'bigint', 'boolean'], 'note archive RPC exists');
select ok(not has_table_privilege('authenticated', 'public.family_notes', 'insert'), 'notes cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.family_notes', 'update'), 'notes cannot be updated directly');
select is(
  (select count(*)::integer from public.notes where id = '50000000-2000-4000-8000-000000000001'),
  1,
  'legacy note data remains untouched'
);
select is(
  (
    select content from public.family_notes
    where id = '50000000-3000-4000-8000-000000000001'
  ),
  E'Billetes y alojamiento\n<script>alert("xss")</script>',
  'potential HTML is stored as inert text without transformation'
);
select ok(
  (
    select search_vector @@ websearch_to_tsquery('spanish', 'vacaciones')
    from public.family_notes
    where id = '50000000-3000-4000-8000-000000000001'
  ),
  'generated Spanish search vector indexes title and content'
);

select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_notes), 1, 'unselected member sees only family-visible notes');
select is((select count(*)::integer from public.family_note_members), 0, 'hidden note membership never leaks');
select is(
  (
    select count(*)::integer
    from public.family_notes
    where search_vector @@ websearch_to_tsquery('spanish', 'vacaciones')
  ),
  1,
  'full-text search preserves RLS while returning a family result'
);
select throws_ok(
  $$insert into public.family_notes (family_id, created_by, title) values ('50000000-1000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'Directa')$$,
  '42501',
  'permission denied for table family_notes',
  'direct note insertion is blocked'
);
select throws_ok(
  $$select public.update_family_note(
    '50000000-3000-4000-8000-000000000001',
    1,
    'Cambio ajeno',
    'Sin permiso',
    'family',
    array[]::uuid[]
  )$$,
  '42501',
  'Family note permission denied',
  'family visibility grants reading but never editing'
);
select lives_ok(
  $$select public.create_family_note(
    '50000000-1000-4000-8000-000000000001',
    'Nota del miembro',
    'Texto privado por defecto',
    'private',
    array[]::uuid[]
  )$$,
  'family member can create a private note through the RPC'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_notes), 2, 'selected reader sees family and explicitly shared notes');
select is(
  (select count(*)::integer from public.family_notes where visibility = 'private'),
  0,
  'selected readership does not expose private notes'
);
select throws_ok(
  $$select public.set_family_note_archived('50000000-3000-4000-8000-000000000002', 1, true)$$,
  '42501',
  'Family note permission denied',
  'selected reader cannot archive the author note'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_notes), 1, 'family admin gets no implicit access to private or selected notes');

reset role;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is((select count(*)::integer from public.family_notes), 3, 'author sees all their visible family notes');
select is(
  public.update_family_note(
    '50000000-3000-4000-8000-000000000003',
    1,
    'Borrador privado actualizado',
    E'Línea uno\n<strong>texto literal</strong>',
    'private',
    array[]::uuid[]
  )::integer,
  2,
  'author updates a note with optimistic versioning'
);
select throws_ok(
  $$select public.update_family_note(
    '50000000-3000-4000-8000-000000000003',
    1,
    'Versión obsoleta',
    'No debe guardarse',
    'private',
    array[]::uuid[]
  )$$,
  '40001',
  'Family note changed concurrently',
  'stale note update is rejected'
);
select is(
  public.set_family_note_archived(
    '50000000-3000-4000-8000-000000000003',
    2,
    true
  )::integer,
  3,
  'author archives a note with optimistic versioning'
);
select ok(
  (select archived_at is not null from public.family_notes where id = '50000000-3000-4000-8000-000000000003'),
  'archived note keeps an explicit timestamp'
);
select throws_ok(
  $$select public.set_family_note_archived('50000000-3000-4000-8000-000000000003', 2, false)$$,
  '40001',
  'Family note changed concurrently',
  'stale archive mutation is rejected'
);
select lives_ok(
  $$select public.update_family_note(
    '50000000-3000-4000-8000-000000000002',
    1,
    'Ahora privada',
    'Ya no se comparte',
    'private',
    array[]::uuid[]
  )$$,
  'author can make a selected note private atomically'
);
select is(
  (select count(*)::integer from public.family_note_members where note_id = '50000000-3000-4000-8000-000000000002'),
  0,
  'changing visibility removes obsolete explicit readers'
);
select throws_ok(
  $$select public.create_family_note(
    '50000000-1000-4000-8000-000000000001',
    'Lector externo',
    'No válida',
    'selected_members',
    array['50000000-0000-4000-8000-000000000005']::uuid[]
  )$$,
  '23503',
  'Every selected note reader must belong to the family',
  'selected note rejects readers from another family'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is(
  (select count(*)::integer from public.family_notes where family_id = '50000000-1000-4000-8000-000000000001'),
  0,
  'notes never cross family boundaries'
);
select throws_ok(
  $$select public.create_family_note(
    '50000000-1000-4000-8000-000000000001',
    'Cruce indebido',
    'No válida',
    'private',
    array[]::uuid[]
  )$$,
  '42501',
  'Family membership required',
  'outsider cannot create a note in another family'
);

reset role;
select is(
  (select count(*)::integer from public.notes where id = '50000000-2000-4000-8000-000000000001'),
  1,
  'legacy note remains after all family note operations'
);

select * from finish();
rollback;
