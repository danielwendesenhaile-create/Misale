/**
 * MatchModal — full-screen mutual match celebration overlay.
 *
 * Triggered when record-drop-action returns { matched: true }.
 * Animates in with a spring scale + fade, shows overlapping profile
 * avatars, and presents two CTAs: "Message Now" and "Keep Swiping".
 *
 * Sparkle particles are pure React Native Animated — no third-party dep.
 */

import React, { useCallback, useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { DropCandidate, MatchResult } from "../../../types/discovery";
import { PrimaryButton } from "../../../components/ui/PrimaryButton";

const { width: W, height: H } = Dimensions.get("window");

// ── Particle ──────────────────────────────────────────────────────────────────

interface Particle {
  x:     number;
  y:     number;
  angle: number;
  color: string;
  size:  number;
}

const PARTICLE_COLORS = ["#C9933A", "#D4A843", "#E8C76A", "#F5DFA0", "#FFFFFF"];

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    x:     W / 2,
    y:     H * 0.38,
    angle: (360 / count) * i,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length]!,
    size:  Math.random() * 5 + 4,
  }));
}

function SparkleField() {
  const particles = useRef(makeParticles(18)).current;
  const anims     = useRef(particles.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(
      28,
      anims.map((anim) =>
        Animated.spring(anim, {
          toValue: 1,
          damping: 10,
          stiffness: 60,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [anims]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map((p, i) => {
        const rad      = (p.angle * Math.PI) / 180;
        const distance = 110 + Math.random() * 60;
        const tx       = Math.cos(rad) * distance;
        const ty       = Math.sin(rad) * distance;

        const translateX = anims[i]!.interpolate({
          inputRange:  [0, 1],
          outputRange: [0, tx],
        });
        const translateY = anims[i]!.interpolate({
          inputRange:  [0, 1],
          outputRange: [0, ty],
        });
        const opacity = anims[i]!.interpolate({
          inputRange:  [0, 0.3, 0.8, 1],
          outputRange: [0, 1,   1,   0],
        });
        const scale = anims[i]!.interpolate({
          inputRange:  [0, 0.5, 1],
          outputRange: [0, 1.3, 0.6],
        });

        return (
          <Animated.View
            key={i}
            style={{
              position:        "absolute",
              top:             p.y,
              left:            p.x,
              width:           p.size,
              height:          p.size,
              borderRadius:    p.size / 2,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateX }, { translateY }, { scale }],
            }}
          />
        );
      })}
    </View>
  );
}

// ── Avatar circle ─────────────────────────────────────────────────────────────

interface AvatarProps {
  initial: string;
  color: string;
  style?: object;
}

function Avatar({ initial, color, style }: AvatarProps) {
  return (
    <View style={[avatarStyles.ring, style]}>
      <View style={[avatarStyles.circle, { backgroundColor: color }]}>
        <Text style={avatarStyles.initial}>{initial}</Text>
      </View>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  ring: {
    width:         92,
    height:        92,
    borderRadius:  46,
    borderWidth:   3,
    borderColor:   "#C9933A",
    overflow:      "hidden",
    backgroundColor: "#1A1917",
  },
  circle: {
    flex: 1,
    alignItems:    "center",
    justifyContent:"center",
  },
  initial: {
    fontSize:   32,
    fontWeight: "700",
    color:      "#F5F0E8",
  },
});

// ── Main modal ────────────────────────────────────────────────────────────────

interface MatchModalProps {
  visible:         boolean;
  matchResult:     MatchResult | null;
  myCandidate:     DropCandidate | null;
  onMessageNow:    (chatThreadId: string) => void;
  onKeepSwiping:   () => void;
}

export function MatchModal({
  visible,
  matchResult,
  myCandidate,
  onMessageNow,
  onKeepSwiping,
}: MatchModalProps) {
  const scaleAnim   = useRef(new Animated.Value(0.72)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue:         1,
          damping:         12,
          stiffness:       120,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue:         1,
          duration:        200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.72);
      opacityAnim.setValue(0);
    }
  }, [visible, scaleAnim, opacityAnim]);

  const handleMessageNow = useCallback(() => {
    if (matchResult?.chat_thread_id) {
      onMessageNow(matchResult.chat_thread_id);
    }
  }, [matchResult, onMessageNow]);

  if (!matchResult || !myCandidate) return null;

  const myInitial    = (myCandidate.display_name ?? "Y")[0]!.toUpperCase();
  const theirInitial = (myCandidate.display_name ?? "M")[0]!.toUpperCase();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onKeepSwiping}
    >
      {/* ── Backdrop ──────────────────────────────────────────────────── */}
      <View style={styles.backdrop}>
        <SparkleField />

        {/* ── Card ──────────────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.card,
            {
              opacity:   opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Gold accent bar */}
          <View style={styles.accentBar} />

          {/* Overlapping avatars */}
          <View style={styles.avatarRow}>
            <Avatar initial={myInitial}    color="#2C2A1A" style={styles.avatarLeft}  />
            <View style={styles.heartBubble}>
              <Text style={styles.heartText}>💛</Text>
            </View>
            <Avatar initial={theirInitial} color="#1A2C2A" style={styles.avatarRight} />
          </View>

          {/* Copy */}
          <Text style={styles.headline}>It's a Match!</Text>
          <Text style={styles.wordmark}>ምሳሌ ❤️</Text>
          <Text style={styles.sub}>
            You both liked each other. Start a conversation and see where it leads.
          </Text>

          {/* CTAs */}
          <View style={styles.actions}>
            <PrimaryButton
              label="Message Now"
              onPress={handleMessageNow}
              variant="gold"
            />
            <PrimaryButton
              label="Keep Swiping"
              onPress={onKeepSwiping}
              variant="ghost"
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: "rgba(13,12,11,0.92)",
    alignItems:      "center",
    justifyContent:  "center",
    paddingHorizontal: 24,
  },

  card: {
    width:           "100%",
    backgroundColor: "#1A1917",
    borderRadius:    28,
    paddingTop:      0,
    paddingBottom:   28,
    paddingHorizontal: 24,
    alignItems:      "center",
    gap:             12,
    overflow:        "hidden",

    shadowColor:   "#C9933A",
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius:  24,
    elevation:     16,
  },

  accentBar: {
    alignSelf:       "stretch",
    height:          4,
    backgroundColor: "#C9933A",
    marginBottom:    8,
  },

  avatarRow: {
    flexDirection: "row",
    alignItems:    "center",
    marginVertical: 8,
  },
  avatarLeft:  { transform: [{ translateX: 20 }] },
  avatarRight: { transform: [{ translateX: -20 }] },
  heartBubble: {
    width:         40,
    height:        40,
    borderRadius:  20,
    backgroundColor: "#0D0C0B",
    alignItems:    "center",
    justifyContent:"center",
    zIndex:        2,
    borderWidth:   2,
    borderColor:   "#C9933A",
  },
  heartText: {
    fontSize: 18,
    lineHeight: 22,
  },

  headline: {
    fontSize:    30,
    fontWeight:  "800",
    color:       "#F5F0E8",
    letterSpacing: -0.5,
    textAlign:   "center",
  },
  wordmark: {
    fontSize:    16,
    fontWeight:  "700",
    color:       "#C9933A",
    letterSpacing: 1.5,
  },
  sub: {
    fontSize:   14,
    color:      "#7A7066",
    textAlign:  "center",
    lineHeight: 21,
    paddingHorizontal: 8,
  },

  actions: {
    alignSelf:  "stretch",
    marginTop:  8,
    gap:        10,
  },
});
