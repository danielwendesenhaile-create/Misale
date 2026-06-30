/**
 * Misale MVP Seed Script
 * Populates 50 realistic Ethiopian / Habesha diaspora profiles.
 *
 * Usage:
 *   node src/seed/seed.js              # uses .env
 *   SUPABASE_URL=... node src/seed/seed.js
 *
 * Wipes existing seed rows (phone numbers start with +seed prefix)
 * so re-runs are safe.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ── Supabase client (service role bypasses RLS for seeding) ──────────────────

const supabase = createClient(
    process.env.SUPABASE_URL     || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
    { auth: { persistSession: false } }
);

// ── Static data pools ─────────────────────────────────────────────────────────

const MALE_FIRST_NAMES = [
    'Yohannes', 'Dawit', 'Bereket', 'Mikael', 'Samuel',
    'Girma', 'Haile', 'Abebe', 'Tesfaye', 'Mulugeta',
    'Bekele', 'Eyob', 'Solomon', 'Tewodros', 'Natnael',
    'Henok', 'Biniyam', 'Amanuel', 'Fiker', 'Tsegay',
    'Leul', 'Seyoum', 'Kifle', 'Yared', 'Ermias',
];

const FEMALE_FIRST_NAMES = [
    'Selam', 'Hiwot', 'Tigist', 'Bethlehem', 'Mekdes',
    'Rahel', 'Sara', 'Lidya', 'Eden', 'Hanna',
    'Yeabsira', 'Bezawit', 'Liya', 'Meron', 'Amleset',
    'Beza', 'Nardos', 'Tsehay', 'Ruth', 'Elsa',
    'Yeshi', 'Hirut', 'Azeb', 'Senait', 'Tigist',
];

const LAST_NAMES = [
    'Tesfaye', 'Haile', 'Girma', 'Bekele', 'Alemu',
    'Kebede', 'Worku', 'Tadesse', 'Lemma', 'Gebre',
    'Mekonnen', 'Tekle', 'Mengistu', 'Desta', 'Wolde',
    'Kifle', 'Negash', 'Gashaw', 'Mulat', 'Assefa',
    'Belachew', 'Belete', 'Berhane', 'Chekol', 'Dejene',
];

const RELIGIONS = ['Orthodox', 'Protestant', 'Catholic', 'Muslim'];

const RELIGION_WEIGHTS = [0.55, 0.20, 0.08, 0.17]; // approximate Habesha diaspora distribution

const LOCAL_LOCATIONS = [
    { country: 'Ethiopia', city: 'Addis Ababa' },
    { country: 'Ethiopia', city: 'Dire Dawa' },
    { country: 'Ethiopia', city: 'Bahir Dar' },
    { country: 'Ethiopia', city: 'Hawassa' },
    { country: 'Ethiopia', city: 'Gondar' },
    { country: 'Ethiopia', city: 'Mekelle' },
    { country: 'Ethiopia', city: 'Jimma' },
    { country: 'Ethiopia', city: 'Adama' },
];

const DIASPORA_LOCATIONS = [
    { country: 'United States', city: 'Washington DC' },
    { country: 'United States', city: 'Minneapolis' },
    { country: 'United States', city: 'Dallas' },
    { country: 'United States', city: 'Atlanta' },
    { country: 'Canada',        city: 'Toronto' },
    { country: 'Canada',        city: 'Calgary' },
    { country: 'United Kingdom', city: 'London' },
    { country: 'Sweden',        city: 'Stockholm' },
    { country: 'Norway',        city: 'Oslo' },
    { country: 'UAE',           city: 'Dubai' },
    { country: 'Italy',         city: 'Rome' },
    { country: 'Germany',       city: 'Frankfurt' },
    { country: 'Australia',     city: 'Melbourne' },
];

const BIOS = [
    'Born in Addis, raised between two worlds. Coffee snob, injera loyalist.',
    'Habesha at heart, adventurer by choice. Tizita on shuffle.',
    'Fluent in references and Saturday tej sessions.',
    'Programmer by day, tej house philosopher by night.',
    'Loves timket parades and midnight kitfo runs.',
    'Looking for someone who laughs at the same Amharic jokes.',
    'Medical resident. Ask me about Ethiopian herbal medicine traditions.',
    'Engineer who still calls mom every Sunday after lunch.',
    'Lost without my Ethiopian calendar. Gena Christmas is the real Christmas.',
    'Foodie, hiker, and occasional tej brewer.',
    'Teaching my non-Habesha friends how to eat properly (with injera only).',
    'Second-gen Habesha navigating identity and great food.',
    'Loves debating Haile vs Bekele while watching athletics.',
    'My grandmother says I need to settle down. She may be right.',
    'Coffee ceremony host. My house smells like roasted beans always.',
    'Between Addis and Toronto, my heart is always in both.',
    'Proud of my roots, curious about everything else.',
    'Collector of Ethiopian art and long-distance runner.',
    'Looking for someone to watch Ethiopian film nights with.',
    'Weekend market trips and weekday ambition.',
];

const ETHNICITIES = [
    'Amhara', 'Oromo', 'Tigrinya', 'Gurage', 'Sidama',
    'Wolaita', 'Harari', 'Afar', 'Somali', 'Bench',
];

// ── Utility helpers ───────────────────────────────────────────────────────────

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function pickWeighted(items, weights) {
    const r = Math.random();
    let cumulative = 0;
    for (let i = 0; i < items.length; i++) {
        cumulative += weights[i];
        if (r < cumulative) return items[i];
    }
    return items[items.length - 1];
}

function randomSubset(arr, min = 1, max = arr.length) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    const count = min + Math.floor(Math.random() * (max - min + 1));
    return shuffled.slice(0, count);
}

function randomDate(startYear, endYear) {
    const start = new Date(startYear, 0, 1);
    const end   = new Date(endYear, 11, 31);
    const date  = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return date.toISOString().split('T')[0];
}

function seedPhone(index) {
    return `+seed${String(index).padStart(4, '0')}`;
}

// ── Profile factory ───────────────────────────────────────────────────────────

function generateProfile(index) {
    const isMale          = index % 2 === 0;
    const firstName       = isMale ? pick(MALE_FIRST_NAMES) : pick(FEMALE_FIRST_NAMES);
    const lastName        = pick(LAST_NAMES);
    const fullName        = `${firstName} ${lastName}`;
    const gender          = isMale ? 'male' : 'female';

    const religion        = pickWeighted(RELIGIONS, RELIGION_WEIGHTS);

    const baseLangs       = ['Amharic', 'English'];
    const extraLangs      = Math.random() > 0.6 ? randomSubset(['Oromo', 'Tigrinya'], 0, 1) : [];
    const languages       = [...new Set([...baseLangs, ...extraLangs])];

    // 40% local, 60% diaspora
    const isLocal         = Math.random() < 0.40;
    const locationTier    = isLocal ? 'Local_Ethiopia' : 'Diaspora';
    const location        = isLocal ? pick(LOCAL_LOCATIONS) : pick(DIASPORA_LOCATIONS);

    // Ages 21-38
    const birthYear       = new Date().getFullYear() - 21 - Math.floor(Math.random() * 17);
    const dateOfBirth     = randomDate(birthYear, birthYear);

    const isVerified      = Math.random() < 0.70;

    const daysAgo         = Math.random() < 0.75
        ? Math.floor(Math.random() * 7)
        : Math.floor(Math.random() * 60);
    const lastActiveAt    = new Date(Date.now() - daysAgo * 86400000).toISOString();

    const strictAlignment = Math.random() < 0.10;

    return {
        phone_number:               seedPhone(index),
        phone_verified:             true,
        full_name:                  fullName,
        display_name:               firstName,
        date_of_birth:              dateOfBirth,
        gender,
        bio:                        pick(BIOS),
        profile_photos:             [`https://placeholder.misale.app/avatars/seed-${index}.jpg`],
        languages,
        religion,
        strict_religious_alignment: strictAlignment,
        ethnicity:                  pick(ETHNICITIES),
        location_tier:              locationTier,
        country:                    location.country,
        city:                       location.city,
        is_active:                  daysAgo < 30,
        is_verified:                isVerified,
        last_active_at:             lastActiveAt,
    };
}

// ── Main seed runner ──────────────────────────────────────────────────────────

async function seed() {
    console.log('Misale seed script starting...\n');

    console.log('Removing previous seed profiles...');
    const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .like('phone_number', '+seed%');

    if (deleteError) {
        console.warn('  Could not clean old seed rows:', deleteError.message);
    } else {
        console.log('  Old seed rows removed.\n');
    }

    const profiles = Array.from({ length: 50 }, (_, i) => generateProfile(i + 1));

    const religiousSummary = RELIGIONS.reduce((acc, r) => {
        acc[r] = profiles.filter(p => p.religion === r).length;
        return acc;
    }, {});
    const localCount    = profiles.filter(p => p.location_tier === 'Local_Ethiopia').length;
    const diasporaCount = profiles.filter(p => p.location_tier === 'Diaspora').length;

    console.log('Profile distribution:');
    console.log(`   Religion  : ${JSON.stringify(religiousSummary)}`);
    console.log(`   Location  : Local=${localCount}, Diaspora=${diasporaCount}`);
    console.log(`   Verified  : ${profiles.filter(p => p.is_verified).length}/50`);
    console.log(`   Strict RA : ${profiles.filter(p => p.strict_religious_alignment).length}/50\n`);

    const BATCH = 10;
    let inserted = 0;

    for (let i = 0; i < profiles.length; i += BATCH) {
        const batch = profiles.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('users')
            .insert(batch)
            .select('id, display_name, religion, location_tier, city');

        if (error) {
            console.error(`  Batch ${i / BATCH + 1} failed:`, error.message);
            if (error.details) console.error('     Details:', error.details);
            continue;
        }

        inserted += data.length;
        data.forEach(u => {
            console.log(`  [${String(inserted - data.length + data.indexOf(u) + 1).padStart(2)}] ${u.display_name.padEnd(14)} | ${u.religion.padEnd(12)} | ${u.location_tier} | ${u.city}`);
        });
    }

    console.log(`\nSeed complete: ${inserted}/50 profiles inserted.`);

    if (inserted === 50) {
        console.log('\nDiscovery loop test-ready. All 50 profiles available in the database.');
    } else {
        console.warn('\nSome profiles failed to insert — check errors above.');
    }
}

seed().catch(err => {
    console.error('Fatal seed error:', err);
    process.exit(1);
});
