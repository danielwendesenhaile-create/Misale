/**
 * generate-daily-drop
 *
 * POST /functions/v1/generate-daily-drop
 *
 * Generates or returns the authenticated user's 10-slot daily discovery
 * grid. Applies Ethiopian cultural filters (strict religious alignment,
 * location tier priority, ghost-profile exclusion) before writing rows
 * to the daily_drops table.
 *
 * Auth: Bearer JWT (Supabase Auth). No request body required.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsResponse, jsonResponse } from "../_shared/cors.ts";
import type {
  ApiError,
  DiscoveryCandidate,
  DailyDropInsert,
  DailyDropRow,
  GenderType,
  GenerateDropSuccess,
  LocationTierType,
  ReligionType,
  UserProfile,
} from "../_shared/types.ts";

// ── Constants ─────────────────────────────────────────────────────────────────

const DROP_GRID_SIZE = 10;

// Opposite-gender map for MVP (binary pairing only).
const OPPOSITE_GENDER: Partial<Record<GenderType, GenderType>> = {
  male: "female",
  female: "male",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fisher-Yates in-place shuffle — avoids sort(() => Math.random() - 0.5) bias. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** ISO date string in YYYY-MM-DD for drop_date comparison. */
function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Supabase client factory ───────────────────────────────────────────────────

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

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchUserProfile(
  db: SupabaseClient,
  userId: string,
): Promise<UserProfile> {
  const { data, error } = await db
    .from("users")
    .select(
      "id, gender, location_tier, languages, religion, strict_religious_alignment, is_active",
    )
    .eq("id", userId)
    .single<UserProfile>();

  if (error || !data) {
    throw Object.assign(
      new Error(`User profile not found for id ${userId}`),
      { code: "USER_NOT_FOUND", status: 404 },
    );
  }

  if (!data.is_active) {
    throw Object.assign(
      new Error("User account is inactive"),
      { code: "ACCOUNT_INACTIVE", status: 403 },
    );
  }

  return data;
}

/**
 * Returns all candidate IDs this user should never see again:
 * - Everyone in daily_drops history (regardless of action or date)
 * - Everyone in matches_and_chats (mutual or pending)
 * - The user themselves
 */
async function fetchExcludedIds(
  db: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const excluded = new Set<string>([userId]);

  // All prior drop candidates (any date, any action)
  const { data: drops, error: dropsErr } = await db
    .from("daily_drops")
    .select("candidate_id")
    .eq("user_id", userId);

  if (dropsErr) throw Object.assign(dropsErr, { code: "DB_DROPS_READ" });
  drops?.forEach((d: { candidate_id: string }) => excluded.add(d.candidate_id));

  // All match records (canonical ordering means we check both columns)
  const [{ data: asUser1, error: e1 }, { data: asUser2, error: e2 }] =
    await Promise.all([
      db.from("matches_and_chats").select("user_id_2").eq("user_id_1", userId),
      db.from("matches_and_chats").select("user_id_1").eq("user_id_2", userId),
    ]);

  if (e1) throw Object.assign(e1, { code: "DB_MATCH_READ" });
  if (e2) throw Object.assign(e2, { code: "DB_MATCH_READ" });

  asUser1?.forEach((r: { user_id_2: string }) => excluded.add(r.user_id_2));
  asUser2?.forEach((r: { user_id_1: string }) => excluded.add(r.user_id_1));

  return excluded;
}

/**
 * Fetches today's existing drop rows so the function is idempotent.
 * Returns null if no drops exist yet for today.
 */
async function fetchExistingDropsToday(
  db: SupabaseClient,
  userId: string,
): Promise<DailyDropRow[] | null> {
  const { data, error } = await db
    .from("daily_drops")
    .select("*")
    .eq("user_id", userId)
    .eq("drop_date", todayISO())
    .order("grid_position");

  if (error) throw Object.assign(error, { code: "DB_DROPS_READ" });
  return data?.length === DROP_GRID_SIZE ? (data as DailyDropRow[]) : null;
}

// ── Candidate query ───────────────────────────────────────────────────────────

interface CandidateQueryOpts {
  oppositeGender: GenderType | undefined;
  religion: ReligionType | null;
  strictReligion: boolean;
  locationTier: LocationTierType | null; // null = no location filter
  excludedIds: Set<string>;
}

/**
 * Queries active_discovery_pool with the given filter set.
 * Returns up to `limit` candidates, ordered randomly.
 */
async function queryCandidates(
  db: SupabaseClient,
  opts: CandidateQueryOpts,
  limit: number,
): Promise<DiscoveryCandidate[]> {
  const excluded = [...opts.excludedIds];

  let query = db
    .from("active_discovery_pool")
    .select("*");

  // Opposite gender filter
  if (opts.oppositeGender) {
    query = query.eq("gender", opts.oppositeGender);
  }

  // Strict religious alignment — db trigger also enforces this on INSERT,
  // but we filter here to avoid wasted writes to daily_drops.
  if (opts.strictReligion && opts.religion) {
    query = query.eq("religion", opts.religion);
  }

  // Location tier priority
  if (opts.locationTier) {
    query = query.eq("location_tier", opts.locationTier);
  }

  // Exclusion list — Supabase PostgREST .not().in() requires a non-empty array
  if (excluded.length > 0) {
    query = query.not("id", "in", `(${excluded.join(",")})`);
  }

  // Fetch a generous pool to allow client-side shuffle; trim to limit after
  query = query.limit(limit * 5);

  const { data, error } = await query.returns<DiscoveryCandidate[]>();
  if (error) throw Object.assign(error, { code: "DB_CANDIDATES_READ" });

  return data ?? [];
}

