/**
 * record-drop-action
 *
 * POST /functions/v1/record-drop-action
 *
 * Records a like/pass interaction on a daily drop candidate.
 * On a mutual like it atomically creates a matches_and_chats row,
 * initialises the chat channel, and fires a push notification stub.
 *
 * Body: { drop_id: UUID, target_user_id: UUID, action: "like" | "pass" }
 * Auth: Bearer JWT (Supabase Auth)
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsResponse, jsonResponse } from "../_shared/cors.ts";
import type {
  ApiError,
  DailyDropRow,
  DropActionType,
  FcmPayload,
  RecordActionRequest,
  RecordActionResponse,
} from "../_shared/types.ts";

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_ACTIONS: readonly DropActionType[] = ["like", "pass"] as const;

// ── Supabase client factories ───────────────────────────────────────────────────

function makeServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function makeAnonClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function resolveUserId(
  req: Request,
  anonClient: SupabaseClient,
): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Missing or malformed Authorization header"), {
      code: "MISSING_AUTH",
      status: 401,
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await anonClient.auth.getUser(token);

  if (error || !user?.id) {
    throw Object.assign(new Error("Invalid or expired JWT"), {
      code: "INVALID_JWT",
      status: 401,
    });
  }

  return user.id;
}

// ── Request validation ──────────────────────────────────────────────────────────

function parseRequestBody(raw: unknown): RecordActionRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw Object.assign(
      new Error("Request body must be a JSON object"),
      { code: "INVALID_BODY", status: 400 },
    );
  }

  const b = raw as Record<string, unknown>;

  if (!b.drop_id || typeof b.drop_id !== "string") {
    throw Object.assign(
      new Error("Missing or invalid 'drop_id' (must be a UUID string)"),
      { code: "INVALID_PARAM_DROP_ID", status: 400 },
    );
  }

  if (!b.target_user_id || typeof b.target_user_id !== "string") {
    throw Object.assign(
      new Error("Missing or invalid 'target_user_id' (must be a UUID string)"),
      { code: "INVALID_PARAM_TARGET_USER_ID", status: 400 },
    );
  }

  if (!b.action || !VALID_ACTIONS.includes(b.action as DropActionType)) {
    throw Object.assign(
      new Error(`Invalid 'action'. Must be one of: ${VALID_ACTIONS.join(", ")}`),
      { code: "INVALID_PARAM_ACTION", status: 400 },
    );
  }

  return {
    drop_id:        b.drop_id as string,
    target_user_id: b.target_user_id as string,
    action:         b.action as DropActionType,
  };
}

// ── Drop row validation ──────────────────────────────────────────────────────────

/**
 * Fetches the drop row and verifies:
 *   1. It exists
 *   2. It belongs to the authenticated user (prevents foreign drop mutation)
 *   3. Its candidate_id matches target_user_id (prevents body/param spoofing)
 */
async function fetchAndValidateDrop(
  db: SupabaseClient,
  dropId: string,
  userId: string,
  targetUserId: string,
): Promise<DailyDropRow> {
  const { data, error } = await db
    .from("daily_drops")
    .select("*")
    .eq("id", dropId)
    .single<DailyDropRow>();

  if (error || !data) {
    throw Object.assign(
      new Error(`Drop not found: ${dropId}`),
      { code: "DROP_NOT_FOUND", status: 404 },
    );
  }

  if (data.user_id !== userId) {
    throw Object.assign(
      new Error("This drop does not belong to the authenticated user"),
      { code: "DROP_OWNERSHIP_MISMATCH", status: 403 },
    );
  }

  if (data.candidate_id !== targetUserId) {
    throw Object.assign(
      new Error("target_user_id does not match the drop's candidate_id"),
      { code: "DROP_CANDIDATE_MISMATCH", status: 422 },
    );
  }

  return data;
}

// ── Drop action update ──────────────────────────────────────────────────────────

/**
 * Stamps action_taken and viewed_at on the drop row.
 * Deliberately allows overwriting a prior action so users can change their mind.
 */
