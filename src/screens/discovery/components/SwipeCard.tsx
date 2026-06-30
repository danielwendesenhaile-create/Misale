/**
 * SwipeCard — gesture-driven profile card using Reanimated 3 + Gesture Handler v2
 *
 * Stack positions:
 *   stackIndex 0 → top card  (gesture active, full size)
 *   stackIndex 1 → second    (scale 0.95, translateY +18)
 *   stackIndex 2 → third     (scale 0.90, translateY +30)
 *
 * When the top card crosses SWIPE_THRESHOLD (or VELOCITY_THRESHOLD),
 * it springs off-screen then calls onSwipe(action) on the JS thread.
 * Promotion of underlying cards is driven by stackIndex prop changes:
 * each card springs to its new scale/Y when stackIndex decrements.
 */

import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import { Dimensions, Image, StyleSheet, Text, View } from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { DropCard } from "../../../types/discovery";
import {
  LanguageTags,
  LocationBadge,
  ReligionBadge,
  VerifiedBadge,
} from "./CardBadges";

// ── Constants ─────────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export const CARD_W = SCREEN_W - 32;
export const CARD_H = SCREEN_H * 0.68;

const SWIPE_THRESHOLD    = SCREEN_W * 0.30;
const VELOCITY_THRESHOLD = 700;

const SCALE_BY_INDEX     = [1.0,  0.95,  0.90]  as const;
const TRANSLATE_Y_INDEX  = [0,    18,    30]     as const;

const SPRING_OUT = { damping: 18, stiffness: 160, mass: 0.9 } as const;
const SPRING_IN  = { damping: 14, stiffness: 120 }             as const;

// ── Placeholder gradient when no photo ───────────────────────────────────────

