/**
 * SQL migration validator — static analysis only (no live DB required).
 * Checks structural completeness of the migration file.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(__dir, '../supabase/migrations/20260101000000_initial_schema.sql');

const sql = readFileSync(MIGRATION, 'utf8');
const lines = sql.split('\n');

const REQUIRED_PATTERNS = [
    { label: 'CREATE TABLE users',             re: /CREATE TABLE users\b/ },
    { label: 'CREATE TABLE daily_drops',       re: /CREATE TABLE daily_drops\b/ },
    { label: 'CREATE TABLE matches_and_chats', re: /CREATE TABLE matches_and_chats\b/ },
    { label: 'CREATE TABLE verifications',     re: /CREATE TABLE verifications\b/ },
    { label: 'FOREIGN KEY: daily_drops -> users (user_id)',      re: /user_id.*REFERENCES users/ },
    { label: 'FOREIGN KEY: daily_drops -> users (candidate_id)', re: /candidate_id.*REFERENCES users/ },
    { label: 'FOREIGN KEY: matches -> users (user_id_1)',         re: /user_id_1.*REFERENCES users/ },
    { label: 'FOREIGN KEY: verifications -> users',               re: /verifications[\s\S]{0,300}REFERENCES users/ },
    { label: 'CHECK grid_position 1-10',        re: /grid_position.*BETWEEN 1 AND 10/ },
    { label: 'UNIQUE drop per slot per day',    re: /UNIQUE.*user_id.*drop_date.*grid_position/ },
    { label: 'Canonical pair order constraint', re: /user_id_1 < user_id_2/ },
    { label: 'Age minimum CHECK (18)',          re: /AGE\(date_of_birth\).*>=.*18/ },
    { label: 'Languages array constraint',      re: /languages.*<@.*ARRAY/ },
    { label: 'No self-drop constraint',         re: /user_id.*<>.*candidate_id/ },
    { label: 'Religious alignment FUNCTION',    re: /FUNCTION enforce_religious_alignment/ },
    { label: 'Religious alignment TRIGGER',     re: /TRIGGER trg_enforce_religious_alignment/ },
    { label: 'flag_inactive_accounts FUNCTION', re: /FUNCTION flag_inactive_accounts/ },
    { label: 'reactivate_user FUNCTION',        re: /FUNCTION reactivate_user/ },
    { label: 'set_updated_at FUNCTION',         re: /FUNCTION set_updated_at/ },
    { label: 'RLS enabled: users',              re: /ALTER TABLE users.*ENABLE ROW LEVEL SECURITY/ },
    { label: 'RLS enabled: daily_drops',        re: /ALTER TABLE daily_drops.*ENABLE ROW LEVEL SECURITY/ },
    { label: 'RLS enabled: matches_and_chats',  re: /ALTER TABLE matches_and_chats.*ENABLE ROW LEVEL SECURITY/ },
    { label: 'RLS enabled: verifications',      re: /ALTER TABLE verifications.*ENABLE ROW LEVEL SECURITY/ },
    { label: 'INDEX on religion',               re: /idx_users_religion/ },
    { label: 'INDEX on location_tier',          re: /idx_users_location_tier/ },
    { label: 'INDEX on languages (GIN)',        re: /idx_users_languages_gin/ },
    { label: 'active_discovery_pool VIEW',      re: /CREATE VIEW active_discovery_pool/ },
];

const FORBIDDEN_PATTERNS = [
    { label: 'No bare DROP TABLE (destructive)',  re: /^\s*DROP TABLE(?!\s+IF EXISTS)/m },
    { label: 'No TRUNCATE statements',            re: /^\s*TRUNCATE/m },
    { label: 'No placeholder TODOs left unfilled', re: /TODO|FIXME|PLACEHOLDER/i },
];

let passed = 0;
let failed = 0;

console.log('\n================================================');
console.log(' Misale SQL Migration Validator');
console.log(`  File: supabase/migrations/20260101000000_initial_schema.sql`);
console.log(`  Size: ${lines.length} lines / ${(sql.length / 1024).toFixed(1)} KB`);
console.log('================================================\n');

console.log('[ REQUIRED PATTERNS ]\n');
for (const { label, re } of REQUIRED_PATTERNS) {
    if (re.test(sql)) {
        console.log(`  PASS  ${label}`);
        passed++;
    } else {
        console.error(`  FAIL  MISSING: ${label}`);
        failed++;
    }
}

console.log('\n[ FORBIDDEN PATTERNS ]\n');
for (const { label, re } of FORBIDDEN_PATTERNS) {
    if (re.test(sql)) {
        console.error(`  FAIL  FOUND (should not exist): ${label}`);
        failed++;
    } else {
        console.log(`  PASS  Clean: ${label}`);
        passed++;
    }
}

const tableCount = (sql.match(/CREATE TABLE\b/g) || []).length;
const semicolonCount = (sql.match(/;/g) || []).length;

console.log('\n[ STRUCTURE COUNTS ]\n');
console.log(`  CREATE TABLE statements : ${tableCount}  (expected 4)`);
console.log(`  Statement terminators   : ${semicolonCount}`);
console.log(`  Total lines             : ${lines.length}`);

if (tableCount !== 4) {
    console.error(`\n  FAIL  Expected 4 CREATE TABLE statements, found ${tableCount}`);
    failed++;
} else {
    console.log('\n  PASS  Correct number of tables');
    passed++;
}

console.log('\n================================================');
if (failed === 0) {
    console.log(`ALL ${passed} CHECKS PASSED - migration is structurally valid.`);
    console.log('Ready to apply with: supabase db push');
} else {
    console.error(`${failed} CHECK(S) FAILED  |  ${passed} passed`);
    console.error('Fix the issues above before applying the migration.');
    process.exit(1);
}
console.log('================================================\n');
