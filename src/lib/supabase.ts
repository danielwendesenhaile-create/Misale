import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

// Mobile uses the ANON key — RLS policies govern row-level access.
// The service role key must never be bundled into the mobile client.
const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      ?? "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[Misale] EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is not set. " +
    "Add them to your .env file.",
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // No localStorage on native; sessions are ephemeral until AsyncStorage is wired
    persistSession: Platform.OS !== "web",
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
