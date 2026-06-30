-- ============================================================
-- Misale (ምሳሌ) — MVP Database Schema
-- Supabase / PostgreSQL
-- Migration: 20260101000000_initial_schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- for name/bio fuzzy search

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE gender_type AS ENUM (
    'male',
    'female',
    'non_binary',
    'prefer_not_to_say'
);

CREATE TYPE religion_type AS ENUM (
    'Orthodox',
    'Protestant',
    'Catholic',
    'Muslim',
    'Other',
    'None'
);

CREATE TYPE location_tier_type AS ENUM (
    'Local_Ethiopia',
    'Diaspora'
);

CREATE TYPE drop_action_type AS ENUM (
    'like',
    'pass'
);

CREATE TYPE match_status_type AS ENUM (
    'pending',
    'matched',
    'unmatched',
    'blocked'
);

CREATE TYPE verification_status_type AS ENUM (
    'pending',
    'approved',
    'rejected'
);

CREATE TYPE verification_submission_type AS ENUM (
    'photo_selfie',
    'id_document'
);

-- ============================================================
-- TABLE: users
-- ============================================================

CREATE TABLE users (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Auth
    phone_number                TEXT UNIQUE NOT NULL,
    phone_verified              BOOLEAN NOT NULL DEFAULT FALSE,

    -- Identity
    full_name                   TEXT NOT NULL,
    display_name                TEXT,
    date_of_birth               DATE NOT NULL,
    -- Age stored as generated column to stay current
    age                         INTEGER GENERATED ALWAYS AS (
                                    EXTRACT(YEAR FROM AGE(date_of_birth))::INTEGER
                                ) STORED,
    gender                      gender_type NOT NULL,
    bio                         TEXT,
    profile_photos              TEXT[] NOT NULL DEFAULT '{}',

    -- Cultural profile
    languages                   TEXT[] NOT NULL DEFAULT '{}',
    religion                    religion_type,
    -- When TRUE: only surfaces users with matching religion in drops
    strict_religious_alignment  BOOLEAN NOT NULL DEFAULT FALSE,
    ethnicity                   TEXT,

    -- Location
    location_tier               location_tier_type NOT NULL,
    country                     TEXT,
    city                        TEXT,

    -- Discovery eligibility
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified                 BOOLEAN NOT NULL DEFAULT FALSE,
    last_active_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Audit
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT age_minimum CHECK (
        EXTRACT(YEAR FROM AGE(date_of_birth)) >= 18
    ),
    CONSTRAINT languages_valid CHECK (
        languages <@ ARRAY['English','Amharic','Oromo','Tigrinya']::TEXT[]
    ),
    CONSTRAINT photos_max CHECK (
        array_length(profile_photos, 1) IS NULL OR array_length(profile_photos, 1) <= 6
    )
);

COMMENT ON COLUMN users.strict_religious_alignment IS
    'When TRUE the drop engine only surfaces candidates sharing the same religion value.';
COMMENT ON COLUMN users.is_active IS
    'Set FALSE by flag_inactive_accounts() when last_active_at > 30 days ago.';

-- ============================================================
-- TABLE: daily_drops
-- ============================================================

CREATE TABLE daily_drops (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    candidate_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- 10-slot gamified grid position (1-10)
    grid_position       INTEGER NOT NULL,

    viewed_at           TIMESTAMPTZ,
    action_taken        drop_action_type,
    refresh_timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    drop_date           DATE NOT NULL DEFAULT CURRENT_DATE,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT grid_position_range CHECK (grid_position BETWEEN 1 AND 10),
    CONSTRAINT no_self_drop CHECK (user_id <> candidate_id),
    -- Each user gets exactly one candidate per grid slot per day
    UNIQUE (user_id, drop_date, grid_position),
    -- A candidate can appear in only one slot per user per day
    UNIQUE (user_id, drop_date, candidate_id)
);

