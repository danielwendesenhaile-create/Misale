import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

interface ProfileData {
  full_name: string | null;
  phone: string | null;
  gender: string | null;
  religion: string | null;
  languages: string[];
  location_tier: string | null;
  country: string | null;
  city: string | null;
}

interface ProfileScreenProps {
  onSignOut: () => void;
}

export function ProfileScreen({ onSignOut }: ProfileScreenProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user.id) { setLoading(false); return; }

      const { data } = await supabase
        .from("users")
        .select("full_name, phone, gender, religion, languages, location_tier, country, city")
        .eq("id", session.user.id)
        .single();

      setProfile(data as ProfileData | null);
      setLoading(false);
    }
    void load();
  }, []);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    onSignOut();
  }, [onSignOut]);

  const locationLabel = profile
    ? profile.location_tier === "Local_Ethiopia"
      ? `Ethiopia · ${profile.city ?? "—"}`
      : profile.country ?? "—"
    : "—";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.wordmark}>ምሳሌ</Text>
        <Text style={styles.heading}>Your Profile</Text>

        {loading ? (
          <ActivityIndicator color="#C9933A" style={{ marginTop: 48 }} />
        ) : (
          <>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>
                {profile?.full_name?.[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>

            <Text style={styles.name}>{profile?.full_name ?? "—"}</Text>

            <View style={styles.card}>
              <Row label="Phone"    value={profile?.phone ?? "—"} />
              <Row label="Gender"   value={profile?.gender ?? "—"} />
              <Row label="Religion" value={profile?.religion ?? "None"} />
              <Row label="Location" value={locationLabel} />
              <Row
                label="Languages"
                value={
                  profile?.languages?.length
                    ? profile.languages.join(", ")
                    : "—"
                }
              />
            </View>

            <Pressable
              onPress={handleSignOut}
              disabled={signingOut}
              style={({ pressed }) => [
                styles.signOutBtn,
                pressed && styles.signOutBtnPressed,
              ]}
            >
              {signingOut ? (
                <ActivityIndicator size="small" color="#E05A5A" />
              ) : (
                <Text style={styles.signOutText}>Sign Out</Text>
              )}
            </Pressable>

            <Text style={styles.footer}>
              ምሳሌ — Premium Habesha Dating
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: "#0D0C0B" },
  scroll:       { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 48, alignItems: "center" },
  wordmark:     { fontSize: 22, color: "#C9933A", fontWeight: "700", marginBottom: 4 },
  heading:      { fontSize: 15, color: "#7A7066", marginBottom: 32 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#1A1917",
    borderWidth: 2,
    borderColor: "#C9933A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  avatarInitial: { fontSize: 40, fontWeight: "700", color: "#C9933A" },
  name:    { fontSize: 22, fontWeight: "700", color: "#F5F0E8", marginBottom: 24 },
  card: {
    width: "100%",
    backgroundColor: "#1A1917",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2E2B28",
    overflow: "hidden",
    marginBottom: 32,
  },
  signOutBtn: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E05A5A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  signOutBtnPressed: { opacity: 0.6 },
  signOutText: { fontSize: 15, fontWeight: "600", color: "#E05A5A" },
  footer: { fontSize: 12, color: "#3A3835" },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#2E2B28",
  },
  label: { fontSize: 13, color: "#7A7066", fontWeight: "600" },
  value: { fontSize: 14, color: "#F5F0E8", flexShrink: 1, textAlign: "right", marginLeft: 12 },
});
