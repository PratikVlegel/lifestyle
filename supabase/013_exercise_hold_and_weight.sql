-- Extra prescription fields for holds and external load; existing shared rows stay valid.
begin;
alter table public.shared_exercises add column if not exists hold_seconds smallint;
alter table public.shared_exercises add column if not exists weight_kg numeric(6,2);
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.shared_exercises'::regclass and conname = 'shared_exercises_hold_seconds_check') then
    alter table public.shared_exercises add constraint shared_exercises_hold_seconds_check check (hold_seconds is null or hold_seconds between 0 and 60);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.shared_exercises'::regclass and conname = 'shared_exercises_weight_kg_check') then
    alter table public.shared_exercises add constraint shared_exercises_weight_kg_check check (weight_kg is null or weight_kg between 0 and 500);
  end if;
end $$;
commit;