COMMENT ON TABLE daily_drops IS
    'Gamified 10-slot daily discovery grid. Regenerated every 24 hours per user.';

-- ============================================================
-- TABLE: matches_and_chats
-- ============================================================

CREATE TABLE matches_and_chats (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Canonical pair ordering prevents duplicate (A,B) / (B,A) rows
    user_id_1           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id_2           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    match_status        match_status_type NOT NULL DEFAULT 'pending',
    matched_at          TIMESTAMPTZ,
    last_message_at     TIMESTAMPTZ,

    -- Lightweight JSONB message thread; graduate to a separate table at scale
    messages            JSONB NOT NULL DEFAULT '[]'::JSONB,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT canonical_pair_order CHECK (user_id_1 < user_id_2),
    UNIQUE (user_id_1, user_id_2)
);

COMMENT ON COLUMN matches_and_chats.messages IS
    'Array of {sender_id, body, sent_at} objects. Migrate to dedicated messages table post-MVP.';

-- ============================================================
-- TABLE: verifications
-- ============================================================

CREATE TABLE verifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    selfie_url          TEXT NOT NULL,
    submission_type     verification_submission_type NOT NULL DEFAULT 'photo_selfie',

    status              verification_status_type NOT NULL DEFAULT 'pending',
    admin_notes         TEXT,
    reviewed_by         TEXT,
    reviewed_at         TIMESTAMPTZ,

    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate active submissions
    CONSTRAINT one_pending_per_user EXCLUDE USING btree (
        user_id WITH =
    ) WHERE (status = 'pending')
);

-- ============================================================
-- INDICES
-- ============================================================

-- Discovery queue: active users by religion + location
CREATE INDEX idx_users_religion ON users (religion) WHERE is_active = TRUE;
CREATE INDEX idx_users_location_tier ON users (location_tier) WHERE is_active = TRUE;
CREATE INDEX idx_users_country_city ON users (country, city) WHERE is_active = TRUE;
CREATE INDEX idx_users_gender ON users (gender) WHERE is_active = TRUE;
CREATE INDEX idx_users_last_active ON users (last_active_at);

-- Drop lookups
CREATE INDEX idx_drops_user_date ON daily_drops (user_id, drop_date);
CREATE INDEX idx_drops_candidate ON daily_drops (candidate_id);
CREATE INDEX idx_drops_action ON daily_drops (user_id, action_taken) WHERE action_taken IS NOT NULL;

-- Match lookups
CREATE INDEX idx_matches_user1 ON matches_and_chats (user_id_1, match_status);
CREATE INDEX idx_matches_user2 ON matches_and_chats (user_id_2, match_status);
CREATE INDEX idx_matches_last_message ON matches_and_chats (last_message_at DESC) WHERE match_status = 'matched';

-- Verification admin queue
CREATE INDEX idx_verifications_pending ON verifications (submitted_at) WHERE status = 'pending';

-- GIN index for array containment queries (religion filter, language filter)
CREATE INDEX idx_users_languages_gin ON users USING GIN (languages);

-- ============================================================
-- FUNCTION: updated_at auto-stamp
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_matches_updated_at
    BEFORE UPDATE ON matches_and_chats
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- CULTURAL MECHANIC 1:
-- Strict Religious Alignment enforcement at INSERT on daily_drops
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_religious_alignment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_user_religion     religion_type;
    v_strict            BOOLEAN;
    v_candidate_religion religion_type;
BEGIN
    SELECT religion, strict_religious_alignment
    INTO   v_user_religion, v_strict
    FROM   users
    WHERE  id = NEW.user_id;

    -- Only enforce when the user has toggled strict alignment on
    IF v_strict = TRUE THEN
        SELECT religion
        INTO   v_candidate_religion
        FROM   users
        WHERE  id = NEW.candidate_id;

        IF v_user_religion IS DISTINCT FROM v_candidate_religion THEN
            RAISE EXCEPTION
                'strict_alignment_violation: user % (religion: %) cannot be shown candidate % (religion: %)',
                NEW.user_id, v_user_religion, NEW.candidate_id, v_candidate_religion
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_religious_alignment
    BEFORE INSERT ON daily_drops
    FOR EACH ROW EXECUTE FUNCTION enforce_religious_alignment();

