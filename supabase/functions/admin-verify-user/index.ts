/**
 * admin-verify-user
 *
 * POST /functions/v1/admin-verify-user
 *
 * Admin-only endpoint for approving or rejecting a user's identity verification.
 * Security gate: the Bearer token MUST equal the SUPABASE_SERVICE_ROLE_KEY.
 * Any regular user JWT (role: "authenticated") or anon key is rejected with 403.
 *
 * On "approved":
 *   - Stamps the verifications row (status, admin_notes, reviewed_by, reviewed_at)
 *   - Flips users.is_verified = TRUE to grant the cultural blue-checkmark badge
 *
 * On "rejected":
 *   - Stamps the verifications row only; users.is_verified is not changed
 *
 * Body: { target_user_id: UUID, status: "approved"|"rejected", admin_notes?: string, reviewed_by?: string }
 * Auth: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsResponse, jsonResponse } from "../_shared/cors.ts";
import type {
  AdminVerifyRequest,
  AdminVerifyResponse,
  ApiError,
} from "../_shared/types.ts";

// ── Client factory ─────────────────────────────────────────────────────────────

function makeServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Security gate ──────────────────────────────────────────────────────────────

/**
 * Compares the raw Bearer token against the known SUPABASE_SERVICE_ROLE_KEY value.
 * This is a direct string equality check — not JWT validation — because the service
 * role key itself is the credential (no user session is involved).
 * Regular user JWTs (role:"authenticated") and the anon key both fail this check.
 */
function assertServiceRole(req: Request): void {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw Object.assign(
      new Error("Missing or malformed Authorization header"),
      { code: "MISSING_AUTH", status: 401 },
    );
  }

  const token          = authHeader.slice("Bearer ".length).trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceRoleKey || token !== serviceRoleKey) {
    throw Object.assign(
      new Error("This endpoint requires the Supabase service role key"),
      { code: "SERVICE_ROLE_REQUIRED", status: 403 },
    );
  }
}

// ── Request validation ─────────────────────────────────────────────────────────

const VALID_STATUSES = ["approved", "rejected"] as const;
type AdminStatus = typeof VALID_STATUSES[number];

function parseRequestBody(raw: unknown): AdminVerifyRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw Object.assign(
      new Error("Request body must be a JSON object"),
      { code: "INVALID_BODY", status: 400 },
    );
  }

  const b = raw as Record<string, unknown>;

  if (!b.target_user_id || typeof b.target_user_id !== "string") {
    throw Object.assign(
      new Error("Missing or invalid 'target_user_id' (must be a UUID string)"),
      { code: "INVALID_PARAM_TARGET_USER_ID", status: 400 },
    );
  }

  if (!b.status || !VALID_STATUSES.includes(b.status as AdminStatus)) {
    throw Object.assign(
      new Error(`Invalid 'status'. Must be one of: ${VALID_STATUSES.join(", ")}`),
      { code: "INVALID_PARAM_STATUS", status: 400 },
    );
  }

  return {
    target_user_id: b.target_user_id as string,
    status:         b.status as AdminStatus,
    admin_notes:    typeof b.admin_notes === "string" ? b.admin_notes : undefined,
    reviewed_by:    typeof b.reviewed_by === "string" ? b.reviewed_by : undefined,
  };
}

// ── Verification row lookup ────────────────────────────────────────────────────

interface VerificationRow {
  id:      string;
  user_id: string;
  status:  string;
}

/**
 * Finds the most recently submitted pending verification for the target user.
 * Returns 404 if no pending row exists (already decided, or user never submitted).
 */
async function fetchPendingVerification(
  db: SupabaseClient,
  targetUserId: string,
): Promise<VerificationRow> {
  const { data, error } = await db
    .from("verifications")
    .select("id, user_id, status")
    .eq("user_id", targetUserId)
    .eq("status",  "pending")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .single<VerificationRow>();

  if (error || !data) {
    throw Object.assign(
      new Error(`No pending verification found for user: ${targetUserId}`),
      { code: "VERIFICATION_NOT_FOUND", status: 404 },
    );
  }

  return data;
}

// ── DB mutations ───────────────────────────────────────────────────────────────

/**
 * Two-phase write (verification stamp → user flag):
 *   1. Always: update verifications row with decision metadata
 *   2. On "approved" only: flip users.is_verified = TRUE
 *
 * Intentionally does NOT reset is_verified on rejection — a previously verified
 * user whose new submission is rejected retains their badge.
 */
async function applyVerificationDecision(
  db: SupabaseClient,
  verificationId: string,
  targetUserId: string,
  status: AdminStatus,
  adminNotes: string | undefined,
  reviewedBy: string | undefined,
): Promise<void> {
  const reviewedAt = new Date().toISOString();

  const { error: verErr } = await db
    .from("verifications")
    .update({
      status,
      admin_notes: adminNotes ?? null,
      reviewed_by: reviewedBy ?? null,
      reviewed_at: reviewedAt,
    })
    .eq("id", verificationId);

  if (verErr) {
    throw Object.assign(verErr, { code: "DB_VERIFICATION_UPDATE", status: 500 });
  }

  if (status === "approved") {
    const { error: userErr } = await db
      .from("users")
      .update({ is_verified: true })
      .eq("id", targetUserId);

    if (userErr) {
      throw Object.assign(userErr, { code: "DB_USER_VERIFY_UPDATE", status: 500 });
    }
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") {
    return jsonResponse<ApiError>(
      { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" },
      405,
    );
  }

  try {
    // ── 1. Enforce service-role-only access ────────────────────────────────
    assertServiceRole(req);

    const db = makeServiceClient();

    // ── 2. Parse and validate body ─────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return jsonResponse<ApiError>(
        { error: "Request body must be valid JSON", code: "INVALID_JSON" },
        400,
      );
    }

    const { target_user_id, status, admin_notes, reviewed_by } =
      parseRequestBody(rawBody);

    // ── 3. Find most recent pending verification ───────────────────────────
    const verification = await fetchPendingVerification(db, target_user_id);

    // ── 4. Stamp verification + conditionally flip is_verified ─────────────
    await applyVerificationDecision(
      db,
      verification.id,
      target_user_id,
      status,
      admin_notes,
      reviewed_by,
    );

    const processedAt = new Date().toISOString();
    const isVerified  = status === "approved";

    console.log(
      `[admin-verify-user] ${status.toUpperCase()}: user ${target_user_id} — verification ${verification.id} — is_verified: ${isVerified}`,
    );

    return jsonResponse<AdminVerifyResponse>({
      success:         true,
      target_user_id,
      verification_id: verification.id,
      status,
      is_verified:     isVerified,
      processed_at:    processedAt,
    });
  } catch (err: unknown) {
    const e        = err as Error & { code?: string; status?: number; details?: string };
    const status   = e.status ?? 500;
    const code     = e.code   ?? "INTERNAL_ERROR";

    console.error(`[admin-verify-user] ${code}:`, e.message, e.details ?? "");

    return jsonResponse<ApiError>(
      {
        error: e.message ?? "An unexpected error occurred",
        code,
        ...(e.details ? { details: e.details } : {}),
      },
      status,
    );
  }
}

Deno.serve(handler);