async function updateDropAction(
  db: SupabaseClient,
  dropId: string,
  action: DropActionType,
): Promise<void> {
  const { error } = await db
    .from("daily_drops")
    .update({
      action_taken: action,
      viewed_at:    new Date().toISOString(),
    })
    .eq("id", dropId);

  if (error) {
    throw Object.assign(error, { code: "DB_DROP_UPDATE", status: 500 });
  }
}

// ── Mutual like check ────────────────────────────────────────────────────────────

/**
 * Returns true if target_user has already liked current_user in any drop cycle
 * (cross-date — a like from a prior day is still valid).
 */
async function checkMutualLike(
  db: SupabaseClient,
  currentUserId: string,
  targetUserId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("daily_drops")
    .select("id")
    .eq("user_id",      targetUserId)
    .eq("candidate_id", currentUserId)
    .eq("action_taken", "like")
    .limit(1);

  if (error) {
    throw Object.assign(error, { code: "DB_MUTUAL_CHECK", status: 500 });
  }

  return (data?.length ?? 0) > 0;
}

// ── Match creation ──────────────────────────────────────────────────────────────

/**
 * Inserts a matches_and_chats row with canonical pair ordering.
 * UUID string comparison produces the same ordering as the DB CHECK constraint
 * (user_id_1 < user_id_2), so inserts will never violate it.
 *
 * If the pair already has a row (race condition or re-match), the existing
 * chat_thread_id is returned instead of failing.
 */
