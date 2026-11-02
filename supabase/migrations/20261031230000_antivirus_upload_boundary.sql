begin;

create policy scanned_uploads_require_server_insert
  on storage.objects as restrictive for insert to authenticated
  with check (bucket_id not in ('gift-images', 'expense-receipts', 'family-documents'));

create policy scanned_uploads_require_server_update
  on storage.objects as restrictive for update to authenticated
  using (bucket_id not in ('gift-images', 'expense-receipts', 'family-documents'))
  with check (bucket_id not in ('gift-images', 'expense-receipts', 'family-documents'));

commit;
