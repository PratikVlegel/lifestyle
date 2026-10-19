-- Schedule generic Web Push reminders once the two Vault values exist:
--   webpush_anon_jwt      = the legacy public anon JWT (only for Edge Function JWT verification)
--   webpush_cron_secret   = the same random value as PUSH_CRON_SECRET in Edge Function Secrets
-- Never place a service-role or secret API key in pg_net request headers.
begin;

do $$
declare
  anon_jwt text;
  cron_secret text;
begin
  select decrypted_secret into anon_jwt
    from vault.decrypted_secrets where name = 'webpush_anon_jwt' limit 1;
  select decrypted_secret into cron_secret
    from vault.decrypted_secrets where name = 'webpush_cron_secret' limit 1;

  if coalesce(anon_jwt, '') = '' or coalesce(cron_secret, '') = '' then
    raise exception 'Create the webpush_anon_jwt and webpush_cron_secret Vault secrets before applying this migration';
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
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'webpush_anon_jwt' limit 1),
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'webpush_anon_jwt' limit 1),
          'x-push-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'webpush_cron_secret' limit 1)
        ),
        body := '{}'::jsonb
      );
    $job$
  );
end;
$$;

commit;
