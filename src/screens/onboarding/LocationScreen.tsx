/**
 * Screen D — Location Tier (Final Step)
 *
 * Splits users into Local Ethiopia / Diaspora, collects city or country,
 * then compiles the full profile payload and submits to Supabase.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useOnboarding,
  type LocationTierType,
} from "../../context/OnboardingContext";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import {
  BottomSheetModal,
  type PickerOption,
} from "../../components/ui/BottomSheetModal";

// ── Location data ─────────────────────────────────────────────────────────────

const ETHIOPIAN_CITIES: PickerOption[] = [
  { value: "Addis Ababa", label: "Addis Ababa / አዲስ አበባ",  emoji: "🏙" },
  { value: "Dire Dawa",   label: "Dire Dawa / ድሬዳዋ",         emoji: "🌆" },
  { value: "Mekelle",     label: "Mekelle / መቐለ",            emoji: "🏔" },
  { value: "Gondar",      label: "Gondar / ጎንደር",             emoji: "👑" },
  { value: "Hawassa",     label: "Hawassa / ሐዋሳ",             emoji: "🌊" },
  { value: "Bahir Dar",   label: "Bahir Dar / ባሕር ዳር",       emoji: "⛵" },
  { value: "Adama",       label: "Adama / ናዝሬት",             emoji: "🌿" },
  { value: "Jimma",       label: "Jimma / ጅማ",               emoji: "🌱" },
];

const DIASPORA_COUNTRIES: PickerOption[] = [
  { value: "United States",    label: "United States",     emoji: "🇺🇸" },
  { value: "Canada",           label: "Canada",            emoji: "🇨🇦" },
  { value: "United Kingdom",   label: "United Kingdom",    emoji: "🇬🇧" },
  { value: "Sweden",           label: "Sweden",            emoji: "🇸🇪" },
  { value: "Norway",           label: "Norway",            emoji: "🇳🇴" },
  { value: "Germany",          label: "Germany",           emoji: "🇩🇪" },
  { value: "Netherlands",      label: "Netherlands",       emoji: "🇳🇱" },
  { value: "Italy",            label: "Italy",             emoji: "🇮🇹" },
  { value: "Australia",        label: "Australia",         emoji: "🇦🇺" },
  { value: "UAE",              label: "United Arab Emirates", emoji: "🇦🇪" },
  { value: "Saudi Arabia",     label: "Saudi Arabia",      emoji: "🇸🇦" },
  { value: "Israel",           label: "Israel",            emoji: "🇮🇱" },
  { value: "South Africa",     label: "South Africa",      emoji: "🇿🇦" },
  { value: "Kenya",            label: "Kenya",             emoji: "🇰🇪" },
  { value: "Sudan",            label: "Sudan",             emoji: "🇸🇩" },
  { value: "Other",            label: "Other country",     emoji: "🌍" },
];

// ── Tier toggle card ──────────────────────────────────────────────────────────

interface TierCardProps {
  tier: LocationTierType;
  selected: boolean;
  onPress: () => void;
}

function TierCard({ tier, selected, onPress }: TierCardProps) {
  const isEthiopia = tier === "Local_Ethiopia";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tierStyles.card,
        selected && tierStyles.cardSelected,
        pressed   && tierStyles.cardPressed,
      ]}
    >
      <Text style={tierStyles.flag}>{isEthiopia ? "🇪🇹" : "✈️"}</Text>
      <Text style={[tierStyles.cardTitle, selected && tierStyles.cardTitleSelected]}>
        {isEthiopia ? "Living in Ethiopia" : "Ethiopian Diaspora"}
      </Text>
      <Text style={tierStyles.cardSub}>
        {isEthiopia
          ? "I am currently based inside Ethiopia"
          : "I am based internationally"}
      </Text>
      {selected && (
        <View style={tierStyles.badge}>
          <Text style={tierStyles.badgeText}>Selected</Text>
        </View>
      )}
    </Pressable>
  );
}

const tierStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#2E2B28",
    borderRadius: 18,
    backgroundColor: "#1A1917",
    padding: 20,
    alignItems: "center",
    gap: 8,
    minHeight: 160,
    justifyContent: "center",
  },
  cardSelected: {
    borderColor: "#C9933A",
    backgroundColor: "rgba(201,147,58,0.08)",
  },
  cardPressed: { opacity: 0.8 },
  flag:              { fontSize: 32 },
  cardTitle:         { fontSize: 15, fontWeight: "700", color: "#7A7066", textAlign: "center" },
  cardTitleSelected: { color: "#F5F0E8" },
  cardSub:  { fontSize: 12, color: "#4A4744", textAlign: "center", lineHeight: 17 },
  badge: {
    marginTop: 6,
    backgroundColor: "#C9933A",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#0D0C0B" },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export function LocationScreen() {
  const { state, dispatch, submitProfile } = useOnboarding();

  const [tier,       setTier]       = useState<LocationTierType | null>(state.locationTier);
  const [city,       setCity]       = useState<string | null>(state.city);
  const [country,    setCountry]    = useState<string | null>(state.country);
  const [sheetOpen,  setSheetOpen]  = useState<"city" | "country" | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [success,    setSuccess]    = useState(false);

  const { submitting } = state;

  const locationSelected =
    tier === "Local_Ethiopia" ? city !== null : country !== null;
  const canSubmit = tier !== null && locationSelected;

  const handleTierSelect = useCallback((t: LocationTierType) => {
    setTier(t);
    setCity(null);
    setCountry(null);
    dispatch({ type: "SET_LOCATION_TIER", payload: t });
  }, [dispatch]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    if (!canSubmit) {
      setError(
        tier === "Local_Ethiopia"
          ? "Please select your city."
          : "Please select your country.",
      );
      return;
    }

    // Sync location to context before submitting
    if (tier === "Local_Ethiopia" && city) {
      dispatch({ type: "SET_CITY", payload: city });
    }
    if (tier === "Diaspora" && country) {
      dispatch({ type: "SET_COUNTRY", payload: country });
    }

    // Give context one tick to flush before reading state in submitProfile
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const ok = await submitProfile();
    if (ok) {
      setSuccess(true);
    } else {
      setError(state.submitError ?? "Something went wrong. Please try again.");
    }
  }, [canSubmit, tier, city, country, dispatch, submitProfile, state.submitError]);

  // ── Success state ──────────────────────────────────────────────────────────

  if (success) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={successStyles.container}>
          <Text style={successStyles.icon}>✨</Text>
          <Text style={successStyles.heading}>You're all set!</Text>
          <Text style={successStyles.sub}>
            Welcome to ምሳሌ — your daily drops will be ready shortly.
          </Text>
          <View style={successStyles.details}>
            <Text style={successStyles.detailRow}>
              📍 {tier === "Local_Ethiopia" ? `Ethiopia · ${city}` : country}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Step indicator */}
        <View style={styles.stepRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.stepDot, styles.stepDotActive]} />
          ))}
        </View>

        <Text style={styles.heading}>Where are you?</Text>
        <Text style={styles.sub}>
          ምሳሌ connects the global Habesha community — tell us where you are.
        </Text>

        {/* Tier toggle */}
        <View style={styles.tierRow}>
          <TierCard
            tier="Local_Ethiopia"
            selected={tier === "Local_Ethiopia"}
            onPress={() => handleTierSelect("Local_Ethiopia")}
          />
          <TierCard
            tier="Diaspora"
            selected={tier === "Diaspora"}
            onPress={() => handleTierSelect("Diaspora")}
          />
        </View>

        {/* City / Country selector */}
        {tier === "Local_Ethiopia" && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Your City</Text>
            <Pressable
              style={styles.trigger}
              onPress={() => setSheetOpen("city")}
            >
              <Text style={[styles.triggerText, !city && styles.triggerPlaceholder]}>
                {ETHIOPIAN_CITIES.find((c) => c.value === city)?.label
                  ?? "Select your city"}
              </Text>
              <Text style={styles.caret}>▼</Text>
            </Pressable>
          </View>
        )}

        {tier === "Diaspora" && (
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Your Country</Text>
            <Pressable
              style={styles.trigger}
              onPress={() => setSheetOpen("country")}
            >
              <View style={styles.triggerInner}>
                {DIASPORA_COUNTRIES.find((c) => c.value === country)?.emoji != null && (
                  <Text style={styles.triggerEmoji}>
                    {DIASPORA_COUNTRIES.find((c) => c.value === country)?.emoji}
                  </Text>
                )}
                <Text style={[styles.triggerText, !country && styles.triggerPlaceholder]}>
                  {DIASPORA_COUNTRIES.find((c) => c.value === country)?.label
                    ?? "Select your country"}
                </Text>
              </View>
              <Text style={styles.caret}>▼</Text>
            </Pressable>
          </View>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.footer}>
          {submitting ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#C9933A" />
              <Text style={styles.loadingText}>Setting up your profile…</Text>
            </View>
          ) : (
            <PrimaryButton
              label="Complete Profile"
              onPress={handleSubmit}
              disabled={!canSubmit}
            />
          )}
        </View>

        <Text style={styles.footNote}>
          By continuing you agree to the Misale Terms of Use and Privacy Policy.
        </Text>
      </ScrollView>

      {/* City picker sheet */}
      <BottomSheetModal
        visible={sheetOpen === "city"}
        title="Select City"
        options={ETHIOPIAN_CITIES}
        selectedValues={city ? [city] : []}
        multiSelect={false}
        onSelect={(v) => { setCity(v); setSheetOpen(null); }}
        onClose={() => setSheetOpen(null)}
      />

      {/* Country picker sheet */}
      <BottomSheetModal
        visible={sheetOpen === "country"}
        title="Select Country"
        options={DIASPORA_COUNTRIES}
        selectedValues={country ? [country] : []}
        multiSelect={false}
        onSelect={(v) => { setCountry(v); setSheetOpen(null); }}
        onClose={() => setSheetOpen(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: "#0D0C0B" },
  scroll:     { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48 },
  stepRow:    { flexDirection: "row", gap: 8, marginBottom: 32 },
  stepDot:    { flex: 1, height: 3, borderRadius: 2, backgroundColor: "#2E2B28" },
  stepDotActive: { backgroundColor: "#C9933A" },
  heading:    { fontSize: 28, fontWeight: "700", color: "#F5F0E8", marginBottom: 6, letterSpacing: -0.3 },
  sub:        { fontSize: 15, color: "#7A7066", marginBottom: 28, lineHeight: 22 },
  tierRow:    { flexDirection: "row", gap: 12, marginBottom: 28 },
  fieldGroup: { marginBottom: 24, gap: 8 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7A7066",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1A1917",
    borderWidth: 1.5,
    borderColor: "#2E2B28",
    borderRadius: 14,
    paddingHorizontal: 18,
    height: 56,
  },
  triggerInner:       { flexDirection: "row", alignItems: "center", gap: 10 },
  triggerEmoji:       { fontSize: 18 },
  triggerText:        { fontSize: 16, color: "#F5F0E8" },
  triggerPlaceholder: { color: "#3A3835" },
  caret:       { fontSize: 10, color: "#7A7066" },
  errorText:   { fontSize: 13, color: "#E05A5A", marginBottom: 12 },
  footer:      { marginTop: 8 },
  loadingRow:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, height: 56 },
  loadingText: { fontSize: 15, color: "#7A7066" },
  footNote:    { marginTop: 20, fontSize: 12, color: "#4A4744", textAlign: "center", lineHeight: 18 },
});

const successStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: "#0D0C0B",
    gap: 16,
  },
  icon:    { fontSize: 64 },
  heading: { fontSize: 28, fontWeight: "700", color: "#F5F0E8", textAlign: "center" },
  sub:     { fontSize: 15, color: "#7A7066", textAlign: "center", lineHeight: 22 },
  details: {
    marginTop: 8,
    backgroundColor: "#1A1917",
    borderRadius: 14,
    padding: 16,
    width: "100%",
    gap: 8,
  },
  detailRow: { fontSize: 14, color: "#BDB8B0" },
});
