-- Gedeelde productenbibliotheek voor de voedingsdagboek-app.
-- Alleen productgegevens (etiketwaarden), geen persoonlijke dagboekgegevens.

create table if not exists public.foods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 200),
  brand       text check (char_length(brand) <= 120),
  barcode     text unique check (barcode ~ '^[0-9]{6,14}$'),
  kcal        numeric check (kcal >= 0 and kcal <= 1000),
  protein     numeric check (protein >= 0 and protein <= 100),
  carbs       numeric check (carbs >= 0 and carbs <= 100),
  fat         numeric check (fat >= 0 and fat <= 100),
  fiber       numeric check (fiber >= 0 and fiber <= 100),
  units       jsonb not null default '[]'::jsonb,
  source      text,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists foods_updated_at_idx on public.foods (updated_at);
create index if not exists foods_name_idx on public.foods (lower(name));

create or replace function public.foods_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.created_by := old.created_by;
  return new;
end $$;

drop trigger if exists foods_touch on public.foods;
create trigger foods_touch before update on public.foods
  for each row execute function public.foods_touch();

alter table public.foods enable row level security;

drop policy if exists "iedereen leest" on public.foods;
create policy "iedereen leest" on public.foods
  for select to anon, authenticated using (true);

drop policy if exists "ingelogd toevoegen" on public.foods;
create policy "ingelogd toevoegen" on public.foods
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "eigen producten aanpassen" on public.foods;
create policy "eigen producten aanpassen" on public.foods
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "eigen producten verwijderen" on public.foods;
create policy "eigen producten verwijderen" on public.foods
  for delete to authenticated using (created_by = auth.uid());
