/**
 * Admin-layer types — shapes returned by SECURITY DEFINER RPCs callable
 * from the mobile admin dashboard (user JWT, role-gated at the DB layer).
 */

// ── Verification queue ────────────────────────────────────────────────────────

/**
 * One row from get_verification_queue().
 * Joins verifications + users with all fields needed for side-by-side review.
 */
export interface PendingVerification {
  verification_id:  string;
  user_id:          string;
  selfie_url:       string;
  submission_type:  "photo_selfie" | "id_document";
  submitted_at:     string;
  full_name:        string;
  display_name:     string | null;
  age:              number;
  gender:           string;
  religion:         string | null;
  location_tier:    string;
  country:          string | null;
  city:             string | null;
  profile_photos:   string[];
}

// ── Verification decision ─────────────────────────────────────────────────────

export type VerificationDecision = "approved" | "rejected";

/** Return type of process_verification() */
export interface ProcessVerificationResult {
  success:          boolean;
  verification_id:  string;
  target_user_id:   string;
  status:           VerificationDecision;
  is_verified:      boolean;
  new_score:        number | null;
  processed_at:     string;
}

// ── Consistency score ─────────────────────────────────────────────────────────

export interface ConsistencyScore {
  id:                 string;
  user_id:            string;
  current_score:      number;
  streak_days:        number;
  last_calculated_at: string;
  created_at:         string;
  updated_at:         string;
}

// ── Admin user metadata ───────────────────────────────────────────────────────

export type AdminRole = "admin" | "moderator";

export interface AdminAppMetadata {
  role?: AdminRole;
}
