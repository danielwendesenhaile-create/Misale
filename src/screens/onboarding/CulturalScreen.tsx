/**
 * Screen C — Cultural Attributes
 *
 * Captures: religion, languages (multi-select), strict_religious_alignment
 * Uses animated bottom-sheet pickers for religion selection.
 */

import React, { useCallback, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import {
  useOnboarding,
  type ReligionType,
} from "../../context/OnboardingContext";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import {
  BottomSheetModal,
  type PickerOption,
} from "../../components/ui/BottomSheetModal";

// ── Data ──────────────────────────────────────────────────────────────────────

const RELIGION_OPTIONS: PickerOption[] = [
  { value: "Orthodox",   label: "Ethiopian Orthodox",  emoji: "✝" },
  { value: "Protestant", label: "Protestant",          emoji: "✟" },
  { value: "Catholic",   label: "Catholic",            emoji: "⛪" },
  { value: "Muslim",     label: "Muslim",              emoji: "☪" },
  { value: "Other",      label: "Other",               emoji: "🕊" },
  { value: "None",       label: "None / Prefer not to say", emoji: "—" },
];

const LANGUAGE_OPTIONS: PickerOption[] = [
  { value: "Amharic",  label: "አማርኛ  Amharic",  emoji: "🇪🇹" },
  { value: "English",  label: "English",         emoji: "🌍" },
  { value: "Oromo",    label: "Afaan Oromoo",    emoji: "🌿" },
  { value: "Tigrinya", label: "ትግርኛ  Tigrinya",  emoji: "🌄" },
];

// ── Language chip multi-select ────────────────────────────────────────────────

interface LanguageChipsProps {
  selected: string[];
  onToggle: (lang: string) => void;
}

function LanguageChips({ selected, onToggle }: LanguageChipsProps) {
  return (
    <View style={chipStyles.wrap}>
      {LANGUAGE_OPTIONS.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <Pressable
            key={opt.value}
            onPress={() => onToggle(opt.value)}
            style={[chipStyles.chip, active && chipStyles.chipActive]}
          >
            <Text style={chipStyles.emoji}>{opt.emoji}</Text>
            <Text style={[chipStyles.label, active && chipStyles.labelActive]}>
              {opt.label}
            </Text>
            {active && <Text style={chipStyles.check}>✓</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#1A1917",
    borderWidth: 1.5,
    borderColor: "#2E2B28",
  },
  chipActive: {
    backgroundColor: "rgba(201,147,58,0.1)",
    borderColor: "#C9933A",
  },
  emoji:        { fontSize: 18 },
  label:        { flex: 1, fontSize: 15, color: "#7A7066", fontWeight: "400" },
  labelActive:  { color: "#F5F0E8", fontWeight: "500" },
  check:        { fontSize: 14, color: "#C9933A", fontWeight: "700" },
});

// ── Religion display trigger ──────────────────────────────────────────────────

interface ReligionFieldProps {
  value: ReligionType | null;
  onPress: () => void;
}

function ReligionField({ value, onPress }: ReligionFieldProps) {
  const opt = RELIGION_OPTIONS.find((o) => o.value === value);
  return (
    <Pressable style={fieldStyles.trigger} onPress={onPress}>
      <View style={fieldStyles.triggerLeft}>
        {opt ? (
          <>
            <Text style={fieldStyles.emoji}>{opt.emoji}</Text>
            <Text style={fieldStyles.selected}>{opt.label}</Text>
          </>
        ) : (
          <Text style={fieldStyles.placeholder}>Select your religion</Text>
        )}
      </View>
      <Text style={fieldStyles.caret}>▼</Text>
    </Pressable>
  );
}

const fieldStyles = StyleSheet.create({
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
  triggerLeft:  { flexDirection: "row", alignItems: "center", gap: 10 },
  emoji:        { fontSize: 18 },
  selected:     { fontSize: 16, color: "#F5F0E8" },
  placeholder:  { fontSize: 16, color: "#3A3835" },
  caret:        { fontSize: 10, color: "#7A7066" },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export function CulturalScreen() {
  const { state, dispatch } = useOnboarding();

  const [religion,   setReligion]   = useState<ReligionType | null>(state.religion);
  const [languages,  setLanguages]  = useState<string[]>(state.languages);
  const [strict,     setStrict]     = useState(state.strictReligiousAlignment);
  const [sheetOpen,  setSheetOpen]  = useState<"religion" | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const handleToggleLang = useCallback((lang: string) => {
    setLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  }, []);

  const handleReligionSelect = useCallback((value: string) => {
    setReligion(value as ReligionType);
  }, []);

  const canContinue = languages.length > 0;

  const handleContinue = useCallback(() => {
    if (!canContinue) {
      setError("Please select at least one language.");
      return;
    }
    dispatch({ type: "SET_RELIGION",       payload: religion ?? "None" });
    // Sync all language toggles
    languages.forEach((lang) => {
      if (!state.languages.includes(lang)) {
        dispatch({ type: "TOGGLE_LANGUAGE", payload: lang });
      }
    });
    state.languages.forEach((lang) => {
      if (!languages.includes(lang)) {
        dispatch({ type: "TOGGLE_LANGUAGE", payload: lang });
      }
    });
    dispatch({ type: "SET_STRICT_ALIGNMENT", payload: strict });
    dispatch({ type: "SET_STEP",             payload: "location" });
  }, [canContinue, religion, languages, strict, dispatch, state.languages]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Step indicator */}
        <View style={styles.stepRow}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[styles.stepDot, i <= 2 && styles.stepDotActive]}
            />
          ))}
        </View>

        <Text style={styles.heading}>Your culture</Text>
        <Text style={styles.sub}>
          ምሳሌ honours Ethiopian heritage — share what shapes you.
        </Text>

        {/* Religion */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Religion</Text>
          <ReligionField
            value={religion}
            onPress={() => setSheetOpen("religion")}
          />
        </View>

        {/* Strict alignment toggle */}
        {religion !== null && religion !== "None" && (
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleTitle}>
                Match within my faith only
              </Text>
              <Text style={styles.toggleSub}>
                Only show me {religion} profiles in daily drops.
              </Text>
            </View>
            <Switch
              value={strict}
              onValueChange={setStrict}
              trackColor={{ false: "#2E2B28", true: "rgba(201,147,58,0.6)" }}
              thumbColor={strict ? "#C9933A" : "#7A7066"}
            />
          </View>
        )}

        {/* Languages */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Languages I speak</Text>
          <LanguageChips selected={languages} onToggle={handleToggleLang} />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <View style={styles.footer}>
          <PrimaryButton
            label="Continue"
            onPress={handleContinue}
            disabled={!canContinue}
          />
        </View>
      </ScrollView>

      {/* Religion bottom sheet */}
      <BottomSheetModal
        visible={sheetOpen === "religion"}
        title="Religion"
        options={RELIGION_OPTIONS}
        selectedValues={religion ? [religion] : []}
        multiSelect={false}
        onSelect={handleReligionSelect}
        onClose={() => setSheetOpen(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#0D0C0B" },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  stepRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 32,
  },
  stepDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#2E2B28",
  },
  stepDotActive: {
    backgroundColor: "#C9933A",
  },
  heading:    { fontSize: 28, fontWeight: "700", color: "#F5F0E8", marginBottom: 6, letterSpacing: -0.3 },
  sub:        { fontSize: 15, color: "#7A7066", marginBottom: 32, lineHeight: 22 },
  fieldGroup: { marginBottom: 24, gap: 10 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7A7066",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1A1917",
    borderWidth: 1,
    borderColor: "#2E2B28",
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 24,
    gap: 16,
  },
  toggleText:  { flex: 1, gap: 3 },
  toggleTitle: { fontSize: 15, fontWeight: "600", color: "#F5F0E8" },
  toggleSub:   { fontSize: 13, color: "#7A7066", lineHeight: 18 },
  errorText:   { fontSize: 13, color: "#E05A5A", marginBottom: 12 },
  footer:      { marginTop: 8 },
});
