/**
 * Screen B — Basic Profile Metadata
 *
 * Captures: full_name, date_of_birth, gender
 * Advances to CulturalScreen on "Continue".
 */

import React, { useCallback, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useOnboarding, type GenderType } from "../../context/OnboardingContext";
import { PrimaryButton } from "../../components/ui/PrimaryButton";

// ── Date picker (lightweight in-modal wheel — no native module) ───────────────

interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
}

function DatePickerField({ value, onChange }: DatePickerProps) {
  const [open, setOpen]         = useState(false);
  const [localYear, setLocalYear]   = useState(
    (value ?? new Date(2000, 0, 1)).getFullYear(),
  );
  const [localMonth, setLocalMonth] = useState(
    (value ?? new Date(2000, 0, 1)).getMonth(),
  );
  const [localDay, setLocalDay]     = useState(
    (value ?? new Date(2000, 0, 1)).getDate(),
  );

  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  const confirm = () => {
    onChange(new Date(localYear, localMonth, localDay));
    setOpen(false);
  };

  const formatted = value
    ? `${months[value.getMonth()]} ${value.getDate()}, ${value.getFullYear()}`
    : null;

  return (
    <>
      <Pressable style={dateStyles.field} onPress={() => setOpen(true)}>
        <Text style={[dateStyles.text, !formatted && dateStyles.placeholder]}>
          {formatted ?? "Select date of birth"}
        </Text>
        <Text style={dateStyles.caret}>▼</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={dateStyles.backdrop} onPress={() => setOpen(false)} />
        <View style={dateStyles.card}>
          <Text style={dateStyles.cardTitle}>Date of Birth</Text>

          {/* Month */}
          <Text style={dateStyles.fieldLabel}>Month</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={dateStyles.chipScroll}>
            {months.map((m, i) => (
              <Pressable
                key={m}
                onPress={() => setLocalMonth(i)}
                style={[dateStyles.chip, localMonth === i && dateStyles.chipSelected]}
              >
                <Text style={[dateStyles.chipText, localMonth === i && dateStyles.chipTextSelected]}>
                  {m}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Day */}
          <Text style={dateStyles.fieldLabel}>Day</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={dateStyles.chipScroll}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <Pressable
                key={d}
                onPress={() => setLocalDay(d)}
                style={[dateStyles.chip, dateStyles.chipNarrow, localDay === d && dateStyles.chipSelected]}
              >
                <Text style={[dateStyles.chipText, localDay === d && dateStyles.chipTextSelected]}>
                  {d}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Year */}
          <Text style={dateStyles.fieldLabel}>Year</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={dateStyles.chipScroll}>
            {Array.from(
              { length: 80 },
              (_, i) => new Date().getFullYear() - 18 - i,
            ).map((y) => (
              <Pressable
                key={y}
                onPress={() => setLocalYear(y)}
                style={[dateStyles.chip, localYear === y && dateStyles.chipSelected]}
              >
                <Text style={[dateStyles.chipText, localYear === y && dateStyles.chipTextSelected]}>
                  {y}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <PrimaryButton label="Confirm" onPress={confirm} />
        </View>
      </Modal>
    </>
  );
}

const dateStyles = StyleSheet.create({
  field: {
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
  text:           { fontSize: 16, color: "#F5F0E8" },
  placeholder:    { color: "#3A3835" },
  caret:          { fontSize: 10, color: "#7A7066" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  card: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1A1917",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 44 : 24,
    gap: 8,
  },
  cardTitle:    { fontSize: 18, fontWeight: "700", color: "#F5F0E8", marginBottom: 8 },
  fieldLabel:   { fontSize: 12, color: "#7A7066", fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 8 },
  chipScroll:   { marginBottom: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#242220",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#2E2B28",
  },
  chipNarrow:   { paddingHorizontal: 10 },
  chipSelected: { backgroundColor: "rgba(201,147,58,0.18)", borderColor: "#C9933A" },
  chipText:         { fontSize: 14, color: "#7A7066" },
  chipTextSelected: { color: "#C9933A", fontWeight: "600" },
});

// ── Gender pill selector ──────────────────────────────────────────────────────

interface GenderOption {
  value: GenderType;
  label: string;
  emoji: string;
}

const GENDER_OPTIONS: GenderOption[] = [
  { value: "male",               label: "Man",               emoji: "♂" },
  { value: "female",             label: "Woman",             emoji: "♀" },
  { value: "non_binary",         label: "Non-binary",        emoji: "⚧" },
  { value: "prefer_not_to_say",  label: "Prefer not to say", emoji: "·" },
];

interface GenderSelectorProps {
  value: GenderType | null;
  onChange: (g: GenderType) => void;
}

function GenderSelector({ value, onChange }: GenderSelectorProps) {
  return (
    <View style={genderStyles.grid}>
      {GENDER_OPTIONS.map((opt) => {
        const sel = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[genderStyles.pill, sel && genderStyles.pillSelected]}
          >
            <Text style={genderStyles.emoji}>{opt.emoji}</Text>
            <Text style={[genderStyles.label, sel && genderStyles.labelSelected]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const genderStyles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 50,
    backgroundColor: "#1A1917",
    borderWidth: 1.5,
    borderColor: "#2E2B28",
  },
  pillSelected: {
    backgroundColor: "rgba(201,147,58,0.14)",
    borderColor: "#C9933A",
  },
  emoji:          { fontSize: 16 },
  label:          { fontSize: 14, color: "#7A7066", fontWeight: "500" },
  labelSelected:  { color: "#D4A843", fontWeight: "600" },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export function BasicInfoScreen() {
  const { state, dispatch } = useOnboarding();

  const [fullName, setFullName] = useState(state.fullName);
  const [dob,      setDob]      = useState<Date | null>(state.dateOfBirth);
  const [gender,   setGender]   = useState<GenderType | null>(state.gender);
  const [error,    setError]    = useState<string | null>(null);

  const canContinue =
    fullName.trim().length >= 2 && dob !== null && gender !== null;

  const handleContinue = useCallback(() => {
    if (!canContinue) {
      setError("Please fill in all fields.");
      return;
    }
    dispatch({ type: "SET_FULL_NAME",     payload: fullName.trim() });
    dispatch({ type: "SET_DATE_OF_BIRTH", payload: dob! });
    dispatch({ type: "SET_GENDER",        payload: gender! });
    dispatch({ type: "SET_STEP",          payload: "cultural" });
  }, [canContinue, fullName, dob, gender, dispatch]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Step indicator */}
        <View style={styles.stepRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.stepDot, i === 1 && styles.stepDotActive]} />
          ))}
        </View>

        <Text style={styles.heading}>About you</Text>
        <Text style={styles.sub}>Let's start with the basics.</Text>

        {/* Full name */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder="e.g. Selam Tesfaye"
            placeholderTextColor="#3A3835"
            style={styles.input}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

        {/* Date of birth */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Date of Birth</Text>
          <DatePickerField value={dob} onChange={setDob} />
        </View>

        {/* Gender */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>I am a…</Text>
          <GenderSelector
            value={gender}
            onChange={(g) => setGender(g)}
          />
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
  fieldGroup: { marginBottom: 24, gap: 8 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7A7066",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#1A1917",
    borderWidth: 1.5,
    borderColor: "#2E2B28",
    borderRadius: 14,
    paddingHorizontal: 18,
    height: 56,
    fontSize: 16,
    color: "#F5F0E8",
  },
  errorText: { fontSize: 13, color: "#E05A5A", marginBottom: 12 },
  footer:    { marginTop: 8 },
});
