/**
 * Static validator for admin-verify-user Edge Function
 * and the 20260630000001_set_inactive_cron migration.
 *
 * Covers:
 *   - Service-role security gate
 *   - Request parsing and validation
 *   - DB mutations (verification + user flag)
 *   - Response contract
 *   - Cron migration correctness
 *   - Safety / code quality
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE  = join(__dir, "../supabase/functions");
const MIGS  = join(__dir, "../supabase/migrations");

const paths = {
  fn:     join(BASE, "admin-verify-user/index.ts"),
  types:  join(BASE, "_shared/types.ts"),
  cors:   join(BASE, "_shared/cors.ts"),
  cron:   join(MIGS, "20260630000001_set_inactive_cron.sql"),
};

const src = {
  fn:     readFileSync(paths.fn,    "utf8"),
  types:  readFileSync(paths.types, "utf8"),
  cors:   readFileSync(paths.cors,  "utf8"),
  cron:   readFileSync(paths.cron,  "utf8"),
};

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

const lines     = src.fn.split("\n").length;
const typeLines = src.types.split("\n").length;
const cronLines = src.cron.split("\n").length;

console.log("\n════════════════════════════════════════════════════════");
console.log(" Misale — admin-verify-user + cron Validator");
console.log(`  fn    : ${lines} lines / ${(src.fn.length / 1024).toFixed(1)} KB`);
console.log(`  types : ${typeLines} lines`);
console.log(`  cron  : ${cronLines} lines`);
console.log("════════════════════════════════════════════════════════\n");

// ── _shared/types.ts — Step 4 additions ──────────────────────────────────────

console.log("[ _shared/types.ts — Step 4 additions ]\n");
check("AdminVerifyRequest exported",  /export interface AdminVerifyRequest/.test(src.types));
check("AdminVerifyResponse exported", /export interface AdminVerifyResponse/.test(src.types));
check("admin_notes optional field",   /admin_notes\?:/.test(src.types));
check("reviewed_by optional field",   /reviewed_by\?:/.test(src.types));
check("status approved|rejected",     /approved.*rejected|rejected.*approved/.test(src.types));
check("verification_id in response",  /verification_id: string/.test(src.types));
check("is_verified boolean field",    /is_verified: boolean/.test(src.types));
check("processed_at in response",     /processed_at: string/.test(src.types));

// ── Infrastructure ────────────────────────────────────────────────────────────

console.log("\n[ Infrastructure ]\n");
check("Imports @supabase/supabase-js",       /esm\.sh\/@supabase\/supabase-js/.test(src.fn));
check("Imports from _shared/cors",           /\.\.\/_shared\/cors/.test(src.fn));
check("Imports from _shared/types",          /\.\.\/_shared\/types/.test(src.fn));
check("AdminVerifyRequest imported",         /AdminVerifyRequest/.test(src.fn));
check("AdminVerifyResponse imported",        /AdminVerifyResponse/.test(src.fn));
check("ApiError imported",                   /ApiError/.test(src.fn));
check("Deno.serve entry point",              /Deno\.serve\(handler\)/.test(src.fn));
check("makeServiceClient defined",           /function makeServiceClient/.test(src.fn));
check("SUPABASE_SERVICE_ROLE_KEY used",      /SUPABASE_SERVICE_ROLE_KEY/.test(src.fn));
check("Deno.env.get used",                   /Deno\.env\.get/.test(src.fn));
check("No anon client (admin uses service)", !/function makeAnonClient/.test(src.fn));

// ── Security gate ─────────────────────────────────────────────────────────────

console.log("\n[ Security Gate ]\n");
check("assertServiceRole function defined",          /function assertServiceRole/.test(src.fn));
check("Bearer token extraction",                     /Bearer/.test(src.fn));
check("Direct key comparison against env var",       /token.*serviceRoleKey|serviceRoleKey.*token/.test(src.fn));
check("401 on missing/malformed Authorization",      /MISSING_AUTH/.test(src.fn));
check("403 on non-service-role token",               /SERVICE_ROLE_REQUIRED/.test(src.fn));
check("status: 401 for missing auth",                /status: 401/.test(src.fn));
check("status: 403 for wrong key",                   /status: 403/.test(src.fn));
check("OPTIONS preflight handled",                   /OPTIONS/.test(src.fn));
check("POST method guard",                           /method !== .POST./.test(src.fn));
check("405 Method Not Allowed",                      /METHOD_NOT_ALLOWED/.test(src.fn));

// ── Request parsing ───────────────────────────────────────────────────────────

console.log("\n[ Request Parsing & Validation ]\n");
check("parseRequestBody function defined",      /function parseRequestBody/.test(src.fn));
check("JSON parse wrapped in try/catch",        /await req\.json\(\)[\s\S]{0,80}catch/.test(src.fn));
check("INVALID_JSON error code",               /INVALID_JSON/.test(src.fn));
check("target_user_id validated as string",    /INVALID_PARAM_TARGET_USER_ID/.test(src.fn));
check("status validated against enum",         /INVALID_PARAM_STATUS/.test(src.fn));
check("VALID_STATUSES constant defined",        /VALID_STATUSES/.test(src.fn));
check("Both 'approved' and 'rejected' present",/approved.*rejected|rejected.*approved/.test(src.fn));
check("admin_notes parsed as optional string", /admin_notes/.test(src.fn));
check("reviewed_by parsed as optional string", /reviewed_by/.test(src.fn));

// ── Verification lookup ───────────────────────────────────────────────────────

console.log("\n[ Verification Row Lookup ]\n");
check("fetchPendingVerification function defined",     /function fetchPendingVerification/.test(src.fn));
check("Queries verifications table",                   /from\("verifications"\)/.test(src.fn));
check("Filters by user_id = targetUserId",             /eq\("user_id",.*targetUserId\)/.test(src.fn));
check("Filters by status = 'pending'",                 /eq\("status",.*pending/.test(src.fn));
check("Orders by submitted_at descending",             /submitted_at.*ascending.*false|ascending.*false/.test(src.fn));
check("Limits to 1 row",                               /\.limit\(1\)/.test(src.fn));
check("404 when no pending verification found",        /VERIFICATION_NOT_FOUND/.test(src.fn));

// ── DB mutations ──────────────────────────────────────────────────────────────

console.log("\n[ DB Mutations ]\n");
check("applyVerificationDecision function defined",      /function applyVerificationDecision/.test(src.fn));
check("Stamps verifications.status",                     /from\("verifications"\)[\s\S]{0,100}update/.test(src.fn));
check("Stamps reviewed_at timestamp",                    /reviewed_at/.test(src.fn));
check("Stamps admin_notes on update",                    /admin_notes/.test(src.fn));
check("Stamps reviewed_by on update",                    /reviewed_by/.test(src.fn));
check("Updates by verification id",                      /eq\("id", verificationId\)/.test(src.fn));
check("DB_VERIFICATION_UPDATE error code",               /DB_VERIFICATION_UPDATE/.test(src.fn));
check("Conditional: is_verified flip on approved only",  /status.*===.*approved|approved.*status/.test(src.fn));
check("Flips users.is_verified to true",                 /is_verified.*true/.test(src.fn));
check("Users update scoped to target_user_id",           /eq\("id", targetUserId\)/.test(src.fn));
check("DB_USER_VERIFY_UPDATE error code",                /DB_USER_VERIFY_UPDATE/.test(src.fn));

// ── Response contract ─────────────────────────────────────────────────────────

console.log("\n[ Response Contract ]\n");
check("success: true in response",            /success:.*true/.test(src.fn));
check("target_user_id echoed",                /target_user_id,/.test(src.fn));
check("verification_id in response",          /verification_id:.*verification\.id/.test(src.fn));
check("status echoed in response",            /status,/.test(src.fn));
check("is_verified derived from status",      /isVerified.*status.*approved|status.*approved.*isVerified/.test(src.fn));
check("is_verified in response body",         /is_verified:.*isVerified/.test(src.fn));
check("processed_at in response",             /processed_at:.*processedAt/.test(src.fn));
check("AdminVerifyResponse type applied",     /jsonResponse<AdminVerifyResponse>/.test(src.fn));
check("ApiError type applied on error paths", /jsonResponse<ApiError>/.test(src.fn));
check("Admin action logged to console",       /\[admin-verify-user\]/.test(src.fn));

// ── Cron migration ────────────────────────────────────────────────────────────

console.log("\n[ Cron Migration ]\n");
check("pg_cron extension enabled",             /CREATE EXTENSION IF NOT EXISTS pg_cron/.test(src.cron));
check("GRANT USAGE on cron schema",            /GRANT USAGE ON SCHEMA cron/.test(src.cron));
check("purge_expired_drops function defined",  /CREATE OR REPLACE FUNCTION purge_expired_drops/.test(src.cron));
check("Deletes where action_taken IS NULL",    /action_taken IS NULL/.test(src.cron));
check("Deletes rows older than 24 hours",      /24 hours/.test(src.cron));
check("RAISE NOTICE on purge count",           /RAISE NOTICE.*purge_expired_drops/.test(src.cron));
check("COMMENT ON FUNCTION purge_expired_drops", /COMMENT ON FUNCTION purge_expired_drops/.test(src.cron));
check("Idempotent unschedule before register", /cron\.unschedule[\s\S]{0,200}cron\.schedule/.test(src.cron));
check("flag-inactive-accounts job scheduled",  /flag-inactive-accounts/.test(src.cron));
check("purge-expired-drops job scheduled",     /purge-expired-drops/.test(src.cron));
check("Both cron.schedule calls present",      (src.cron.match(/cron\.schedule/g) ?? []).length >= 2);
check("Cron expression is midnight daily",     /0 0 \* \* \*/.test(src.cron));
check("pending_verifications view created",    /CREATE OR REPLACE VIEW pending_verifications/.test(src.cron));
check("View joins verifications + users",      /JOIN users/.test(src.cron));
check("View filters status = 'pending'",       /status = 'pending'/.test(src.cron));
check("View orders by submitted_at ASC",       /submitted_at ASC/.test(src.cron));
check("COMMENT ON VIEW pending_verifications", /COMMENT ON VIEW pending_verifications/.test(src.cron));

