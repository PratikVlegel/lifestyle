-- Gedeelde oefeningen met zoekfilters, auteursrechten en ledenbeoordelingen.
begin;

create table if not exists public.shared_exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  focus text not null default '' check (char_length(focus) <= 160),
  description text not null default '' check (char_length(description) <= 1200),
  movement_type text not null check (movement_type in ('strength','cardio','mobility','core')),
  target_area text not null check (target_area in ('full_body','legs','glutes','chest','back','shoulders','arms','core','cardio')),
  equipment text not null check (equipment in ('none','dumbbell','barbell','band','machine','kettlebell','other')),
  level text not null check (level in ('beginner','intermediate','advanced')),
  sets smallint not null default 3 check (sets between 1 and 10),
  target text not null check (char_length(target) between 1 and 16),
  rest_seconds smallint not null default 90 check (rest_seconds between 0 and 600),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shared_exercises_created_idx on public.shared_exercises (created_at desc);
create index if not exists shared_exercises_filters_idx on public.shared_exercises (movement_type, target_area, equipment, level);
alter table public.shared_exercises enable row level security;
drop policy if exists "community-oefeningen lezen" on public.shared_exercises;
create policy "community-oefeningen lezen" on public.shared_exercises for select to authenticated using (public.is_member());
drop policy if exists "eigen community-oefening toevoegen" on public.shared_exercises;
create policy "eigen community-oefening toevoegen" on public.shared_exercises for insert to authenticated with check (created_by = auth.uid() and public.is_member());
drop policy if exists "eigen community-oefening aanpassen" on public.shared_exercises;
create policy "eigen community-oefening aanpassen" on public.shared_exercises for update to authenticated using (created_by = auth.uid() and public.is_member()) with check (created_by = auth.uid() and public.is_member());
drop policy if exists "eigen community-oefening verwijderen" on public.shared_exercises;
create policy "eigen community-oefening verwijderen" on public.shared_exercises for delete to authenticated using (created_by = auth.uid() and public.is_member());
grant select, insert, update, delete on public.shared_exercises to authenticated;

create table if not exists public.shared_exercise_reviews (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.shared_exercises(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 600),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exercise_id, created_by)
);
create index if not exists shared_exercise_reviews_exercise_idx on public.shared_exercise_reviews (exercise_id, created_at desc);
alter table public.shared_exercise_reviews enable row level security;
drop policy if exists "community-oefeningsreviews lezen" on public.shared_exercise_reviews;
create policy "community-oefeningsreviews lezen" on public.shared_exercise_reviews for select to authenticated using (public.is_member());
drop policy if exists "eigen community-oefeningsreview toevoegen" on public.shared_exercise_reviews;
create policy "eigen community-oefeningsreview toevoegen" on public.shared_exercise_reviews for insert to authenticated
  with check (
    created_by = auth.uid() and public.is_member() and exists (
      select 1 from public.shared_exercises e
      where e.id = shared_exercise_reviews.exercise_id and e.created_by is distinct from auth.uid()
    )
  );
drop policy if exists "eigen community-oefeningsreview aanpassen" on public.shared_exercise_reviews;
create policy "eigen community-oefeningsreview aanpassen" on public.shared_exercise_reviews
  for update to authenticated using (created_by = auth.uid() and public.is_member())
  with check (
    created_by = auth.uid() and public.is_member() and exists (
      select 1 from public.shared_exercises e
      where e.id = shared_exercise_reviews.exercise_id and e.created_by is distinct from auth.uid()
    )
  );
drop policy if exists "eigen community-oefeningsreview verwijderen" on public.shared_exercise_reviews;
create policy "eigen community-oefeningsreview verwijderen" on public.shared_exercise_reviews for delete to authenticated using (created_by = auth.uid() and public.is_member());
grant select, insert, update, delete on public.shared_exercise_reviews to authenticated;

create or replace function public.search_shared_exercises(
  p_query text default null,
  p_movement_type text default null,
  p_target_area text default null,
  p_equipment text default null,
  p_level text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.shared_exercises
language sql
stable
set search_path = public
as $$
  select e.*
  from public.shared_exercises e
  left join public.community_profiles cp on cp.user_id = e.created_by
  where public.is_member()
    and (nullif(trim(p_movement_type), '') is null or e.movement_type = p_movement_type)
    and (nullif(trim(p_target_area), '') is null or e.target_area = p_target_area)
    and (nullif(trim(p_equipment), '') is null or e.equipment = p_equipment)
    and (nullif(trim(p_level), '') is null or e.level = p_level)
    and (nullif(trim(p_query), '') is null or
      e.name ilike '%' || trim(p_query) || '%' or
      e.focus ilike '%' || trim(p_query) || '%' or
      e.description ilike '%' || trim(p_query) || '%' or
      coalesce(cp.display_name, '') ilike '%' || trim(p_query) || '%')
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke all on function public.search_shared_exercises(text,text,text,text,text,integer,integer) from public, anon;
grant execute on function public.search_shared_exercises(text,text,text,text,text,integer,integer) to authenticated;

commit;
