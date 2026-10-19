-- Also require current membership for updates and deletes.
-- 004 gated reads/inserts, but the older owner-only write policies remained active.
begin;

drop policy if exists "eigen producten aanpassen" on public.foods;
create policy "eigen producten aanpassen" on public.foods
  for update to authenticated
  using (created_by = auth.uid() and public.is_member())
  with check (created_by = auth.uid() and public.is_member());

drop policy if exists "eigen producten verwijderen" on public.foods;
create policy "eigen producten verwijderen" on public.foods
  for delete to authenticated
  using (created_by = auth.uid() and public.is_member());

drop policy if exists "eigen recepten aanpassen" on public.shared_preps;
create policy "eigen recepten aanpassen" on public.shared_preps
  for update to authenticated
  using (created_by = auth.uid() and public.is_member())
  with check (created_by = auth.uid() and public.is_member());

drop policy if exists "eigen recepten verwijderen" on public.shared_preps;
create policy "eigen recepten verwijderen" on public.shared_preps
  for delete to authenticated
  using (created_by = auth.uid() and public.is_member());

drop policy if exists "eigen review aanpassen" on public.prep_reviews;
create policy "eigen review aanpassen" on public.prep_reviews
  for update to authenticated
  using (created_by = auth.uid() and public.is_member())
  with check (created_by = auth.uid() and public.is_member());

drop policy if exists "eigen review verwijderen" on public.prep_reviews;
create policy "eigen review verwijderen" on public.prep_reviews
  for delete to authenticated
  using (created_by = auth.uid() and public.is_member());

drop policy if exists "eigen foto vervangen" on storage.objects;
create policy "eigen foto vervangen" on storage.objects
  for update to authenticated
  using (bucket_id = 'prep-photos' and owner = auth.uid() and public.is_member())
  with check (bucket_id = 'prep-photos' and owner = auth.uid() and public.is_member());

drop policy if exists "eigen foto verwijderen" on storage.objects;
create policy "eigen foto verwijderen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'prep-photos' and owner = auth.uid() and public.is_member());

commit;
