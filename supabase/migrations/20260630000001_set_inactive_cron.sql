-- ============================================================
-- Misale (ምሳሌ) — Nightly Maintenance Jobs
-- Migration: 20260630000001_set_inactive_cron
-- ============================================================
-- Enables pg_cron and schedules two nightly jobs at 00:00 UTC:
--
--   1. flag_inactive_accounts()  (defined in 20260101000000_initial_schema)
--      Marks users inactive when last_active_at > 30 days ago.
--      Hides ghost profiles from the discovery queue.
--
--   2. purge_expired_drops()     (defined below)
--      Deletes unviewed daily_drop rows older than 24 hours.
--      Keeps the table lean without touching actioned rows.
-- ============================================================

-- ── Enable pg_cron ─────────────────────────────────────────────────────────────
-- pg_cron is available in all Supabase projects (Postgres 14+).
-- Requires the extension to be whitelisted in your Supabase project settings
-- if running in a managed environment.

CREATE EXTENSION IF NOT EXISTS pg_cron;

GRANT USAGE ON SCHEMA cron TO postgres;

-- ── FUNCTION: purge_expired_drops() ───────────────────────────────────────────
-- Removes daily_drop rows that were never acted on and are older than 24 hours.
-- Rows with action_taken set (liked / passed) are deliberately preserved for
-- mutual-like detection in record-drop-action (cross-date scan).

CREATE OR REPLACE FUNCTION purge_expired_drops()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM daily_drops
  WHERE  action_taken IS NULL
    AND  created_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RAISE NOTICE 'purge_expired_drops: removed % unviewed drop row(s)', v_deleted;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION purge_expired_drops() IS
  'Deletes unviewed (action_taken IS NULL) daily_drop rows older than 24 hours. '
  'Rows with a recorded action are preserved for mutual-like detection. '
  'Runs nightly via pg_cron at 00:00 UTC.';

-- ── Schedule nightly jobs ─────────────────────────────────────────────────────
-- Idempotent: unschedule by matching jobname before re-registering, so this
-- migration can be re-applied without creating duplicate cron entries.

SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'flag-inactive-accounts';

SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'purge-expired-drops';

-- Ghost-profile suppression: runs at 00:00 UTC every day
SELECT cron.schedule(
  'flag-inactive-accounts',
  '0 0 * * *',
  'SELECT flag_inactive_accounts()'
);

-- Stale drop purge: runs at 00:00 UTC every day (right after flag-inactive)
SELECT cron.schedule(
  'purge-expired-drops',
  '0 0 * * *',
  'SELECT purge_expired_drops()'
);

-- ── Verification view ──────────────────────────────────────────────────────────
-- A convenience view for the admin dashboard: pending verifications ordered by
-- submission time so the oldest reviews surface first.

CREATE OR REPLACE VIEW pending_verifications AS
SELECT
  v.id                AS verification_id,
  v.user_id,
  u.full_name,
  u.display_name,
  u.phone_number,
  u.location_tier,
  v.selfie_url,
  v.submission_type,
  v.submitted_at
FROM verifications v
JOIN users u ON u.id = v.user_id
WHERE v.status = 'pending'
ORDER BY v.submitted_at ASC;

COMMENT ON VIEW pending_verifications IS
  'Admin queue: pending identity verification submissions, oldest first.';
