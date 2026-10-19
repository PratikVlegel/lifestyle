-- Keep shared product unit data bounded. The app's backup validator already
-- accepts at most 100 units and labels of at most 100 characters.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.foods'::regclass
      and conname = 'foods_units_size_check'
  ) then
    alter table public.foods
      add constraint foods_units_size_check
      check (
        jsonb_typeof(units) = 'array'
        and jsonb_array_length(units) <= 100
        and octet_length(units::text) <= 32768
      ) not valid;
  end if;
end $$;

alter table public.foods
  validate constraint foods_units_size_check;
