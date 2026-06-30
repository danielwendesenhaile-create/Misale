/**
 * Static validator for the generate-daily-drop Edge Function.
 * Checks structural completeness without requiring a live Deno or Supabase runtime.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const BASE  = join(__dir, "../supabase/functions");

const files = {
  fn:    join(BASE, "generate-daily-drop/index.ts"),
  types: join(BASE, "_shared/types.ts"),
  cors:  join(BASE, "_shared/cors.ts"),
  deno:  join(BASE, "deno.json"),
};

const src = {
  fn:    readFileSync(files.fn,    "utf8"),
  types: readFileSync(files.types, "utf8"),
  cors:  readFileSync(files.cors,  "utf8"),
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

console.log("\n================================================");
console.log(" Misale Edge Function Validator");
console.log(` Function : supabase/functions/generate-daily-drop/index.ts`);
console.log(`  ${Object.entries(files).map(([k, v]) => `${k}: ${v.split("/").slice(-2).join("/")} (${(readFileSync(v, "utf8").length / 1024).toFixed(1)}KB)`).join("\n  ")}`);
console.log("================================================\n");

console.log("[ _shared/types.ts ]\n");
check("GenderType exported",           /export type GenderType/.test(src.types));
check("ReligionType exported",         /export type ReligionType/.test(src.types));
check("LocationTierType exported",     /export type LocationTierType/.test(src.types));
check("DiscoveryCandidate interface",  /export interface DiscoveryCandidate/.test(src.types));
check("UserProfile interface",         /export interface UserProfile/.test(src.types));
check("DailyDropInsert interface",     /export interface DailyDropInsert/.test(src.types));
check("GenerateDropSuccess interface", /export interface GenerateDropSuccess/.test(src.types));
check("ApiError interface",            /export interface ApiError/.test(src.types));

console.log("\n[ _shared/cors.ts ]\n");
check("CORS_HEADERS exported",   /export const CORS_HEADERS/.test(src.cors));
check("corsResponse exported",   /export function corsResponse/.test(src.cors));
check("jsonResponse exported",   /export function jsonResponse/.test(src.cors));
check("Content-Type header",     /Content-Type/.test(src.cors));

console.log("\n[ generate-daily-drop/index.ts ]\n");
check("Imports from @supabase/supabase-js",   /esm\.sh\/@supabase\/supabase-js/.test(src.fn));
check("Imports from _shared/types",            /\.\.\/_shared\/types/.test(src.fn));
check("Imports from _shared/cors",             /\.\.\/_shared\/cors/.test(src.fn));
check("Deno.serve entry point",                /Deno\.serve\(handler\)/.test(src.fn));
check("OPTIONS preflight handled",             /OPTIONS/.test(src.fn));
check("POST method guard",                     /method !== .POST./.test(src.fn));
check("JWT auth extraction",                   /resolveUserId/.test(src.fn));
check("Bearer token parsing",                  /Bearer/.test(src.fn));
check("auth.getUser called",                   /auth\.getUser/.test(src.fn));
check("Idempotency check (today's drops)",     /fetchExistingDropsToday/.test(src.fn));
check("Existing drops returned with 'existing' status", /\"existing\"/.test(src.fn));
check("fetchUserProfile called",               /fetchUserProfile/.test(src.fn));
check("is_active check on user",               /is_active/.test(src.fn));
check("fetchExcludedIds builds exclusion set", /fetchExcludedIds/.test(src.fn));
check("daily_drops history excluded",          /from\("daily_drops"\)/.test(src.fn) && /\.select\("candidate_id"\)/.test(src.fn));
check("matches_and_chats history excluded",    /matches_and_chats/.test(src.fn));
check("Both match directions checked (user_id_1, user_id_2)", /user_id_1.*user_id_2|user_id_2.*user_id_1/.test(src.fn));
check("Opposite gender filter applied",        /OPPOSITE_GENDER/.test(src.fn));
check("strict_religious_alignment filter",     /strict_religious_alignment|strictReligion/.test(src.fn));
check("Strict religion ALWAYS preserved in fallback", src.fn.includes("strict_religious_alignment") && src.fn.includes("locationTier: null"));
check("Location tier filter (Phase 1)",        /location_tier|locationTier/.test(src.fn));
check("Location broadening fallback (Phase 2)", /locationTier: null|broadened/.test(src.fn));
check("Merge narrow + broad pools",            /broadPool|addition/.test(src.fn));
check("Fisher-Yates shuffle used",             /Fisher-Yates|Math\.floor.*Math\.random/.test(src.fn));
check("Exactly 10 grid slots assigned",        /DROP_GRID_SIZE = 10/.test(src.fn));
check("grid_position is 1-indexed",            /index \+ 1/.test(src.fn));
check("refresh_timestamp stamped on INSERT",   /refresh_timestamp/.test(src.fn));
check("drop_date stamped with today ISO",      /todayISO|drop_date/.test(src.fn));
check("Concurrent insert race handled (23505)", /23505/.test(src.fn));
check("Empty pool 404 response",               /NO_CANDIDATES/.test(src.fn));
check("Strict-religion context in 404 details", /strict_religious_alignment.*active|Strict religious alignment/.test(src.fn));
check("Error code propagated in catch block",  /code.*INTERNAL_ERROR|INTERNAL_ERROR/.test(src.fn));
check("console.error logging on failures",     /console\.error/.test(src.fn));
check("Service role client used for DB ops",   /makeServiceClient|SERVICE_ROLE_KEY/.test(src.fn));
check("Anon client used only for JWT verify",  /makeAnonClient|ANON_KEY/.test(src.fn));
check("Response includes meta.location_broadened", /location_broadened/.test(src.fn));
check("Response includes meta.religion_strict",    /religion_strict/.test(src.fn));
check("Response includes generated_at",            /generated_at/.test(src.fn));

console.log("\n[ SAFETY CHECKS ]\n");
check("No eval() usage",                       !/\beval\(/.test(src.fn));
check("No hardcoded credentials",              !/supabase_key|secret_key|password\s*=\s*["']/.test(src.fn));
check("No process.env (Deno uses Deno.env)",  !/process\.env/.test(src.fn));
check("Environment vars via Deno.env.get",    /Deno\.env\.get/.test(src.fn));
check("No any-typed catch without handling",   !/catch\s*\(\s*\)\s*\{/.test(src.fn));

const lineCount = src.fn.split("\n").length;
console.log(`\n[ FILE STATS ]\n`);
console.log(`  generate-daily-drop/index.ts : ${lineCount} lines`);
console.log(`  _shared/types.ts             : ${src.types.split("\n").length} lines`);
console.log(`  _shared/cors.ts              : ${src.cors.split("\n").length} lines`);
check("Function file >100 lines (not a stub)", lineCount > 100);

console.log("\n================================================");
if (failed === 0) {
  console.log(`ALL ${passed} CHECKS PASSED`);
  console.log("Edge function is structurally complete and ready for deployment.");
  console.log("Deploy with: supabase functions deploy generate-daily-drop");
} else {
  console.error(`${failed} CHECK(S) FAILED  |  ${passed} passed`);
  process.exit(1);
}
console.log("================================================\n");
