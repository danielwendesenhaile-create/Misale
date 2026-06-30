/**
 * EmptyState — shown when all 10 daily drop cards are exhausted.
 *
 * Features a live 24-hour countdown to the next midnight UTC drop.
 * Pulses the clock icon every second to feel alive.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PrimaryButton } from "../../../components/ui/PrimaryButton";

// ── Countdown logic ───────────────────────────────────────────────────────────

function getMsUntilNextMidnightUTC(): number {
  const now      = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.max(0, midnight.getTime() - now.getTime());
}

function formatCountdown(ms: number): { h: string; m: string; s: string } {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return {
    h: String(h).padStart(2, "0"),
    m: String(m).padStart(2, "0"),
    s: String(s).padStart(2, "0"),
  };
}

function useCountdown() {
  const [remaining, setRemaining] = useState(getMsUntilNextMidnightUTC);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(getMsUntilNextMidnightUTC());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return formatCountdown(remaining);
}

// ── Digit cell ────────────────────────────────────────────────────────────────

function DigitCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={cellStyles.wrap}>
      <View style={cellStyles.card}>
        <Text style={cellStyles.digit}>{value}</Text>
      </View>
      <Text style={cellStyles.label}>{label}</Text>
    </View>
  );
}

const cellStyles = StyleSheet.create({
  wrap:  { alignItems: "center", gap: 6 },
  card: {
    width:           72,
    height:          80,
    borderRadius:    16,
    backgroundColor: "#1A1917",
    borderWidth:     1,
    borderColor:     "#2E2B28",
    alignItems:      "center",
    justifyContent:  "center",
  },
  digit: {
    fontSize:    38,
    fontWeight:  "200",
    color:       "#F5F0E8",
    letterSpacing: -1,
  },
  label: {
    fontSize:    10,
    fontWeight:  "600",
    color:       "#7A7066",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
});

// ── Separator ─────────────────────────────────────────────────────────────────

function Separator() {
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, { toValue: 0.2, duration: 500, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
      ]),
    ).start();
  }, [opacityAnim]);

  return (
    <Animated.Text style={[sepStyles.colon, { opacity: opacityAnim }]}>
      :
    </Animated.Text>
  );
}

const sepStyles = StyleSheet.create({
  colon: {
    fontSize:   32,
    fontWeight: "300",
    color:      "#C9933A",
    marginBottom: 24,
    marginHorizontal: -4,
  },
});

// ── Main component ────────────────────────────────────────────────────────────

interface EmptyStateProps {
  onRefresh?: () => void;
}

export function EmptyState({ onRefresh }: EmptyStateProps) {
  const { h, m, s } = useCountdown();

  // Subtle pulse on the icon
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue:         1.08,
          duration:        900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue:         1,
          duration:        900,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      {/* Icon */}
      <Animated.Text
        style={[styles.icon, { transform: [{ scale: pulseAnim }] }]}
      >
        🌙
      </Animated.Text>

      {/* Headline */}
      <Text style={styles.headline}>You've seen everyone</Text>
      <Text style={styles.wordmark}>ምሳሌ</Text>
      <Text style={styles.sub}>
        Your next daily drop refreshes at midnight UTC.{"\n"}
        New matches are curated every 24 hours.
      </Text>

      {/* Countdown */}
      <View style={styles.timerSection}>
        <Text style={styles.timerLabel}>Next drop in</Text>
        <View style={styles.timerRow}>
          <DigitCell value={h} label="Hours" />
          <Separator />
          <DigitCell value={m} label="Mins" />
          <Separator />
          <DigitCell value={s} label="Secs" />
        </View>
      </View>

      {/* Refresh (in case user comes back after midnight) */}
      {onRefresh && (
        <PrimaryButton
          label="Check for New Drops"
          onPress={onRefresh}
          variant="outline"
        />
      )}

      <Text style={styles.hint}>
        Come back tomorrow — ምሳሌ is working on your next 10 curated matches ✨
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    alignItems:      "center",
    justifyContent:  "center",
    paddingHorizontal: 32,
    gap:             16,
  },

  icon: {
    fontSize:   64,
    marginBottom: 4,
  },

  headline: {
    fontSize:    26,
    fontWeight:  "700",
    color:       "#F5F0E8",
    textAlign:   "center",
    letterSpacing: -0.3,
  },
  wordmark: {
    fontSize:    18,
    fontWeight:  "700",
    color:       "#C9933A",
    letterSpacing: 1.5,
    marginTop:   -8,
  },
  sub: {
    fontSize:   14,
    color:      "#7A7066",
    textAlign:  "center",
    lineHeight: 21,
  },

  timerSection: {
    alignItems: "center",
    gap:        12,
    marginVertical: 8,
  },
  timerLabel: {
    fontSize:    11,
    fontWeight:  "600",
    color:       "#7A7066",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  timerRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
  },

  hint: {
    fontSize:   12,
    color:      "#4A4744",
    textAlign:  "center",
    lineHeight: 18,
    marginTop:  8,
  },
});
