-- Bound remaining user-controlled community payloads on the database side.
-- NOT VALID skips a potentially expensive scan of existing rows, while PostgreSQL
-- still enforces each constraint for all new and updated rows.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'shared_preps_per_object_size') then
    alter table public.shared_preps add constraint shared_preps_per_object_size
      check (jsonb_typeof(per) = 'object' and octet_length(per::text) <= 2048) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'shared_training_plans_weeks_size') then
    alter table public.shared_training_plans add constraint shared_training_plans_weeks_size
      check (jsonb_typeof(weeks) = 'array' and jsonb_array_length(weeks) between 1 and 24 and octet_length(weeks::text) <= 4194304) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'foods_source_length') then
    alter table public.foods add constraint foods_source_length
      check (source is null or char_length(source) <= 200) not valid;
  end if;
end $$;
