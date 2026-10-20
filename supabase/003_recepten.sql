-- Gedeelde mealprep-recepten, beoordelingen en foto's.

create table if not exists public.shared_preps (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 200),
  portions    numeric not null default 1 check (portions > 0 and portions <= 100),
  ingredients jsonb not null default '[]'::jsonb,
  per         jsonb not null default '{}'::jsonb check (jsonb_typeof(per) = 'object' and octet_length(per::text) <= 2048),
  note        text check (char_length(note) <= 4000),
  photo_url   text check (char_length(photo_url) <= 500),
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists shared_preps_created_idx on public.shared_preps (created_at desc);

create table if not exists public.prep_reviews (
  id          uuid primary key default gen_random_uuid(),
  shared_id   uuid not null references public.shared_preps(id) on delete cascade,
  taste       smallint check (taste between 1 and 5),
  ease        smallint check (ease between 1 and 5),
  portion     text check (portion in ('te klein','goed','te groot')),
  eat         text check (eat in ('makkelijk','ging wel','moeilijk')),
  fullness    text check (fullness in ('snel weer honger','goed verzadigd','te vol')),
  keep        text check (keep in ('ja','twijfel','nee')),
  again       text check (again in ('ja','misschien','nee')),
  note        text check (char_length(note) <= 1000),
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (shared_id, created_by)
);

-- updated_at bijhouden, maker niet laten wijzigen
create or replace function public.shared_preps_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.created_by := old.created_by;
  return new;
end $$;
drop trigger if exists shared_preps_touch on public.shared_preps;
create trigger shared_preps_touch before update on public.shared_preps
  for each row execute function public.shared_preps_touch();

alter table public.shared_preps enable row level security;
alter table public.prep_reviews enable row level security;

drop policy if exists "recepten lezen" on public.shared_preps;
create policy "recepten lezen" on public.shared_preps for select to anon, authenticated using (true);
drop policy if exists "recepten toevoegen" on public.shared_preps;
create policy "recepten toevoegen" on public.shared_preps for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "eigen recepten aanpassen" on public.shared_preps;
create policy "eigen recepten aanpassen" on public.shared_preps for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
drop policy if exists "eigen recepten verwijderen" on public.shared_preps;
create policy "eigen recepten verwijderen" on public.shared_preps for delete to authenticated using (created_by = auth.uid());

drop policy if exists "reviews lezen" on public.prep_reviews;
create policy "reviews lezen" on public.prep_reviews for select to anon, authenticated using (true);
drop policy if exists "review toevoegen" on public.prep_reviews;
create policy "review toevoegen" on public.prep_reviews for insert to authenticated with check (created_by = auth.uid());
drop policy if exists "eigen review aanpassen" on public.prep_reviews;
create policy "eigen review aanpassen" on public.prep_reviews for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
drop policy if exists "eigen review verwijderen" on public.prep_reviews;
create policy "eigen review verwijderen" on public.prep_reviews for delete to authenticated using (created_by = auth.uid());

-- Foto's van gedeelde recepten: publiek leesbaar, max 1 MB, alleen afbeeldingen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prep-photos', 'prep-photos', true, 1048576, array['image/jpeg','image/webp','image/png'])
on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg','image/webp','image/png'];

drop policy if exists "foto uploaden" on storage.objects;
create policy "foto uploaden" on storage.objects for insert to authenticated
  with check (bucket_id = 'prep-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "eigen foto vervangen" on storage.objects;
create policy "eigen foto vervangen" on storage.objects for update to authenticated
  using (bucket_id = 'prep-photos' and owner = auth.uid());
drop policy if exists "eigen foto verwijderen" on storage.objects;
create policy "eigen foto verwijderen" on storage.objects for delete to authenticated
  using (bucket_id = 'prep-photos' and owner = auth.uid());
