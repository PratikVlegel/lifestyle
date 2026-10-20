-- Minimal, per-device Web Push data. The diary, mood, health profile and free-text
-- reminder labels and kinds stay on the device; only the id/time is synced.
begin;

create table if not exists public.webpush_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 32 and 2048),
  p256dh text not null check (length(p256dh) between 80 and 100),
  auth_secret text not null check (length(auth_secret) between 20 and 32),
  timezone text not null check (length(timezone) between 1 and 64),
  language text not null default 'nl-BE' check (language in ('nl-BE', 'en-GB', 'fr-FR', 'de-DE')),
  reminders jsonb not null default '[]'::jsonb check (jsonb_typeof(reminders) = 'array'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists webpush_subscriptions_user_idx on public.webpush_subscriptions(user_id);
alter table public.webpush_subscriptions enable row level security;
revoke all on public.webpush_subscriptions from anon;
grant select, insert, update, delete on public.webpush_subscriptions to authenticated;
drop policy if exists "webpush owner access" on public.webpush_subscriptions;
create policy "webpush owner access" on public.webpush_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.webpush_deliveries (
  subscription_id uuid not null references public.webpush_subscriptions(id) on delete cascade,
  reminder_id text not null check (length(reminder_id) between 1 and 40),
  local_date date not null,
  state text not null default 'processing' check (state in ('processing', 'sent', 'failed')),
  attempts integer not null default 1 check (attempts between 1 and 20),
  lease_until timestamptz not null default (now() + interval '5 minutes'),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  primary key (subscription_id, reminder_id, local_date)
);

alter table public.webpush_deliveries enable row level security;
revoke all on public.webpush_deliveries from anon, authenticated;
grant all on public.webpush_deliveries to service_role;

create or replace function public.claim_webpush_delivery(
  p_subscription_id uuid,
  p_reminder_id text,
  p_local_date date
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare claimed boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update public.webpush_deliveries
     set state = 'failed', lease_until = now(), next_attempt_at = 'infinity'::timestamptz,
         last_error = coalesce(last_error, 'retry_limit_reached')
   where subscription_id = p_subscription_id and reminder_id = p_reminder_id and local_date = p_local_date
     and state = 'processing' and lease_until < now() and attempts >= 20;
  insert into public.webpush_deliveries(subscription_id, reminder_id, local_date)
  values (p_subscription_id, p_reminder_id, p_local_date)
  on conflict (subscription_id, reminder_id, local_date) do update
    set state = 'processing', attempts = webpush_deliveries.attempts + 1,
        lease_until = now() + interval '5 minutes', next_attempt_at = now(), last_error = null
    where webpush_deliveries.attempts < 20
      and ((webpush_deliveries.state = 'failed' and webpush_deliveries.next_attempt_at <= now())
       or (webpush_deliveries.state = 'processing' and webpush_deliveries.lease_until < now()))
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

create or replace function public.finish_webpush_delivery(
  p_subscription_id uuid,
  p_reminder_id text,
  p_local_date date,
  p_success boolean,
  p_error text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update public.webpush_deliveries
     set state = case when p_success then 'sent' else 'failed' end,
         sent_at = case when p_success then now() else null end,
         lease_until = now(),
         next_attempt_at = case
           when p_success then now()
           when attempts >= 20 then 'infinity'::timestamptz
           else now() + make_interval(secs => least(21600, (300 * power(2, attempts - 1))::integer))
         end,
         last_error = case
           when p_success then null
           when coalesce(p_error, '') ~* 'https?://' then 'push_error_redacted'
           else left(coalesce(p_error, 'send failed'), 300)
         end
   where subscription_id = p_subscription_id and reminder_id = p_reminder_id and local_date = p_local_date;
end;
$$;

revoke all on function public.claim_webpush_delivery(uuid, text, date) from public, anon, authenticated;
revoke all on function public.finish_webpush_delivery(uuid, text, date, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_webpush_delivery(uuid, text, date) to service_role;
grant execute on function public.finish_webpush_delivery(uuid, text, date, boolean, text) to service_role;

commit;
