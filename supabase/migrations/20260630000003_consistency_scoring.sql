-- ============================================================
-- Misale — Consistency Scoring & Admin Verification RPC
-- Migration: 20260630000003_consistency_scoring
--
-- 1. has_elite_badge column on users
--    Flipped automatically by adjust_consistency_score() when
--    a user's score crosses 90.
--
-- 2. consistency_scores table
--    Tracks per-user gamified score (0–100) and login streak.
--    Direct writes are blocked by RLS; all mutations go through
--    adjust_consistency_score() (SECURITY DEFINER).
--
-- 3. adjust_consistency_score(user_id, modifier)
--    Atomic upsert + elite badge flip. Safe to call from any
--    SECURITY DEFINER context (verification approval, streaks, etc.)
--
-- 4. get_verification_queue()
--    SECURITY DEFINER admin-only RPC. Returns the full pending
--    verification queue with joined user profile data for the
--    mobile admin dashboard.
--
-- 5. process_verification(target_user_id, status, notes, reviewer)
--    SECURITY DEFINER admin-only RPC. Replicates the logic of the
--    admin-verify-user edge function in a form callable from the
--    mobile client via supabase.rpc() (user JWT, role-gated).
--    The edge function remains for service-role external callers.
--
-- 6. Enrich the pending_verifications view with missing fields
--    needed by the admin dashboard (age, religion, profile_photos, etc.)
-- ============================================================

-- ── 1. has_elite_badge column ─────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS
    has_elite_badge BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.has_elite_badge IS
    'Set TRUE automatically when consistency_scores.current_score reaches 90. '
    'Displayed as a premium badge in the discovery deck and profile screens.';

CREATE INDEX IF NOT EXISTS idx_users_elite_badge
    ON users (has_elite_badge) WHERE has_elite_badge = TRUE;

-- ── 2. consistency_scores table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS consistency_scores (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_score       INTEGER     NOT NULL DEFAULT 50,
    streak_days         INTEGER     NOT NULL DEFAULT 0,
    last_calculated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT score_range       CHECK (current_score BETWEEN 0 AND 100),
    CONSTRAINT streak_non_neg    CHECK (streak_days >= 0),
    UNIQUE (user_id)
);

COMMENT ON TABLE consistency_scores IS
    'Gamified engagement score (0–100) per user. '
    'Write-locked via RLS; mutate only through adjust_consistency_score().';

COMMENT ON COLUMN consistency_scores.current_score IS
    'Clamped to [0, 100]. Reaching 90 triggers has_elite_badge = TRUE on users.';

COMMENT ON COLUMN consistency_scores.streak_days IS
    'Consecutive calendar days the user opened the app. '
    'Incremented by the activity heartbeat; reset on a missed day.';

-- Reuse the set_updated_at() trigger defined in 20260101000000_initial_schema
CREATE TRIGGER trg_consistency_scores_updated_at
    BEFORE UPDATE ON consistency_scores
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indices
CREATE INDEX IF NOT EXISTS idx_consistency_user
    ON consistency_scores (user_id);

CREATE INDEX IF NOT EXISTS idx_consistency_elite
    ON consistency_scores (current_score DESC)
    WHERE current_score >= 90;

-- RLS: users can read their own score; all writes go through SECURITY DEFINER
ALTER TABLE consistency_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scores_select_own" ON consistency_scores
    FOR SELECT USING (auth.uid() = user_id);

