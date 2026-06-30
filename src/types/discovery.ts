/**
 * Discovery deck types — scoped to the mobile client.
 * Mirror the Supabase backend types (supabase/functions/_shared/types.ts)
 * without importing Deno-only modules into the React Native bundle.
 */

// ── Enums (must match DB enum definitions exactly) ────────────────────────────

export type GenderType =
  | "male"
  | "female"
  | "non_binary"
  | "prefer_not_to_say";

export type ReligionType =
  | "Orthodox"
  | "Protestant"
  | "Catholic"
  | "Muslim"
  | "Other"
  | "None";

export type LocationTierType = "Local_Ethiopia" | "Diaspora";

export type DropActionType = "like" | "pass";

// ── Candidate profile ─────────────────────────────────────────────────────────

/** Shape returned by the active_discovery_pool view, embedded via Supabase join */
export interface DropCandidate {
  id: string;
  display_name: string | null;
  date_of_birth: string;
  age: number;
  gender: GenderType;
  bio: string | null;
  profile_photos: string[];
  languages: string[];
  religion: ReligionType | null;
  strict_religious_alignment: boolean;
  ethnicity: string | null;
  location_tier: LocationTierType;
  country: string | null;
  city: string | null;
  is_verified: boolean;
}

// ── Deck card ─────────────────────────────────────────────────────────────────

/** A single slot in the daily drop grid — drop_id links back to daily_drops.id */
export interface DropCard {
  dropId: string;
  gridPosition: number;
  candidate: DropCandidate;
}

// ── Raw DB query result shape (before remapping) ──────────────────────────────

/** Shape of a row returned by the embedded select in useDailyDrop */
export interface RawDropRow {
  id: string;
  grid_position: number;
  candidate: DropCandidate | null;
}

// ── API payloads ──────────────────────────────────────────────────────────────

export interface RecordActionPayload {
  drop_id: string;
  target_user_id: string;
  action: DropActionType;
}

/** Subset of RecordActionResponse from the backend */
export interface ActionResult {
  matched: boolean;
  chat_thread_id?: string;
  action: DropActionType;
  processed_at: string;
}

/** Shape when matched = true (guaranteed chat_thread_id) */
export interface MatchResult {
  chat_thread_id: string;
  processed_at: string;
}