// ── Core drop generation ──────────────────────────────────────────────────────

interface DropGenerationResult {
  candidates: DiscoveryCandidate[];
  locationBroadened: boolean;
}

/**
 * Fills the 10-slot grid using a two-phase strategy:
 *
 * Phase 1 — Narrow: same location_tier + all active filters.
 * Phase 2 — Broadened: all location tiers + all active filters.
 *   (strict religious filter is ALWAYS preserved if toggled on)
 *
 * If even the broadened pool is < 10, we serve however many
 * candidates are available (min 1) rather than failing.
 */
async function generateCandidates(
  db: SupabaseClient,
  profile: UserProfile,
  excludedIds: Set<string>,
): Promise<DropGenerationResult> {
  const oppositeGender = OPPOSITE_GENDER[profile.gender];

  const baseOpts: CandidateQueryOpts = {
    oppositeGender,
    religion: profile.religion,
    strictReligion: profile.strict_religious_alignment,
    locationTier: profile.location_tier,
    excludedIds,
  };

  // Phase 1: narrow (same location tier)
  let pool = await queryCandidates(db, baseOpts, DROP_GRID_SIZE);

  if (pool.length >= DROP_GRID_SIZE) {
    return {
      candidates: shuffle(pool).slice(0, DROP_GRID_SIZE),
      locationBroadened: false,
    };
  }

  // Phase 2: broaden location scope (remove tier constraint)
  const broadOpts: CandidateQueryOpts = { ...baseOpts, locationTier: null };
  const broadPool = await queryCandidates(db, broadOpts, DROP_GRID_SIZE);

  // Merge: keep narrow results + fill from broad, deduplicating by id
  const seenInNarrow = new Set(pool.map((c) => c.id));
  const additions = broadPool.filter((c) => !seenInNarrow.has(c.id));
  pool = [...pool, ...additions];

  const final = shuffle(pool).slice(0, DROP_GRID_SIZE);

  return {
    candidates: final,
    locationBroadened: true,
  };
}

// ── Drop persistence ──────────────────────────────────────────────────────────

async function persistDrops(
  db: SupabaseClient,
  userId: string,
  candidates: DiscoveryCandidate[],
): Promise<void> {
  const now = new Date().toISOString();
  const dropDate = todayISO();

  const rows: DailyDropInsert[] = candidates.map((candidate, index) => ({
    user_id: userId,
    candidate_id: candidate.id,
    grid_position: index + 1, // 1-indexed to match schema CHECK constraint
    refresh_timestamp: now,
    drop_date: dropDate,
  }));

  const { error } = await db.from("daily_drops").insert(rows);

  if (error) {
    // Unique constraint violation means a concurrent request already
    // inserted today's drops — treat as success.
    if (error.code === "23505") return;
    throw Object.assign(error, { code: "DB_DROP_INSERT" });
  }
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
  const db = makeServiceClient();

  try {
    // ── 1. Authenticate ────────────────────────────────────────────────────
    const userId = await resolveUserId(req, anonClient);

    // ── 2. Idempotency check — return existing grid if already generated ───
    const existingDrops = await fetchExistingDropsToday(db, userId);
    if (existingDrops) {
      // Fetch the full candidate profiles for the existing drops
      const candidateIds = existingDrops.map((d) => d.candidate_id);
      const { data: existingCandidates, error: candErr } = await db
        .from("active_discovery_pool")
        .select("*")
        .in("id", candidateIds)
        .returns<DiscoveryCandidate[]>();

      if (candErr) throw Object.assign(candErr, { code: "DB_CANDIDATES_READ" });

      // Re-order by grid_position
      const orderedMap = new Map(
        existingDrops.map((d) => [d.candidate_id, d.grid_position]),
      );
      const ordered = (existingCandidates ?? []).sort(
        (a, b) => (orderedMap.get(a.id) ?? 0) - (orderedMap.get(b.id) ?? 0),
      );

      return jsonResponse<GenerateDropSuccess>({
        status: "existing",
        drop_date: todayISO(),
        count: ordered.length,
        candidates: ordered,
        meta: {
          location_broadened: false,
          religion_strict: false,
          generated_at: existingDrops[0].refresh_timestamp,
        },
      });
    }

    // ── 3. Load requesting user's profile ──────────────────────────────────
    const profile = await fetchUserProfile(db, userId);

    // ── 4. Build exclusion set ─────────────────────────────────────────────
    const excludedIds = await fetchExcludedIds(db, userId);

    // ── 5. Generate 10 candidates ──────────────────────────────────────────
    const { candidates, locationBroadened } = await generateCandidates(
      db,
      profile,
      excludedIds,
    );

    if (candidates.length === 0) {
      return jsonResponse<ApiError>(
        {
          error: "No eligible candidates found",
          code: "NO_CANDIDATES",
          details: profile.strict_religious_alignment
            ? `Strict religious alignment (${profile.religion}) is active and no matching profiles exist.`
            : "The discovery pool is currently empty for your filters.",
        },
        404,
      );
    }

    // ── 6. Persist to daily_drops ──────────────────────────────────────────
    await persistDrops(db, userId, candidates);

    // ── 7. Return grid ─────────────────────────────────────────────────────
    return jsonResponse<GenerateDropSuccess>({
      status: "generated",
      drop_date: todayISO(),
      count: candidates.length,
      candidates,
      meta: {
        location_broadened: locationBroadened,
        religion_strict: profile.strict_religious_alignment,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err: unknown) {
    const e = err as Error & { code?: string; status?: number; details?: string };

    const status = e.status ?? 500;
    const code = e.code ?? "INTERNAL_ERROR";

    console.error(`[generate-daily-drop] ${code}:`, e.message, e.details ?? "");

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
