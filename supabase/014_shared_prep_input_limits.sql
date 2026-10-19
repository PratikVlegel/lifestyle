-- Bound shared recipe payloads so a malformed client cannot upload an
-- unbounded ingredient list or an oversized JSON document.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shared_preps'::regclass
      and conname = 'shared_preps_ingredients_size_check'
  ) then
    alter table public.shared_preps
      add constraint shared_preps_ingredients_size_check
      check (
        jsonb_typeof(ingredients) = 'array'
        and jsonb_array_length(ingredients) <= 50
        and octet_length(ingredients::text) <= 131072
      ) not valid;
  end if;
end $$;

alter table public.shared_preps
  validate constraint shared_preps_ingredients_size_check;
