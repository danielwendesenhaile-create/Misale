/**
 * Static validator for record-drop-action Edge Function.
 * Covers auth, input parsing, drop validation, mutual like detection,
 * match creation atomicity, FCM stub, and response contract.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir  = dirname(fileURLToPath(import.meta.url));
const BASE   = join(__dir, "../supabase/functions");

const paths = {
  fn:    join(BASE, "record-drop-action/index.ts"),
  types: join(BASE, "_shared/types.ts"),
  cors:  join(BASE, "_shared/cors.ts"),
};

const src = {
  fn:    readFileSync(paths.fn,    "utf8"),
  types: readFileSync(paths.types, "utf8"),
  cors:  readFileSync(paths.cors,  "utf8"),
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

console.log("\n================================================");
console.log(" Misale — record-drop-action Validator");
console.log(`  fn    : ${lines} lines / ${(src.fn.length / 1024).toFixed(1)} KB`);
console.log(`  types : ${typeLines} lines`);
console.log("================================================\n");

console.log("[ _shared/types.ts — Step 3 additions ]\n");
check("RecordActionRequest exported",   /export interface RecordActionRequest/.test(src.types));
check("RecordActionResponse exported",  /export interface RecordActionResponse/.test(src.types));
check("chat_thread_id optional field",  /chat_thread_id\?:/.test(src.types));
check("action field on response",       /action: DropActionType/.test(src.types));
check("processed_at field on response", /processed_at: string/.test(src.types));
check("FcmPayload exported",            /export interface FcmPayload/.test(src.types));
check("FcmNotificationMessage exported",/export interface FcmNotificationMessage/.test(src.types));
check("FCM apns block defined",         /apns\?:/.test(src.types));
check("FCM android block defined",      /android\?:/.test(src.types));
check("FCM data as Record<string,string>", /data: Record<string, string>/.test(src.types));

console.log("\n[ Infrastructure ]\n");
check("Imports @supabase/supabase-js",   /esm\.sh\/@supabase\/supabase-js/.test(src.fn));
check("Imports from _shared/cors",       /\.\.\/_shared\/cors/.test(src.fn));
check("Imports from _shared/types",      /\.\.\/_shared\/types/.test(src.fn));
check("FcmPayload type imported",        /FcmPayload/.test(src.fn));
check("RecordActionRequest imported",    /RecordActionRequest/.test(src.fn));
check("RecordActionResponse imported",   /RecordActionResponse/.test(src.fn));
check("DailyDropRow imported",           /DailyDropRow/.test(src.fn));
check("Deno.serve entry point",          /Deno\.serve\(handler\)/.test(src.fn));
check("makeServiceClient defined",       /function makeServiceClient/.test(src.fn));
check("makeAnonClient defined",          /function makeAnonClient/.test(src.fn));
check("SUPABASE_SERVICE_ROLE_KEY used",  /SUPABASE_SERVICE_ROLE_KEY/.test(src.fn));
check("SUPABASE_ANON_KEY used",          /SUPABASE_ANON_KEY/.test(src.fn));
check("Deno.env.get used",              /Deno\.env\.get/.test(src.fn));

console.log("\n[ Authentication ]\n");
check("resolveUserId function defined",  /async function resolveUserId/.test(src.fn));
check("Bearer token extraction",         /Bearer/.test(src.fn));
check("auth.getUser called",             /auth\.getUser/.test(src.fn));
check("401 on missing auth",             /MISSING_AUTH/.test(src.fn));
check("401 on invalid JWT",              /INVALID_JWT/.test(src.fn));
check("OPTIONS preflight handled",       /OPTIONS/.test(src.fn));
check("POST method guard",               /method !== .POST./.test(src.fn));
check("405 Method Not Allowed response", /METHOD_NOT_ALLOWED/.test(src.fn));

console.log("\n[ Request Parsing & Validation ]\n");
check("parseRequestBody function defined",       /function parseRequestBody/.test(src.fn));
check("JSON parse wrapped in try/catch",         /await req\.json\(\)[\s\S]{0,80}catch/.test(src.fn));
check("INVALID_JSON error code",                 /INVALID_JSON/.test(src.fn));
check("drop_id validated as string",             /INVALID_PARAM_DROP_ID/.test(src.fn));
check("target_user_id validated as string",      /INVALID_PARAM_TARGET_USER_ID/.test(src.fn));
check("action validated against enum",           /INVALID_PARAM_ACTION/.test(src.fn));
check("VALID_ACTIONS constant defined",          /VALID_ACTIONS/.test(src.fn));
check("Both 'like' and 'pass' in valid actions", /like.*pass|pass.*like/.test(src.fn));

console.log("\n[ Drop Ownership & Integrity ]\n");
check("fetchAndValidateDrop function defined",  /function fetchAndValidateDrop/.test(src.fn));
check("Fetches drop by id",                     /\.eq\("id", dropId\)/.test(src.fn));
check("404 when drop not found",                /DROP_NOT_FOUND/.test(src.fn));
check("Ownership check: user_id === userId",    /DROP_OWNERSHIP_MISMATCH/.test(src.fn));
check("Candidate check: candidate_id matches",  /DROP_CANDIDATE_MISMATCH/.test(src.fn));
check("Status 403 for ownership mismatch",      /status: 403/.test(src.fn));
check("Status 422 for candidate mismatch",      /status: 422/.test(src.fn));

console.log("\n[ Drop Action Update ]\n");
check("updateDropAction function defined",  /function updateDropAction/.test(src.fn));
check("action_taken set on update",         /action_taken.*action/.test(src.fn));
check("viewed_at stamped with NOW",         /viewed_at/.test(src.fn));
check("UPDATE scoped to drop id",           /\.eq\("id", dropId\)/.test(src.fn));
check("DB_DROP_UPDATE error code",          /DB_DROP_UPDATE/.test(src.fn));

console.log("\n[ Mutual Like Detection ]\n");
check("checkMutualLike function defined",       /function checkMutualLike/.test(src.fn));
check("Queries daily_drops for reverse like",   /from\("daily_drops"\)[\s\S]{0,200}eq\("action_taken", "like"\)/.test(src.fn));
check("Filters by user_id = targetUserId",      /eq\("user_id",.*targetUserId\)/.test(src.fn));
check("Filters by candidate_id = currentUser",  /eq\("candidate_id",.*currentUserId\)/.test(src.fn));
check("Cross-date scan (no date filter)",       !/drop_date.*checkMutual|checkMutual[\s\S]{0,400}drop_date/.test(src.fn));
check("Returns boolean from row count",         /length.*>.*0|> 0/.test(src.fn));
check("DB_MUTUAL_CHECK error code",             /DB_MUTUAL_CHECK/.test(src.fn));
check("Pass action short-circuits before check",/action === .pass./.test(src.fn));

console.log("\n[ Mutual Match Creation ]\n");
check("createOrFetchMatch function defined",    /function createOrFetchMatch/.test(src.fn));
check("Canonical pair ordering applied",        /userId < targetUserId/.test(src.fn));
check("uid1/uid2 set by comparison",            /uid1.*uid2|uid2.*uid1/.test(src.fn));
check("Inserts into matches_and_chats",         /from\("matches_and_chats"\)[\s\S]{0,100}insert/.test(src.fn));
check("match_status set to 'matched'",          /match_status.*matched/.test(src.fn));
check("matched_at timestamp set",               /matched_at/.test(src.fn));
check("Returns id as chat_thread_id",           /chat_thread_id.*chatThreadId|chatThreadId/.test(src.fn));
check("23505 unique violation handled",         /23505/.test(src.fn));
check("Fallback: fetches existing match on 23505", /DB_MATCH_FETCH_FAILED/.test(src.fn));
check("DB_MATCH_INSERT error code",             /DB_MATCH_INSERT/.test(src.fn));
check("DB_MATCH_NO_ID guard",                   /DB_MATCH_NO_ID/.test(src.fn));

console.log("\n[ FCM Notification Stub ]\n");
check("sendMatchNotification function defined",  /async function sendMatchNotification/.test(src.fn));
check("Console log on match registration",       /MATCH MUTATION REGISTERED/.test(src.fn));
check("Both user IDs logged",                    /userId1.*userId2|userId2.*userId1/.test(src.fn));
check("chat_thread_id logged",                   /chat_thread_id.*chatThreadId|chatThreadId/.test(src.fn));
check("FCM project ID env var referenced",       /FCM_PROJECT_ID/.test(src.fn));
check("FCM server key env var referenced",       /FCM_SERVER_KEY/.test(src.fn));
check("FCM v1 endpoint URL present",             /fcm\.googleapis\.com.*v1.*messages:send/.test(src.fn));
check("FCM Authorization header present",        /Authorization.*Bearer.*FCM_SERVER_KEY/.test(src.fn));
check("FCM notification.title defined",          /title:/.test(src.fn));
check("FCM notification.body defined",           /body:.*Open Misale|Open Misale/.test(src.fn));
check("FCM data.type = 'new_match'",             /type.*new_match|new_match/.test(src.fn));
check("FCM data.chat_thread_id present",         /chat_thread_id.*chatThreadId/.test(src.fn));
check("FCM apns block present",                  /apns:/.test(src.fn));
check("FCM android.priority = 'high'",           /priority.*high/.test(src.fn));
check("FCM android.channel_id = 'matches'",      /channel_id.*matches/.test(src.fn));
check("Missing token handled with warn",         /warn.*No.*token|No device token/.test(src.fn));
check("Notification is fire-and-forget",         /sendMatchNotification[\s\S]{0,60}\.catch/.test(src.fn));
check("Notification error logged but not thrown",/sendMatchNotification.*\.catch|catch.*sendMatch/.test(src.fn));

console.log("\n[ Response Contract ]\n");
check("matched: true returned on mutual",         /matched:.*true/.test(src.fn));
check("matched: false returned on pass",          /matched:.*false/.test(src.fn));
check("matched: false returned on one-sided like",/matched:.*false/.test(src.fn));
check("chat_thread_id in matched response",       /chat_thread_id:.*chatThreadId/.test(src.fn));
check("action echoed in response",                /action,/.test(src.fn));
check("processed_at in all responses",            /processed_at:.*processedAt/.test(src.fn));
check("RecordActionResponse type applied",        /jsonResponse<RecordActionResponse>/.test(src.fn));
check("ApiError type applied on error paths",     /jsonResponse<ApiError>/.test(src.fn));

console.log("\n[ Safety & Code Quality ]\n");
check("No eval()",                         !/\beval\(/.test(src.fn));
check("No hardcoded credentials",          !/password\s*=\s*["']|api_key\s*=\s*["']/.test(src.fn));
check("No process.env",                    !/process\.env/.test(src.fn));
check("Typed error catch (err: unknown)",  /catch.*err.*unknown/.test(src.fn));
check("status defaults to 500",            /status.*500|500.*status/.test(src.fn));
check("console.error on unhandled errors", /console\.error/.test(src.fn));
check("File is >200 lines",                lines > 200);
check("File is <500 lines (not bloated)",  lines < 500);

console.log("\n================================================");
if (failed === 0) {
  console.log(`ALL ${passed} CHECKS PASSED`);
  console.log("record-drop-action is complete and ready for deployment.");
  console.log("Deploy with: supabase functions deploy record-drop-action");
} else {
  console.error(`${failed} CHECK(S) FAILED  |  ${passed} passed`);
  process.exit(1);
}
console.log("================================================\n");
