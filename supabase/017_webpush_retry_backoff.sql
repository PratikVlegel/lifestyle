-- Retry failed Web Push deliveries with bounded exponential backoff.
-- Keep endpoint URLs out of the delivery history, including entries written by
-- older function versions which stored fetch error messages verbatim.
begin;

alter table public.webpush_deliveries
  add column if not exists next_attempt_at timestamptz not null default now();

update public.webpush_deliveries
   set last_error = 'previous_attempt_failed'
 where last_error is not null;

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

  -- A worker may have crashed during the final permitted attempt.
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
