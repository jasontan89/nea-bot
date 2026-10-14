-- Migration 02: Row Level Security (RLS) & Alert Tracking Schema Hardening
-- Ensures user subscriptions are protected from unauthorized enumeration or tampering,
-- and adds alert tracking columns for deduplication and cooldowns.

-- 1. Enable Row Level Security (RLS) on user_subscriptions table
ALTER TABLE IF EXISTS user_subscriptions ENABLE ROW LEVEL SECURITY;

-- 2. Restrict direct public and authenticated role access to user_subscriptions
-- Supabase Edge Functions interact using the service_role key which automatically bypasses RLS.
-- This policy explicitly blocks any client-side queries using the anon/authenticated key.
DROP POLICY IF EXISTS "Deny public direct access to user_subscriptions" ON user_subscriptions;
CREATE POLICY "Deny public direct access to user_subscriptions"
  ON user_subscriptions
  FOR ALL
  TO anon, authenticated
  USING (false);

-- 3. Add alert timestamp columns for notification deduplication & rate limiting
ALTER TABLE IF EXISTS user_subscriptions
  ADD COLUMN IF NOT EXISTS last_rain_alert_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_psi_alert_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_dengue_alert_at TIMESTAMPTZ;

-- 4. Recommendations for Production Secrets Management in pg_cron:
-- In Supabase, rather than hardcoding the Bearer token in cron schedules:
--   a) Set a custom header or use Supabase Vault:
--      SELECT vault.create_secret('YOUR_NEA_CRON_SECRET', 'nea_cron_secret');
--   b) In pg_cron schedule:
--      SELECT net.http_post(
--        url := 'https://<project-ref>.supabase.co/functions/v1/nea-cron',
--        headers := jsonb_build_object(
--          'Content-Type', 'application/json',
--          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'nea_cron_secret')
--        )
--      );
