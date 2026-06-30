/**
 * Screen A — Phone OTP Authentication
 *
 * Phase 1: user enters phone number via custom numeric pad → Supabase sends SMS OTP
 * Phase 2: user enters 6-digit OTP → verified, userId stored in context
 *
 * No native keyboard — all input goes through NumericPad so the native
 * iOS/Android keyboard never appears.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
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
  ["",  "0", "⌫"],
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
              key={key || `empty-${ri}`}
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
  grid: { width: "100%" },
  row: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 6,
  },
  key: {
    width: 88,
    height: 64,
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
    gap: 16,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 28,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#2E2B28",
    borderWidth: 1.5,
    borderColor: "#3A3835",
  },
  dotFilled: {
    backgroundColor: "#C9933A",
    borderColor: "#C9933A",
  },
});

// ── Phone display (no TextInput — no native keyboard) ─────────────────────────

function PhoneDisplay({ digits }: { digits: string }) {
  return (
    <View style={phoneStyles.field}>
      <Text style={phoneStyles.flag}>🇪🇹</Text>
      <Text style={phoneStyles.prefix}>+</Text>
      {digits.length === 0 ? (
        <Text style={phoneStyles.placeholder}>2519 *** ****</Text>
      ) : (
        <Text style={phoneStyles.digits}>{digits}</Text>
      )}
    </View>
  );
}

const phoneStyles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A1917",
    borderWidth: 1.5,
    borderColor: "#C9933A",
    borderRadius: 16,
    paddingHorizontal: 20,
    height: 68,
    gap: 8,
  },
  flag:        { fontSize: 20 },
  prefix:      { fontSize: 22, fontWeight: "500", color: "#F5F0E8" },
  digits:      { fontSize: 22, fontWeight: "500", color: "#F5F0E8", letterSpacing: 2, flex: 1 },
  placeholder: { fontSize: 18, color: "#3A3835", flex: 1 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

type Phase = "phone" | "otp";

export function PhoneOtpScreen() {
  const { dispatch } = useOnboarding();

  const [phase,      setPhase]      = useState<Phase>("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [otpCode,    setOtpCode]    = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Normalise to E.164
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

  const verifyOtp = useCallback(async (code: string) => {
    setError(null);
    setLoading(true);
    try {
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        phone: e164Phone,
        token: code,
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
  }, [e164Phone, dispatch]);

  // ── Keypad handlers ─────────────────────────────────────────────────────────

  const handlePhoneKey = useCallback((key: PadKey) => {
    if (key === "⌫") {
      setPhoneInput((p) => p.slice(0, -1));
    } else if (phoneInput.length < 15) {
      setPhoneInput((p) => p + key);
    }
  }, [phoneInput]);

  const handleOtpKey = useCallback((key: PadKey) => {
    if (loading) return;
    if (key === "⌫") {
      setOtpCode((p) => p.slice(0, -1));
      return;
    }
    const next = otpCode + key;
    if (next.length > 6) return;
    setOtpCode(next);
    if (next.length === 6) {
      void verifyOtp(next);
    }
  }, [otpCode, loading, verifyOtp]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>

      {/* Top: header + phone/OTP display */}
      <View style={styles.top}>
        <Text style={styles.wordmark}>ምሳሌ</Text>
        <Text style={styles.heading}>
          {phase === "phone" ? "Enter your number" : "Verify your number"}
        </Text>
        <Text style={styles.sub}>
          {phase === "phone"
            ? "We'll send a one-time code to confirm your identity."
            : `We sent a 6-digit code to ${e164Phone}`}
        </Text>

        {phase === "phone" && <PhoneDisplay digits={phoneInput} />}
        {phase === "otp"   && <OtpDots code={otpCode} />}

        {error != null && (
          <Text style={styles.errorText}>{error}</Text>
        )}
      </View>

      {/* Bottom: custom keypad + Send Code / Resend */}
      <View style={styles.bottom}>

        {phase === "phone" && (
          <>
            <NumericPad onKey={handlePhoneKey} disabled={loading} />
            <View style={styles.actionRow}>
              <PrimaryButton
                label={loading ? "" : "Send Code"}
                onPress={sendOtp}
                loading={loading}
                disabled={loading || phoneInput.length < 7}
              />
            </View>
          </>
        )}

        {phase === "otp" && (
          <>
            {loading && (
              <View style={styles.verifyingRow}>
                <ActivityIndicator size="small" color="#C9933A" />
                <Text style={styles.verifyingText}>Verifying…</Text>
              </View>
            )}
            <NumericPad onKey={handleOtpKey} disabled={loading} />
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

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0D0C0B" },

  top: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 8,
  },

  bottom: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 28,
    justifyContent: "flex-end",
  },

  wordmark:  { fontSize: 28, color: "#C9933A", fontWeight: "700", marginBottom: 24 },
  heading:   { fontSize: 28, fontWeight: "700", color: "#F5F0E8", marginBottom: 8, letterSpacing: -0.3 },
  sub:       { fontSize: 15, color: "#7A7066", lineHeight: 22, marginBottom: 24 },

  errorText: { fontSize: 13, color: "#E05A5A", marginTop: 12, textAlign: "center" },

  actionRow:     { marginTop: 16 },
  verifyingRow:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 },
  verifyingText: { fontSize: 14, color: "#7A7066" },
  resendRow:     { marginTop: 20, alignItems: "center" },
  resendText:    { fontSize: 14, color: "#7A7066" },
  resendLink:    { color: "#C9933A", fontWeight: "600" },
});
