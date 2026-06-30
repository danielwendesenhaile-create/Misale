import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useDailyDrop } from "../../hooks/useDailyDrop";
import type { DropCard, MatchResult } from "../../types/discovery";
import { EmptyState } from "./components/EmptyState";
import { MatchModal } from "./components/MatchModal";
import { CARD_H, SwipeCard } from "./components/SwipeCard";

// ── Constants ─────────────────────────────────────────────────────────────────

const VISIBLE_CARDS = 3;

// ── Props ─────────────────────────────────────────────────────────────────────

interface DailyDropDeckProps {
  onOpenChat?: (chatThreadId: string) => void;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function DailyDropDeck({ onOpenChat }: DailyDropDeckProps) {
  const { cards, loading, error, reload, recordAction } = useDailyDrop();

  const [currentIndex, setCurrentIndex] = useState(0);

  const [matchVisible, setMatchVisible] = useState(false);
  const [matchResult,  setMatchResult]  = useState<MatchResult | null>(null);
  const [matchedCard,  setMatchedCard]  = useState<DropCard | null>(null);

  // ── Swipe handler ─────────────────────────────────────────────────────────

  const handleSwipe = useCallback(
    (card: DropCard, action: "like" | "pass") => {
      setCurrentIndex((prev) => prev + 1);

      void recordAction(card, action).then((result) => {
        if (result) {
          setMatchResult(result);
          setMatchedCard(card);
          setMatchVisible(true);
        }
      });
    },
    [recordAction],
  );

  // ── Button handlers ───────────────────────────────────────────────────────

  const topCard = cards[currentIndex] ?? null;

  const handlePassButton = useCallback(() => {
    if (topCard) handleSwipe(topCard, "pass");
  }, [topCard, handleSwipe]);

  const handleLikeButton = useCallback(() => {
    if (topCard) handleSwipe(topCard, "like");
  }, [topCard, handleSwipe]);

  // ── Modal handlers ────────────────────────────────────────────────────────

  const handleMessageNow = useCallback(
    (chatThreadId: string) => {
      setMatchVisible(false);
      onOpenChat?.(chatThreadId);
    },
    [onOpenChat],
  );

  const handleKeepSwiping = useCallback(() => {
    setMatchVisible(false);
  }, []);

  // ── Refresh after empty state ─────────────────────────────────────────────

  const handleRefresh = useCallback(() => {
    setCurrentIndex(0);
    void reload();
  }, [reload]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#C9933A" />
        <Text style={styles.loadingText}>Curating your daily drops…</Text>
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={({ pressed }) => [styles.retryBtn, pressed && styles.retryPressed]}
          onPress={() => void reload()}
        >
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────────────

  if (currentIndex >= cards.length) {
    return (
      <View style={styles.fill}>
        <EmptyState onRefresh={handleRefresh} />
      </View>
    );
  }

  // ── Card stack ────────────────────────────────────────────────────────────

  const visibleSlots = Array.from(
    { length: VISIBLE_CARDS },
    (_, i) => currentIndex + i,
  ).filter((idx) => idx < cards.length);

  return (
    <SafeAreaView style={styles.fill}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>ምሳሌ</Text>
        <Text style={styles.counter}>
          {currentIndex + 1}/{cards.length}
        </Text>
      </View>

      {/* Deck — cards rendered in reverse so top card paints last */}
      <View style={styles.deckArea}>
        {[...visibleSlots].reverse().map((cardIdx) => {
          const card       = cards[cardIdx]!;
          const stackIndex = cardIdx - currentIndex;
          return (
            <SwipeCard
              key={card.dropId}
              card={card}
              stackIndex={stackIndex}
              isTop={stackIndex === 0}
              onSwipe={(action) => handleSwipe(card, action)}
            />
          );
        })}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.actionBtn,
            styles.passBtn,
            pressed && styles.btnPressed,
          ]}
          onPress={handlePassButton}
        >
          <Text style={styles.passIcon}>✕</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionBtn,
            styles.likeBtn,
            pressed && styles.btnPressed,
          ]}
          onPress={handleLikeButton}
        >
          <Text style={styles.likeIcon}>♥</Text>
        </Pressable>
      </View>

      {/* Mutual match overlay */}
      <MatchModal
        visible={matchVisible}
        matchResult={matchResult}
        myCandidate={matchedCard?.candidate ?? null}
        onMessageNow={handleMessageNow}
        onKeepSwiping={handleKeepSwiping}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: "#0D0C0B",
  },

  centred: {
    flex:            1,
    alignItems:      "center",
    justifyContent:  "center",
    backgroundColor: "#0D0C0B",
    gap:             16,
    paddingHorizontal: 32,
  },

  // ── Loading ─────────────────────────────────────────────────────────────

  loadingText: {
    fontSize:   14,
    color:      "#7A7066",
    textAlign:  "center",
    marginTop:  8,
  },

  // ── Error ───────────────────────────────────────────────────────────────

  errorIcon: {
    fontSize: 40,
  },
  errorText: {
    fontSize:   15,
    color:      "#7A7066",
    textAlign:  "center",
    lineHeight: 22,
  },
  retryBtn: {
    marginTop:        8,
    paddingVertical:  12,
    paddingHorizontal: 28,
    borderRadius:     12,
    borderWidth:      1.5,
    borderColor:      "#C9933A",
  },
  retryPressed: {
    opacity: 0.7,
  },
  retryText: {
    fontSize:   15,
    fontWeight: "600",
    color:      "#C9933A",
  },

  // ── Screen layout ───────────────────────────────────────────────────────

  header: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop:     12,
    paddingBottom:  8,
  },
  wordmark: {
    fontSize:    22,
    fontWeight:  "700",
    color:       "#C9933A",
    letterSpacing: 1.5,
  },
  counter: {
    fontSize:   13,
    fontWeight: "600",
    color:      "#4A4744",
    letterSpacing: 0.5,
  },

  // ── Deck area ───────────────────────────────────────────────────────────

  deckArea: {
    flex:          1,
    alignItems:    "center",
    justifyContent:"center",
    // Clamp the container so cards don't bleed into the action row
    maxHeight:     CARD_H + 40,
  },

  // ── Action buttons ──────────────────────────────────────────────────────

  actions: {
    flexDirection:  "row",
    justifyContent: "center",
    alignItems:     "center",
    gap:            40,
    paddingVertical: 20,
    paddingBottom:  28,
  },
  actionBtn: {
    width:          64,
    height:         64,
    borderRadius:   32,
    alignItems:     "center",
    justifyContent: "center",

    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius:  8,
    elevation:     6,
  },
  passBtn: {
    backgroundColor: "#1A1917",
    borderWidth:     1.5,
    borderColor:     "#E05A5A",
    shadowColor:     "#E05A5A",
  },
  likeBtn: {
    backgroundColor: "#1A1917",
    borderWidth:     1.5,
    borderColor:     "#C9933A",
    shadowColor:     "#C9933A",
  },
  btnPressed: {
    opacity:   0.75,
    transform: [{ scale: 0.94 }],
  },
  passIcon: {
    fontSize:   24,
    color:      "#E05A5A",
    fontWeight: "600",
    lineHeight: 28,
  },
  likeIcon: {
    fontSize:   24,
    color:      "#C9933A",
    fontWeight: "600",
    lineHeight: 28,
  },
});
