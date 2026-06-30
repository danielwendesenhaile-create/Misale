-- ============================================================
-- Misale — Chat Realtime Support
-- Migration: 20260630000002_chat_realtime
--
-- 1. REPLICA IDENTITY FULL on matches_and_chats so that Supabase
--    Realtime UPDATE events include the complete NEW row (with the
--    messages JSONB array). Without this, only the changed columns
--    are sent in the CDC payload and the messages array may be null.
--
-- 2. append_chat_message() — atomic JSONB append function.
--    Avoids read-then-write race conditions when two users send
--    messages concurrently.  Called via supabase.rpc() on the
--    mobile client.
--
-- 3. Add matches_and_chats to the supabase_realtime publication
--    (idempotent; no-ops if already present or if publication
--    doesn't exist yet — handled by the DO block).
-- ============================================================

-- ── 1. Full replica identity ──────────────────────────────────────────────────

ALTER TABLE matches_and_chats REPLICA IDENTITY FULL;

-- ── 2. append_chat_message ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION append_chat_message(
    p_thread_id UUID,
    p_sender_id UUID,
    p_body      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sent_at  TEXT;
    v_new_msg  JSONB;
BEGIN
    -- ISO-8601 string consistent with JavaScript's new Date().toISOString()
    v_sent_at := to_char(
        clock_timestamp() AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    );

    v_new_msg := jsonb_build_object(
        'sender_id', p_sender_id::text,
        'body',      p_body,
        'sent_at',   v_sent_at
    );

    UPDATE matches_and_chats
    SET    messages        = messages || jsonb_build_array(v_new_msg),
           last_message_at = clock_timestamp()
    WHERE  id           = p_thread_id
      AND  match_status = 'matched'
      AND  (user_id_1 = p_sender_id OR user_id_2 = p_sender_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'append_chat_message: thread % not found or sender % is not a participant',
            p_thread_id, p_sender_id
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_new_msg;
END;
$$;

COMMENT ON FUNCTION append_chat_message(UUID, UUID, TEXT) IS
    'Atomically appends {sender_id, body, sent_at} to matches_and_chats.messages. '
    'Validates participant membership and match_status = matched. '
    'Returns the new message object including the server-generated sent_at timestamp. '
    'SECURITY DEFINER so RLS is not applied to the UPDATE itself; '
    'the participant check above enforces access control.';

-- ── 3. Supabase Realtime publication ─────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        -- Idempotent: no error if already a member
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE matches_and_chats;
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
    END IF;
END;
$$;
