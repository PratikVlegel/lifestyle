-- Bound and validate the small schedule synced for web-push reminders.
-- Reminder names and diary data remain on the user's device.
begin;

create or replace function public.webpush_reminders_valid(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  reminder jsonb;
  key_count integer;
begin
  if jsonb_typeof(value) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(value) > 20 then
    return false;
  end if;

  for reminder in select item from jsonb_array_elements(value) as entries(item) loop
    if jsonb_typeof(reminder) <> 'object'
       or not (reminder ? 'id')
       or not (reminder ? 'time')
       or jsonb_typeof(reminder -> 'id') <> 'string'
       or jsonb_typeof(reminder -> 'time') <> 'string'
       or (reminder ->> 'id') !~ '^[A-Za-z0-9_-]{1,40}$'
       or (reminder ->> 'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return false;
    end if;

    select count(*) into key_count from jsonb_object_keys(reminder);
    if key_count <> 2 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.webpush_subscriptions'::regclass
      and conname = 'webpush_reminders_valid_check'
  ) then
    alter table public.webpush_subscriptions
      add constraint webpush_reminders_valid_check
      check (public.webpush_reminders_valid(reminders)) not valid;
  end if;
end $$;

alter table public.webpush_subscriptions
  validate constraint webpush_reminders_valid_check;

commit;
