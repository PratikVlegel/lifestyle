-- Communityprofielen, gedeelde trainingsschema's en openbare beoordelingen.
-- Alleen leden kunnen communitygegevens lezen; auteurs kunnen alleen hun eigen records wijzigen.

create table if not exists public.community_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  updated_at timestamptz not null default now()
);
alter table public.community_profiles enable row level security;
drop policy if exists "communityprofielen voor leden" on public.community_profiles;
create policy "communityprofielen voor leden" on public.community_profiles for select to authenticated using (public.is_member());
drop policy if exists "eigen communityprofiel toevoegen" on public.community_profiles;
create policy "eigen communityprofiel toevoegen" on public.community_profiles for insert to authenticated with check (user_id = auth.uid() and public.is_member());
drop policy if exists "eigen communityprofiel aanpassen" on public.community_profiles;
create policy "eigen communityprofiel aanpassen" on public.community_profiles for update to authenticated using (user_id = auth.uid() and public.is_member()) with check (user_id = auth.uid() and public.is_member());

alter table public.prep_reviews add column if not exists rating smallint;
alter table public.prep_reviews add column if not exists community_comment text;
alter table public.prep_reviews add column if not exists updated_at timestamptz not null default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'prep_reviews_rating_range') then
    alter table public.prep_reviews add constraint prep_reviews_rating_range check (rating is null or rating between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'prep_reviews_community_comment_length') then
    alter table public.prep_reviews add constraint prep_reviews_community_comment_length check (community_comment is null or char_length(community_comment) <= 600);
  end if;
end $$;

-- Een openbare communitybeoordeling mag alleen bij andermans gedeelde recept.
-- De bestaande gebruiksenquête blijft ook voor een eigen recept mogelijk zolang
-- er geen openbare rating of communityreactie wordt meegestuurd.
drop policy if exists "review toevoegen" on public.prep_reviews;
create policy "review toevoegen" on public.prep_reviews for insert to authenticated
  with check (
    created_by = auth.uid() and public.is_member() and
    ((rating is null and community_comment is null) or exists (
      select 1 from public.shared_preps sp
      where sp.id = shared_id and sp.created_by is distinct from auth.uid()
    ))
  );
drop policy if exists "eigen review aanpassen" on public.prep_reviews;
create policy "eigen review aanpassen" on public.prep_reviews for update to authenticated
  using (created_by = auth.uid() and public.is_member())
  with check (
    created_by = auth.uid() and public.is_member() and
    ((rating is null and community_comment is null) or exists (
      select 1 from public.shared_preps sp
      where sp.id = shared_id and sp.created_by is distinct from auth.uid()
    ))
  );

create table if not exists public.shared_training_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  goal text not null check (char_length(goal) between 1 and 40),
  level text not null check (level in ('beginner','intermediate','advanced','competitive')),
  weeks jsonb not null check (jsonb_typeof(weeks) = 'array' and jsonb_array_length(weeks) between 1 and 24 and octet_length(weeks::text) <= 4194304),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shared_training_plans_created_idx on public.shared_training_plans (created_at desc);
alter table public.shared_training_plans enable row level security;
drop policy if exists "schema's lezen" on public.shared_training_plans;
create policy "schema's lezen" on public.shared_training_plans for select to authenticated using (public.is_member());
drop policy if exists "eigen schema toevoegen" on public.shared_training_plans;
create policy "eigen schema toevoegen" on public.shared_training_plans for insert to authenticated with check (created_by = auth.uid() and public.is_member());
drop policy if exists "eigen schema aanpassen" on public.shared_training_plans;
create policy "eigen schema aanpassen" on public.shared_training_plans for update to authenticated using (created_by = auth.uid() and public.is_member()) with check (created_by = auth.uid() and public.is_member());
drop policy if exists "eigen schema verwijderen" on public.shared_training_plans;
create policy "eigen schema verwijderen" on public.shared_training_plans for delete to authenticated using (created_by = auth.uid() and public.is_member());

create table if not exists public.shared_training_plan_reviews (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.shared_training_plans(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 600),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, created_by)
);
alter table public.shared_training_plan_reviews enable row level security;
drop policy if exists "schema-beoordelingen lezen" on public.shared_training_plan_reviews;
create policy "schema-beoordelingen lezen" on public.shared_training_plan_reviews for select to authenticated using (public.is_member());
drop policy if exists "eigen schema-beoordeling toevoegen" on public.shared_training_plan_reviews;
create policy "eigen schema-beoordeling toevoegen" on public.shared_training_plan_reviews for insert to authenticated
  with check (
    created_by = auth.uid() and public.is_member() and exists (
      select 1 from public.shared_training_plans p
      where p.id = shared_training_plan_reviews.plan_id and p.created_by is distinct from auth.uid()
    )
  );
drop policy if exists "eigen schema-beoordeling aanpassen" on public.shared_training_plan_reviews;
create policy "eigen schema-beoordeling aanpassen" on public.shared_training_plan_reviews for update to authenticated
  using (created_by = auth.uid() and public.is_member())
  with check (
    created_by = auth.uid() and public.is_member() and exists (
      select 1 from public.shared_training_plans p
      where p.id = shared_training_plan_reviews.plan_id and p.created_by is distinct from auth.uid()
    )
  );
drop policy if exists "eigen schema-beoordeling verwijderen" on public.shared_training_plan_reviews;
create policy "eigen schema-beoordeling verwijderen" on public.shared_training_plan_reviews for delete to authenticated using (created_by = auth.uid() and public.is_member());