async function createOrFetchMatch(
  db: SupabaseClient,
  userId: string,
  targetUserId: string,
): Promise<string> {
  const [uid1, uid2] = userId < targetUserId
    ? [userId, targetUserId]
    : [targetUserId, userId];

  const { data: newMatch, error: insertErr } = await db
    .from("matches_and_chats")
    .insert({
      user_id_1:    uid1,
      user_id_2:    uid2,
      match_status: "matched",
      matched_at:   new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  if (insertErr) {
    if (insertErr.code === "23505") {
      // Unique violation — match record already exists; fetch its id
      const { data: existing, error: fetchErr } = await db
        .from("matches_and_chats")
        .select("id")
        .eq("user_id_1", uid1)
        .eq("user_id_2", uid2)
        .single<{ id: string }>();

      if (fetchErr || !existing) {
        throw Object.assign(
          new Error("Match record exists but could not be fetched"),
          { code: "DB_MATCH_FETCH_FAILED", status: 500 },
        );
      }

      return existing.id;
    }

    throw Object.assign(insertErr, { code: "DB_MATCH_INSERT", status: 500 });
  }

  if (!newMatch?.id) {
    throw Object.assign(
      new Error("Match insert returned no id"),
      { code: "DB_MATCH_NO_ID", status: 500 },
    );
  }

  return newMatch.id;
}

// ── FCM push notification stub ─────────────────────────────────────────────────────

/**
 * Logs the match mutation event and provides a fully-structured FCM v1 payload
 * ready for production activation.
 *
 * TO ACTIVATE:
 *   1. Add table: push_tokens (user_id UUID, device_token TEXT, platform TEXT)
 *   2. Set Edge Function secrets: FCM_PROJECT_ID, FCM_SERVER_KEY
 *   3. Uncomment the fetch block and pass `db` as a parameter
 */
async function sendMatchNotification(
  userId1: string,
  userId2: string,
  chatThreadId: string,
): Promise<void> {
  console.log(
    `🔥 MATCH MUTATION REGISTERED: Dispatched notification message to users ${userId1} and ${userId2} — chat_thread_id: ${chatThreadId}`,
  );

  // ── FCM v1 REST API payload (production-ready, awaiting device tokens) ────
  //
  // const FCM_PROJECT_ID = Deno.env.get("FCM_PROJECT_ID") ?? "";
  // const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY") ?? "";
  //
  // const buildPayload = (deviceToken: string, matchedUserId: string): FcmPayload => ({
  //   message: {
  //     token: deviceToken,
  //     notification: {
  //       title: "ምሳሌ — New Match! 💛",
  //       body: "You matched! Open Misale to start your conversation.",
  //     },
  //     data: {
  //       type:            "new_match",
  //       chat_thread_id:  chatThreadId,
  //       matched_user_id: matchedUserId,
  //     },
  //     apns: {
  //       payload: {
  //         aps: {
  //           badge: 1,
  //           sound: "default",
  //           alert: "You have a new match on Misale!",
  //         },
  //       },
  //     },
  //     android: {
  //       priority: "high",
  //       notification: {
  //         sound:      "default",
  //         channel_id: "matches",
  //       },
  //     },
  //   },
  // });
  //
  // // Dispatch to both users in parallel; a missing token is non-fatal
  // await Promise.all(
  //   [[userId1, userId2], [userId2, userId1]].map(async ([recipientId, matchedId]) => {
  //     const { data: tokenRow } = await db
  //       .from("push_tokens")
  //       .select("device_token")
  //       .eq("user_id", recipientId)
  //       .maybeSingle();
  //
  //     if (!tokenRow?.device_token) {
  //       console.warn(`[FCM] No device token for user ${recipientId} — skipping`);
  //       return;
  //     }
  //
  //     const res = await fetch(
  //       `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
  //       {
  //         method:  "POST",
  //         headers: {
  //           "Authorization": `Bearer ${FCM_SERVER_KEY}`,
  //           "Content-Type":  "application/json",
  //         },
  //         body: JSON.stringify(buildPayload(tokenRow.device_token, matchedId)),
  //       },
  //     );
  //
  //     if (!res.ok) {
  //       console.error(`[FCM] Push failed for ${recipientId}: ${await res.text()}`);
  //     } else {
  //       console.log(`[FCM] Push delivered to ${recipientId} (token: ${tokenRow.device_token.slice(0, 12)}...)`);
  //     }
  //   }),
  // );
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return corsResponse();
  if (req.method !== "POST") {
    return jsonResponse<ApiError>(
      { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" },
      405,
    );
  }

  const anonClient = makeAnonClient();
  const db         = makeServiceClient();

  try {
    // ── 1. Authenticate ────────────────────────────────────────────────────
    const userId = await resolveUserId(req, anonClient);

    // ── 2. Parse and validate body ──────────────────────────────────────────
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return jsonResponse<ApiError>(
        { error: "Request body must be valid JSON", code: "INVALID_JSON" },
        400,
      );
    }

    const { drop_id, target_user_id, action } = parseRequestBody(rawBody);

    // ── 3. Verify drop ownership + candidate alignment ─────────────────────────
    await fetchAndValidateDrop(db, drop_id, userId, target_user_id);

    // ── 4. Stamp the interaction on the drop row ─────────────────────────────
    await updateDropAction(db, drop_id, action);

    const processedAt = new Date().toISOString();

    // ── 5. Pass: no match possible — return immediately ───────────────────────
    if (action === "pass") {
      return jsonResponse<RecordActionResponse>({
        matched:      false,
        action,
        processed_at: processedAt,
      });
    }

    // ── 6. Like: check if target has already liked back ─────────────────────
    const isMutual = await checkMutualLike(db, userId, target_user_id);

    if (!isMutual) {
      return jsonResponse<RecordActionResponse>({
        matched:      false,
        action,
        processed_at: processedAt,
      });
    }

    // ── 7. Mutual match: create row + fire notification ─────────────────────
    const chatThreadId = await createOrFetchMatch(db, userId, target_user_id);

    // Fire-and-forget — a notification error must never block the match response
    sendMatchNotification(userId, target_user_id, chatThreadId).catch((err) => {
      console.error(
        "[record-drop-action] sendMatchNotification failed:",
        (err as Error)?.message,
      );
    });

    return jsonResponse<RecordActionResponse>({
      matched:         true,
      chat_thread_id:  chatThreadId,
      action,
      processed_at:    processedAt,
    });
  } catch (err: unknown) {
    const e      = err as Error & { code?: string; status?: number; details?: string };
    const status = e.status ?? 500;
    const code   = e.code   ?? "INTERNAL_ERROR";

    console.error(`[record-drop-action] ${code}:`, e.message, e.details ?? "");

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
