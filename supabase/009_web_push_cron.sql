-- Schedule generic Web Push reminders once the Vault value exists:
--   webpush_cron_secret = the same random value as PUSH_CRON_SECRET in Edge Function Secrets
-- The public publishable key identifies this project; the function verifies the
-- dedicated secret header itself. Never put a service-role or secret API key here.
begin;

do $$
declare
  cron_secret text;
begin
  select decrypted_secret into cron_secret
    from vault.decrypted_secrets where name = 'webpush_cron_secret' limit 1;

  if coalesce(cron_secret, '') = '' then
    raise exception 'Create the webpush_cron_secret Vault secret before applying this migration';
  end if;

  perform cron.unschedule(jobid)
    from cron.job where jobname = 'lifestyle-webpush-reminders';

  perform cron.schedule(
    'lifestyle-webpush-reminders',
    '* * * * *',
    $job$
      select net.http_post(
        url := 'https://gbyausuldubxktdrwfux.supabase.co/functions/v1/send-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', 'sb_publishable_K4Qmnt9Gqp0A8b7VmAe4Pg_3dwGe2zw',
          'x-push-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'webpush_cron_secret' limit 1)
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$$;

commit;