const GRADIENT_FALLBACKS: [string, string][] = [
  ["#2C1F4A", "#4A2C5A"],  // purple
  ["#1A2C3A", "#2A4A3A"],  // teal
  ["#2C2A1A", "#4A3A1A"],  // amber
  ["#1A2A2C", "#1A3A4A"],  // blue
];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SwipeCardProps {
  card: DropCard;
  stackIndex: number;
  isTop: boolean;
  onSwipe: (action: "like" | "pass") => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SwipeCard({ card, stackIndex, isTop, onSwipe }: SwipeCardProps) {
  const { candidate } = card;

  // ── Shared values ───────────────────────────────────────────────────────────

  // Swipe gesture (only active on top card)
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Promotion animation (driven by stackIndex prop)
  const cardScale     = useSharedValue(SCALE_BY_INDEX[stackIndex]    ?? 0.85);
  const cardTranslateY = useSharedValue(TRANSLATE_Y_INDEX[stackIndex] ?? 40);
  const cardOpacity   = useSharedValue(stackIndex < 3 ? 1 : 0);

  // ── Promote when stackIndex changes ────────────────────────────────────────

  useEffect(() => {
    const targetScale = SCALE_BY_INDEX[stackIndex]    ?? 0.85;
    const targetTY    = TRANSLATE_Y_INDEX[stackIndex] ?? 40;
    const targetAlpha = stackIndex < 3 ? 1 : 0;

    cardScale.value      = withSpring(targetScale, SPRING_IN);
    cardTranslateY.value = withSpring(targetTY,    SPRING_IN);
    cardOpacity.value    = withTiming(targetAlpha, { duration: 180 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackIndex]);

  // ── Gesture ─────────────────────────────────────────────────────────────────

  const panGesture = Gesture.Pan()
    .enabled(isTop)
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.15;
    })
    .onEnd((e) => {
      const swipeRight =
        e.translationX > SWIPE_THRESHOLD || e.velocityX > VELOCITY_THRESHOLD;
      const swipeLeft =
        e.translationX < -SWIPE_THRESHOLD || e.velocityX < -VELOCITY_THRESHOLD;

      if (swipeRight) {
        translateX.value = withSpring(SCREEN_W * 1.6, SPRING_OUT, (finished) => {
          if (finished) runOnJS(onSwipe)("like");
        });
      } else if (swipeLeft) {
        translateX.value = withSpring(-SCREEN_W * 1.6, SPRING_OUT, (finished) => {
          if (finished) runOnJS(onSwipe)("pass");
        });
      } else {
        translateX.value = withSpring(0, SPRING_IN);
        translateY.value = withSpring(0, SPRING_IN);
      }
    });

  // ── Animated styles ─────────────────────────────────────────────────────────

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_W, 0, SCREEN_W],
      [-14, 0, 14],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value + cardTranslateY.value },
        { rotate: `${rotate}deg` },
        { scale: cardScale.value },
      ],
      opacity: cardOpacity.value,
    };
  });

  const likeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [20, SWIPE_THRESHOLD * 0.8],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const passStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD * 0.8, -20],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  // ── Derived display values ──────────────────────────────────────────────────

  const name        = candidate.display_name ?? "ምሳሌ";
  const photoUri    = candidate.profile_photos[0] ?? null;
  const fallbackGrad =
    GRADIENT_FALLBACKS[candidate.id.charCodeAt(0) % GRADIENT_FALLBACKS.length]!;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, cardStyle]}>
        {/* ── Photo / gradient background ─────────────────────────────── */}
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={fallbackGrad}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}

        {/* ── Bottom gradient overlay ─────────────────────────────────── */}
        <LinearGradient
          colors={[
            "transparent",
            "rgba(13,12,11,0.25)",
            "rgba(13,12,11,0.82)",
            "rgba(13,12,11,0.97)",
          ]}
          locations={[0, 0.45, 0.72, 1]}
          style={styles.gradient}
        />

        {/* ── LIKE indicator ──────────────────────────────────────────── */}
        <Animated.View style={[styles.likeIndicator, likeStyle]} pointerEvents="none">
          <Text style={styles.likeText}>LIKE</Text>
        </Animated.View>

        {/* ── PASS indicator ──────────────────────────────────────────── */}
        <Animated.View style={[styles.passIndicator, passStyle]} pointerEvents="none">
          <Text style={styles.passText}>PASS</Text>
        </Animated.View>

        {/* ── Verified badge (top-right) ───────────────────────────────── */}
        {candidate.is_verified && (
          <View style={styles.verifiedPos}>
            <VerifiedBadge />
          </View>
        )}

        {/* ── Profile info ─────────────────────────────────────────────── */}
        <View style={styles.infoPanel}>
          {/* Name + age */}
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
            <Text style={styles.age}>{candidate.age}</Text>
          </View>

          {/* Bio */}
          {candidate.bio != null && candidate.bio.length > 0 && (
            <Text style={styles.bio} numberOfLines={2}>
              {candidate.bio}
            </Text>
          )}

          {/* Cultural badges row */}
          <View style={styles.badgesRow}>
            <ReligionBadge religion={candidate.religion} />
            <LocationBadge
              locationTier={candidate.location_tier}
              country={candidate.country}
              city={candidate.city}
            />
          </View>

          {/* Language tags */}
          <LanguageTags languages={candidate.languages} maxVisible={3} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    position:     "absolute",
    width:        CARD_W,
    height:       CARD_H,
    borderRadius: 24,
    overflow:     "hidden",
    backgroundColor: "#1A1917",

    // Shadow
    shadowColor:   "#000",
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius:  18,
    elevation:     12,
  },

  gradient: {
    ...StyleSheet.absoluteFillObject,
  },

  // LIKE/PASS indicators
  likeIndicator: {
    position:    "absolute",
    top:         40,
    left:        28,
    borderWidth: 3,
    borderColor: "#4CAF72",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical:   6,
    transform: [{ rotate: "-15deg" }],
  },
  likeText: {
    fontSize:    26,
    fontWeight:  "900",
    color:       "#4CAF72",
    letterSpacing: 3,
  },
  passIndicator: {
    position:    "absolute",
    top:         40,
    right:       28,
    borderWidth: 3,
    borderColor: "#E05A5A",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical:   6,
    transform: [{ rotate: "15deg" }],
  },
  passText: {
    fontSize:    26,
    fontWeight:  "900",
    color:       "#E05A5A",
    letterSpacing: 3,
  },

  // Verified badge position
  verifiedPos: {
    position: "absolute",
    top:   16,
    right: 16,
  },

  // Profile info panel
  infoPanel: {
    position:       "absolute",
    bottom:         0,
    left:           0,
    right:          0,
    paddingHorizontal: 20,
    paddingBottom:  24,
    paddingTop:     12,
    gap:            10,
  },
  nameRow: {
    flexDirection: "row",
    alignItems:    "baseline",
    gap:           10,
  },
  name: {
    fontSize:    28,
    fontWeight:  "700",
    color:       "#F5F0E8",
    letterSpacing: -0.3,
    flexShrink:  1,
    // Explicit line height ensures Ge'ez/Amharic characters don't clip
    lineHeight:  36,
    includeFontPadding: false,
  },
  age: {
    fontSize:   22,
    fontWeight: "300",
    color:      "rgba(245,240,232,0.7)",
  },
  bio: {
    fontSize:   14,
    color:      "rgba(245,240,232,0.75)",
    lineHeight: 20,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap:      "wrap",
    gap:           8,
  },
});
