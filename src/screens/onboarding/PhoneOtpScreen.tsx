/**
 * Screen A — Phone OTP Authentication
 *
 * Phase 1: user enters phone number → Supabase sends SMS OTP
 * Phase 2: user enters 6-digit OTP → verified, userId stored in context
 */

import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useOnboarding } from "../../context/OnboardingContext";
import { PrimaryButton } from "../../components/ui/PrimaryButton";

// ── Numeric keypad ────────────────────────────────────────────────────────────

const PAD_KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "⌫"],
] as const;

type PadKey = string;

interface NumericPadProps {
  onKey: (key: PadKey) => void;
  disabled?: boolean;
}

function NumericPad({ onKey, disabled = false }: NumericPadProps) {
  return (
    <View style={padStyles.grid}>
      {PAD_KEYS.map((row, ri) => (
        <View key={ri} style={padStyles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              onPress={() => key !== "" && onKey(key)}
              disabled={disabled || key === ""}
              style={({ pressed }) => [
                padStyles.key,
                key === "" && padStyles.keyInvisible,
                pressed && key !== "" && padStyles.keyPressed,
              ]}
            >
              <Text style={padStyles.keyLabel}>{key}</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const padStyles = StyleSheet.create({
  grid: { width: "100%", marginTop: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 4,
  },
  key: {
    width: 80,
    height: 68,
    borderRadius: 16,
    backgroundColor: "#1A1917",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2E2B28",
  },
  keyInvisible: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  keyPressed: {
    backgroundColor: "#242220",
    borderColor: "#C9933A",
  },
  keyLabel: {
    fontSize: 22,
    fontWeight: "400",
    color: "#F5F0E8",
  },
});

// ── OTP dot display ───────────────────────────────────────────────────────────

function OtpDots({ code, length = 6 }: { code: string; length?: number }) {
  return (
    <View style={dotStyles.row}>
      {Array.from({ length }).map((_, i) => {
        const filled = i < code.length;
        return (
          <View
            key={i}
            style={[dotStyles.dot, filled && dotStyles.dotFilled]}
          />
        );
      })}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 32,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#2E2B28",
    borderWidth: 1.5,
    borderColor: "#3A3835",
  },
  dotFilled: {
    backgroundColor: "#C9933A",
    borderColor: "#C9933A",
  },
});

// ── Main screen ───────────────────────────────────────────────────────────────

type Phase = "phone" | "otp";

export function PhoneOtpScreen() {
  const { dispatch } = useOnboarding();

  const [phase, setPhase]         = useState<Phase>("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [otpCode, setOtpCode]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const phoneRef = useRef<TextInput>(null);

  // Normalise to E.164: strip spaces and ensure leading +
  const e164Phone = phoneInput.trim().startsWith("+")
    ? phoneInput.trim().replace(/\s/g, "")
    : `+${phoneInput.trim().replace(/\s/g, "")}`;

  // ── Phase 1: send OTP ───────────────────────────────────────────────────────

  const sendOtp = useCallback(async () => {
    setError(null);
    if (e164Phone.length < 8) {
      setError("Please enter a valid phone number.");
      return;
    }
    setLoading(true);
    try {
      const { error: authErr } = await supabase.auth.signInWithOtp({
        phone: e164Phone,
      });
      if (authErr) throw authErr;
      dispatch({ type: "SET_PHONE", payload: e164Phone });
      setPhase("otp");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  }, [e164Phone, dispatch]);

  // ── Phase 2: verify OTP ─────────────────────────────────────────────────────

  const verifyOtp = useCallback(async () => {
    setError(null);
    if (otpCode.length !== 6) return;
    setLoading(true);
    try {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        phone: e164Phone,
        token: otpCode,
        type: "sms",
      });
      if (verifyErr) throw verifyErr;
      if (!data.user?.id) throw new Error("Verification returned no user.");

      dispatch({ type: "SET_USER_ID", payload: data.user.id });
      dispatch({ type: "SET_STEP", payload: "basicInfo" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid or expired code.");
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  }, [e164Phone, otpCode, dispatch]);

  // Auto-verify when 6 digits entered
  const handleOtpKey = useCallback(
    (key: PadKey) => {
      if (key === "⌫") {
        setOtpCode((p) => p.slice(0, -1));
        return;
      }
      const next = otpCode + key;
      if (next.length > 6) return;
      setOtpCode(next);
      if (next.length === 6) {
        // Give state time to flush before verifying
        setTimeout(verifyOtp, 50);
      }
    },
    [otpCode, verifyOtp],
  );

  const handlePhoneKey = useCallback((key: PadKey) => {
    if (key === "⌫") {
      setPhoneInput((p) => p.slice(0, -1));
      return;
    }
    setPhoneInput((p) => p + key);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.wordmark}>ምሳሌ</Text>
            <Text style={styles.heading}>
              {phase === "phone" ? "Enter your number" : "Verify your number"}
            </Text>
            <Text style={styles.sub}>
              {phase === "phone"
                ? "We'll send a one-time code to confirm your identity."
                : `We sent a 6-digit code to ${e164Phone}`}
            </Text>
          </View>

          {/* Phone input (phase 1) */}
          {phase === "phone" && (
            <>
              <Pressable
                style={styles.phoneField}
                onPress={() => phoneRef.current?.focus()}
              >
                <Text style={styles.countryPrefix}>🇪🇹 +</Text>
                <Text style={styles.phoneText}>
                  {phoneInput || (
                    <Text style={styles.placeholder}>2519 *** ****</Text>
                  )}
                </Text>
                {/* Hidden input captures keyboard on web/emulator */}
                <TextInput
                  ref={phoneRef}
                  value={phoneInput}
                  onChangeText={setPhoneInput}
                  keyboardType="phone-pad"
                  style={styles.hiddenInput}
                  maxLength={15}
                />
              </Pressable>

              <NumericPad onKey={handlePhoneKey} disabled={loading} />

              <View style={styles.actionRow}>
                {error && <Text style={styles.errorText}>{error}</Text>}
                <PrimaryButton
                  label={loading ? "" : "Send Code"}
                  onPress={sendOtp}
                  loading={loading}
                  disabled={phoneInput.length < 7}
                />
              </View>
            </>
          )}

          {/* OTP input (phase 2) */}
          {phase === "otp" && (
            <>
              <OtpDots code={otpCode} />

              {loading && (
                <View style={styles.verifyingRow}>
                  <ActivityIndicator size="small" color="#C9933A" />
                  <Text style={styles.verifyingText}>Verifying…</Text>
                </View>
              )}

              <NumericPad onKey={handleOtpKey} disabled={loading} />

              {error && <Text style={[styles.errorText, styles.errorCenter]}>{error}</Text>}

              <Pressable
                onPress={() => { setPhase("phone"); setOtpCode(""); setError(null); }}
                style={styles.resendRow}
              >
                <Text style={styles.resendText}>
                  Didn't receive it?{" "}
                  <Text style={styles.resendLink}>Resend code</Text>
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: "#0D0C0B" },
  flex:        { flex: 1 },
  scroll:      { flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },
  header:      { marginBottom: 32 },
  wordmark:    { fontSize: 28, color: "#C9933A", fontWeight: "700", marginBottom: 24 },
  heading:     { fontSize: 28, fontWeight: "700", color: "#F5F0E8", marginBottom: 8, letterSpacing: -0.3 },
  sub:         { fontSize: 15, color: "#7A7066", lineHeight: 22 },
  phoneField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1917",
    borderWidth: 1.5,
    borderColor: "#2E2B28",
    borderRadius: 16,
    paddingHorizontal: 20,
    height: 64,
    marginBottom: 24,
    gap: 8,
  },
  countryPrefix: { fontSize: 18, color: "#F5F0E8" },
  phoneText:     { fontSize: 22, fontWeight: "500", color: "#F5F0E8", flex: 1, letterSpacing: 1 },
  placeholder:   { color: "#3A3835" },
  hiddenInput:   { position: "absolute", opacity: 0, width: 1, height: 1 },
  actionRow:     { marginTop: 24, gap: 12 },
  errorText:     { fontSize: 13, color: "#E05A5A", textAlign: "left" },
  errorCenter:   { textAlign: "center", marginTop: 8 },
  verifyingRow:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 },
  verifyingText: { fontSize: 14, color: "#7A7066" },
  resendRow:     { marginTop: 24, alignItems: "center" },
  resendText:    { fontSize: 14, color: "#7A7066" },
  resendLink:    { color: "#C9933A", fontWeight: "600" },
});
