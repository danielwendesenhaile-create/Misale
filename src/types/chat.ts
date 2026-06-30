/**
 * Chat & matches types — scoped to the mobile client.
 * Mirrors the matches_and_chats table and its embedded messages JSONB.
 */

// ── Raw DB shapes ─────────────────────────────────────────────────────────────

/** Shape of one entry in matches_and_chats.messages JSONB array */
export interface RawMessage {
  sender_id: string;
  body:      string;
  sent_at:   string; // ISO-8601 string from append_chat_message()
}

/** Shape returned by the embedded select in useMatches / useChat */
export interface RawMatchRow {
  id:              string;
  user_id_1:       string;
  user_id_2:       string;
  match_status:    "pending" | "matched" | "unmatched" | "blocked";
  matched_at:      string | null;
  last_message_at: string | null;
  messages:        RawMessage[];
  updated_at:      string;
  user1:           MatchedUser;
  user2:           MatchedUser;
}

// ── Domain types ──────────────────────────────────────────────────────────────

/** Profile info needed to render a match avatar / chat header */
export interface MatchedUser {
  id:             string;
  display_name:   string | null;
  profile_photos: string[];
  is_verified:    boolean;
}

/**
 * Client-side message, extended from RawMessage with local tracking fields.
 * "sending" — optimistic, network request in-flight
 * "sent"    — confirmed by the backend (either via RPC return or Realtime)
 * "failed"  — network / RPC error; body stays visible with ⚠ indicator
 */
export interface ChatMessage {
  local_id:  string;
  sender_id: string;
  body:      string;
  sent_at:   string;
  status:    "sending" | "sent" | "failed";
}

/** Item shape for the matches list / inbox view */
export interface MatchListItem {
  threadId:       string;
  otherUser:      MatchedUser;
  lastMessage:    RawMessage | null;
  lastMessageAt:  string | null;
  matchedAt:      string;
  /** True when messages array is empty — show "New match" prompt */
  isNewMatch:     boolean;
  /** True when the last message was sent by the other user (no read tracking in MVP) */
  hasUnread:      boolean;
}