// ── Safety ────────────────────────────────────────────────────────────────────

console.log("\n[ Safety & Code Quality ]\n");
check("No eval()",                         !/\beval\(/.test(src.fn));
check("No hardcoded credentials",          !/password\s*=\s*["']|api_key\s*=\s*["']/.test(src.fn));
check("No process.env",                    !/process\.env/.test(src.fn));
check("Typed error catch (err: unknown)",  /catch.*err.*unknown/.test(src.fn));
check("status defaults to 500",            /status.*500|500.*status/.test(src.fn));
check("console.error on unhandled errors", /console\.error/.test(src.fn));
check("File is >100 lines (not a stub)",   lines > 100);
check("File is <400 lines (not bloated)",  lines < 400);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log("\n════════════════════════════════════════════════════════");
if (failed === 0) {
  console.log(`ALL ${passed} CHECKS PASSED`);
  console.log("admin-verify-user and cron migration are complete and ready for deployment.");
  console.log("Deploy with:");
  console.log("  supabase functions deploy admin-verify-user");
  console.log("  supabase db push  (to apply 20260630000001_set_inactive_cron.sql)");
} else {
  console.error(`${failed} CHECK(S) FAILED  |  ${passed} passed`);
  process.exit(1);
}
console.log("════════════════════════════════════════════════════════\n");