-- ============================================================
-- CULTURAL MECHANIC 2:
-- flag_inactive_accounts() - marks profiles inactive after 30 days
-- idle to hide ghost profiles from the discovery queue.
-- Call via Supabase Edge Function cron or pg_cron:
--   SELECT cron.schedule('flag-inactive','0 2 * * *','SELECT flag_inactive_accounts()');
-- ============================================================

CREATE OR REPLACE FUNCTION flag_inactive_accounts()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_affected INTEGER;
BEGIN
    UPDATE users
    SET    is_active = FALSE
    WHERE  last_active_at < NOW() - INTERVAL '30 days'
      AND  is_active = TRUE;

    GET DIAGNOSTICS v_affected = ROW_COUNT;

    RAISE NOTICE 'flag_inactive_accounts: flagged % profile(s) as inactive', v_affected;
    RETURN v_affected;
END;
$$;

COMMENT ON FUNCTION flag_inactive_accounts() IS
    'Marks users inactive when last_active_at exceeds 30 calendar days. '
    'Returns count of rows updated. Schedule nightly via pg_cron.';

-- ============================================================
-- FUNCTION: reactivate_user(user_id UUID)
-- Called on app open to restore active status
-- ============================================================

CREATE OR REPLACE FUNCTION reactivate_user(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    UPDATE users
    SET    is_active      = TRUE,
           last_active_at = NOW()
    WHERE  id = p_user_id;
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY (Supabase)
-- ============================================================

ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_drops        ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches_and_chats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications      ENABLE ROW LEVEL SECURITY;

-- users: each user reads/writes their own row only
CREATE POLICY "users_select_own" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "users_insert_own" ON users
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Allow reading basic profile info of active users (for discovery rendering)
CREATE POLICY "users_select_active_profiles" ON users
    FOR SELECT USING (is_active = TRUE AND is_verified = TRUE);

-- daily_drops: visible only to the recipient user
CREATE POLICY "drops_select_own" ON daily_drops
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "drops_insert_own" ON daily_drops
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "drops_update_own" ON daily_drops
    FOR UPDATE USING (auth.uid() = user_id);

-- matches_and_chats: visible to both matched users
CREATE POLICY "matches_select_participant" ON matches_and_chats
    FOR SELECT USING (
        auth.uid() = user_id_1 OR auth.uid() = user_id_2
    );

CREATE POLICY "matches_insert_participant" ON matches_and_chats
    FOR INSERT WITH CHECK (
        auth.uid() = user_id_1 OR auth.uid() = user_id_2
    );

CREATE POLICY "matches_update_participant" ON matches_and_chats
    FOR UPDATE USING (
        auth.uid() = user_id_1 OR auth.uid() = user_id_2
    );

-- verifications: user sees their own; admins use service role
CREATE POLICY "verifications_select_own" ON verifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "verifications_insert_own" ON verifications
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- VIEWS
-- ============================================================

-- Active discovery pool (used by drop generation query)
CREATE VIEW active_discovery_pool AS
SELECT
    id,
    display_name,
    date_of_birth,
    age,
    gender,
    bio,
    profile_photos,
    languages,
    religion,
    strict_religious_alignment,
    ethnicity,
    location_tier,
    country,
    city,
    is_verified
FROM users
WHERE is_active = TRUE
  AND is_verified = TRUE
  AND array_length(profile_photos, 1) >= 1;

COMMENT ON VIEW active_discovery_pool IS
    'Verified, active users eligible for daily drop generation. '
    'Excludes ghost profiles and unverified accounts.';
