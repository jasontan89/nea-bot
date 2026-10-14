-- Migration to configure pg_cron schedule for nea-cron
-- Runs hourly at 3 minutes past the hour (:03) to ensure NEA's hourly API update is published and available.

DO $$
BEGIN
  -- If the job already exists, alter its schedule to 3 * * * *
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invoke-nea-cron') THEN
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'invoke-nea-cron'),
      schedule := '3 * * * *'
    );
  ELSE
    -- Otherwise create the cron schedule
    PERFORM cron.schedule(
      'invoke-nea-cron',
      '3 * * * *',
      $cron$
        SELECT net.http_post(
          url:='https://blcsjvifiytbznwesmyx.supabase.co/functions/v1/nea-cron',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsY3NqdmlmaXl0Ynpud2VzbXl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTkzNDcsImV4cCI6MjA5ODM5NTM0N30.PhO08MviDmKyRn941IngM9-WaG_j7lwiCL5IqzG5qt0"}'::jsonb
        ) as request_id;
      $cron$
    );
  END IF;
END $$;
