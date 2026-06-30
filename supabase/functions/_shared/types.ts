// ── Enum mirrors (must match DB enum definitions exactly) ────────────────────

export type GenderType = "male" | "female" | "non_binary" | "prefer_not_to_say";

export type ReligionType =
  | "Orthodox"
  | "Protestant"
  | "Catholic"
  | "Muslim"
  | "Other"
  | "None";

export type LocationTierType = "Local_Ethiopia" | "Diaspora";

export type DropActionType = "like" | "pass";

export type MatchStatusType = "pending" | "matched" | "unmatched" | "blocked";

// ── Database row shapes ───────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  phone_number: string;
  phone_verified: boolean;
  full_name: string;
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
  is_active: boolean;
  is_verified: boolean;
  last_active_at: string;
  created_at: string;
  updated_at: string;
}

// active_discovery_pool view shape (subset of UserProfile, no PII)
export interface DiscoveryCandidate {
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

export interface DailyDropInsert {
  user_id: string;
  candidate_id: string;
  grid_position: number;
  refresh_timestamp: string;
  drop_date: string;
}

export interface DailyDropRow extends DailyDropInsert {
  id: string;
  viewed_at: string | null;
  action_taken: DropActionType | null;
  created_at: string;
}

// ── API response shapes ───────────────────────────────────────────────────────

export interface GenerateDropSuccess {
  status: "generated" | "existing";
  drop_date: string;
  count: number;
  candidates: DiscoveryCandidate[];
  meta: {
    location_broadened: boolean;
    religion_strict: boolean;
    generated_at: string;
  };
}

export interface ApiError {
  error: string;
  code: string;
  details?: string;
}