-- ── 3. adjust_consistency_score ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION adjust_consistency_score(
    p_user_id   UUID,
    p_modifier  INTEGER
)
RETURNS INTEGER  -- new clamped score
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_score INTEGER;
BEGIN
    -- Upsert: initialise row if this is the user's first interaction
    INSERT INTO consistency_scores (user_id, current_score, last_calculated_at)
    VALUES (
        p_user_id,
        GREATEST(0, LEAST(100, 50 + p_modifier)),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET current_score      = GREATEST(0, LEAST(100,
                                 consistency_scores.current_score + p_modifier)),
        last_calculated_at = NOW();

    SELECT current_score INTO v_new_score
    FROM   consistency_scores
    WHERE  user_id = p_user_id;

    -- Elite badge: granted when score first crosses 90; intentionally not
    -- revoked if the score later falls (once earned, kept unless admin revokes)
    IF v_new_score >= 90 THEN
        UPDATE users
        SET    has_elite_badge = TRUE
        WHERE  id              = p_user_id
          AND  has_elite_badge = FALSE;
    END IF;

    RETURN v_new_score;
END;
$$;

COMMENT ON FUNCTION adjust_consistency_score(UUID, INTEGER) IS
    'Atomically adjusts consistency_scores.current_score by p_modifier, '
    'clamped to [0, 100]. Flips users.has_elite_badge = TRUE when the '
    'resulting score reaches 90 or above. Returns the new clamped score.';

-- ── 4. get_verification_queue — admin-only RPC ────────────────────────────────

CREATE OR REPLACE FUNCTION get_verification_queue()
RETURNS TABLE (
    verification_id  UUID,
    user_id          UUID,
    selfie_url       TEXT,
    submission_type  TEXT,
    submitted_at     TIMESTAMPTZ,
    full_name        TEXT,
    display_name     TEXT,
    age              INTEGER,
    gender           TEXT,
    religion         TEXT,
    location_tier    TEXT,
    country          TEXT,
    city             TEXT,
    profile_photos   TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- JWT role gate: must be admin or moderator
    IF COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') NOT IN ('admin', 'moderator') THEN
        RAISE EXCEPTION 'Insufficient privileges: admin or moderator role required'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN QUERY
    SELECT
        v.id                    AS verification_id,
        v.user_id,
        v.selfie_url,
        v.submission_type::TEXT AS submission_type,
        v.submitted_at,
        u.full_name,
        u.display_name,
        u.age,
        u.gender::TEXT          AS gender,
        u.religion::TEXT        AS religion,
        u.location_tier::TEXT   AS location_tier,
        u.country,
        u.city,
        u.profile_photos
    FROM   verifications v
    JOIN   users         u ON u.id = v.user_id
    WHERE  v.status = 'pending'
    ORDER  BY v.submitted_at ASC;
END;
$$;

COMMENT ON FUNCTION get_verification_queue() IS
    'Returns all pending verification submissions with joined user profile data '
    'for the admin dashboard. Callable via supabase.rpc() with a user JWT that '
    'has app_metadata.role = admin or moderator.';

-- ── 5. process_verification — admin-only RPC ──────────────────────────────────
--
-- Mobile-accessible counterpart to the admin-verify-user edge function.
-- The edge function (Bearer = service role key) is for server-side scripts.
-- This RPC is for the mobile admin dashboard (Bearer = user JWT, role-gated).

CREATE OR REPLACE FUNCTION process_verification(
    p_target_user_id  UUID,
    p_status          TEXT,             -- 'approved' | 'rejected'
    p_admin_notes     TEXT DEFAULT NULL,
    p_reviewed_by     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role            TEXT;
    v_verification_id UUID;
    v_new_score       INTEGER;
BEGIN
    -- JWT role gate
    v_role := COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '');
    IF v_role NOT IN ('admin', 'moderator') THEN
        RAISE EXCEPTION 'Insufficient privileges: admin or moderator role required'
            USING ERRCODE = 'P0001';
    END IF;

    -- Input validation
    IF p_status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid status "%": must be approved or rejected', p_status
            USING ERRCODE = 'P0001';
    END IF;

    -- Locate the most-recent pending verification
    SELECT id INTO v_verification_id
    FROM   verifications
    WHERE  user_id = p_target_user_id
      AND  status  = 'pending'
    ORDER  BY submitted_at DESC
    LIMIT  1;

    IF v_verification_id IS NULL THEN
        RAISE EXCEPTION 'No pending verification found for user %', p_target_user_id
            USING ERRCODE = 'P0002';
    END IF;

    -- Stamp the verification row with the decision
    UPDATE verifications
    SET    status      = p_status::verification_status_type,
           admin_notes = p_admin_notes,
           reviewed_by = p_reviewed_by,
           reviewed_at = NOW()
    WHERE  id = v_verification_id;

    -- Approval-only: grant verified badge + consistency score reward
    IF p_status = 'approved' THEN
        UPDATE users
        SET    is_verified = TRUE
        WHERE  id          = p_target_user_id;

        -- +10 score for clearing identity verification
        v_new_score := adjust_consistency_score(p_target_user_id, 10);
    END IF;

    RETURN jsonb_build_object(
        'success',          TRUE,
        'verification_id',  v_verification_id,
        'target_user_id',   p_target_user_id,
        'status',           p_status,
        'is_verified',      (p_status = 'approved'),
        'new_score',        v_new_score,
        'processed_at',     to_json(NOW())#>>'{}'
    );
END;
$$;

COMMENT ON FUNCTION process_verification(UUID, TEXT, TEXT, TEXT) IS
    'Admin/moderator RPC for approving or rejecting an identity verification. '
    'On approval: sets users.is_verified = TRUE and awards +10 consistency points. '
    'Returns a JSONB result with the updated state. '
    'Requires app_metadata.role = admin or moderator in the calling user JWT.';

-- ── 6. Enrich pending_verifications view ──────────────────────────────────────
-- Replace the minimal view from migration 20260630000001 with a richer one
-- that includes all fields needed by the admin dashboard.

CREATE OR REPLACE VIEW pending_verifications AS
SELECT
    v.id               AS verification_id,
    v.user_id,
    v.selfie_url,
    v.submission_type,
    v.submitted_at,
    u.full_name,
    u.display_name,
    u.phone_number,
    u.age,
    u.gender,
    u.religion,
    u.location_tier,
    u.country,
    u.city,
    u.profile_photos,
    u.is_verified,
    u.has_elite_badge
FROM  verifications v
JOIN  users         u ON u.id = v.user_id
WHERE v.status = 'pending'
ORDER BY v.submitted_at ASC;

COMMENT ON VIEW pending_verifications IS
    'Admin queue: all pending identity verification submissions with full user '
    'profile context, ordered oldest-first for fair review sequencing.';
