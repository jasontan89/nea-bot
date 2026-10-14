-- Migration to configure pg_cron schedule for nea-cron
-- Runs hourly at 3 minutes past the hour (:03) to ensure NEA's hourly API update is published and available.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoke-nea-cron') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'invoke-nea-cron'),
      schedule := '3 * * * *',
      command := 'SELECT net.http_post(url := ''https://blcsjvifiytbznwesmyx.supabase.co/functions/v1/nea-cron'', headers := ''{"Content-Type": "application/json", "Authorization": "Bearer <YOUR_NEA_CRON_SECRET>"}''::jsonb) as request_id;'
    );
  ELSE
    PERFORM cron.schedule(
      'invoke-nea-cron',
      '3 * * * *',
      $cron$
        SELECT net.http_post(
          url:='https://blcsjvifiytbznwesmyx.supabase.co/functions/v1/nea-cron',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer <YOUR_NEA_CRON_SECRET>"}'::jsonb
        ) as request_id;
      $cron$
    );
  END IF;
END $$;
