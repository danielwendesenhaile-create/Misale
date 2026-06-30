/**
 * MatchesList — inbox / matches screen.
 *
 * Layout:
 *   ① Header — wordmark + unread count badge
 *   ② "New Matches" horizontal strip — circular avatars for threads with
 *      no messages yet (fresh mutual connections)
 *   ③ "Conversations" FlatList — message-preview rows for active threads,
 *      ordered newest-first by last_message_at
 *
 * Realtime is handled by useMatches(); this component is purely presentational.
 */

import React, { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMatches } from "../../hooks/useMatches";
import type { MatchListItem, MatchedUser } from "../../types/chat";

// ── Props ─────────────────────────────────────────────────────────────────────

interface MatchesListProps {
  onOpenChat: (threadId: string, otherUser: MatchedUser) => void;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function UserAvatar({
  user,
  size = 48,
  ringColor = "transparent",
}: {
  user: MatchedUser;
  size?: number;
  ringColor?: string;
}) {
  const initials = (user.display_name ?? "?")[0]!.toUpperCase();
  const photoUri = user.profile_photos[0];

  return (
    <View
      style={[
        avatarStyles.ring,
        {
          width:        size + 4,
          height:       size + 4,
          borderRadius: (size + 4) / 2,
          borderColor:  ringColor,
        },
      ]}
    >
      {photoUri ? (
        <Image
          source={{ uri: photoUri }}
          style={{
            width:        size,
            height:       size,
            borderRadius: size / 2,
          }}
        />
      ) : (
        <View
          style={[
            avatarStyles.fallback,
            { width: size, height: size, borderRadius: size / 2 },
          ]}
        >
          <Text style={[avatarStyles.initial, { fontSize: size * 0.38 }]}>
            {initials}
          </Text>
        </View>
      )}
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  ring: {
    borderWidth:     2,
    padding:         1,
    alignItems:      "center",
    justifyContent:  "center",
  },
  fallback: {
    backgroundColor: "#2C2A1A",
    alignItems:      "center",
    justifyContent:  "center",
  },
  initial: {
    fontWeight: "700",
    color:      "#F5F0E8",
  },
});

// ── Verified badge ────────────────────────────────────────────────────────────

function VerifiedDot() {
  return (
    <View style={badgeStyles.dot}>
      <Text style={badgeStyles.check}>✓</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  dot: {
    width:           14,
    height:          14,
    borderRadius:    7,
    backgroundColor: "#C9933A",
    alignItems:      "center",
    justifyContent:  "center",
    marginLeft:      4,
  },
  check: {
    fontSize:   8,
    fontWeight: "800",
    color:      "#0D0C0B",
    lineHeight: 10,
  },
});

// ── Timestamp ─────────────────────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d    = new Date(iso);
  const now  = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60)   return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  const dayDiff = Math.floor(diff / 86400);
  if (dayDiff === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7)  return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── New-match chip (horizontal strip) ─────────────────────────────────────────

function NewMatchChip({
  item,
  onPress,
}: {
  item: MatchListItem;
  onPress: () => void;
}) {
  const name  = item.otherUser.display_name ?? "…";
  const short = name.split(" ")[0] ?? name;

  return (
    <Pressable
      style={({ pressed }) => [chipStyles.wrap, pressed && chipStyles.pressed]}
      onPress={onPress}
    >
      <UserAvatar user={item.otherUser} size={56} ringColor="#C9933A" />
      <Text style={chipStyles.name} numberOfLines={1}>{short}</Text>
      <Text style={chipStyles.new}>New ✨</Text>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  wrap: {
    alignItems:  "center",
    gap:         4,
    width:       72,
  },
  pressed: {
    opacity: 0.75,
  },
  name: {
    fontSize:   11,
    fontWeight: "600",
    color:      "#F5F0E8",
    textAlign:  "center",
    maxWidth:   68,
  },
  new: {
    fontSize:   9,
    color:      "#C9933A",
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

// ── Conversation row ──────────────────────────────────────────────────────────

function ConversationRow({
  item,
  onPress,
}: {
  item: MatchListItem;
  onPress: () => void;
}) {
  const name    = item.otherUser.display_name ?? "ምሳሌ";
  const preview = item.isNewMatch
    ? "Tap to say hello 👋"
    : (item.lastMessage?.body ?? "");

  return (
    <Pressable
      style={({ pressed }) => [rowStyles.row, pressed && rowStyles.pressed]}
      onPress={onPress}
    >
      {/* Avatar */}
      <UserAvatar
        user={item.otherUser}
        size={52}
        ringColor={item.hasUnread ? "#C9933A" : "transparent"}
      />

      {/* Body */}
      <View style={rowStyles.body}>
        <View style={rowStyles.nameRow}>
          <Text style={rowStyles.name} numberOfLines={1}>
            {name}
          </Text>
          {item.otherUser.is_verified && <VerifiedDot />}
          <Text style={rowStyles.time}>
            {formatTime(item.lastMessageAt ?? item.matchedAt)}
          </Text>
        </View>
        <View style={rowStyles.previewRow}>
          <Text
            style={[
              rowStyles.preview,
              item.hasUnread && rowStyles.previewUnread,
            ]}
            numberOfLines={1}
          >
            {preview}
          </Text>
          {item.hasUnread && <View style={rowStyles.unreadDot} />}
        </View>
      </View>
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems:    "center",
    paddingHorizontal: 20,
    paddingVertical:   14,
    gap:           14,
  },
  pressed: {
    backgroundColor: "#1A1917",
  },
  body: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           0,
  },
  name: {
    fontSize:    15,
    fontWeight:  "700",
    color:       "#F5F0E8",
    flexShrink:  1,
  },
  time: {
    fontSize:   11,
    color:      "#4A4744",
    marginLeft: "auto",
    paddingLeft: 8,
  },
  previewRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  preview: {
    flex:       1,
    fontSize:   13,
    color:      "#7A7066",
    lineHeight: 18,
  },
  previewUnread: {
    color:      "#A09585",
    fontWeight: "500",
  },
  unreadDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: "#C9933A",
    flexShrink:      0,
  },
});

// ── Separator ─────────────────────────────────────────────────────────────────

function Divider() {
  return <View style={{ height: 1, backgroundColor: "#1A1917", marginLeft: 86 }} />;
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyMatches() {
  return (
    <View style={emptyStyles.wrap}>
      <Text style={emptyStyles.icon}>🌙</Text>
      <Text style={emptyStyles.headline}>No matches yet</Text>
      <Text style={emptyStyles.sub}>
        Head to your daily drop and start swiping.{"\n"}
        Mutual likes become conversations here.
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: {
    flex:            1,
    alignItems:      "center",
    justifyContent:  "center",
    paddingHorizontal: 40,
    gap:             12,
    marginTop:       60,
  },
  icon:     { fontSize: 48 },
  headline: { fontSize: 18, fontWeight: "700", color: "#F5F0E8", textAlign: "center" },
  sub:      { fontSize: 13, color: "#7A7066", textAlign: "center", lineHeight: 20 },
});

// ── Main screen ───────────────────────────────────────────────────────────────

export function MatchesList({ onOpenChat }: MatchesListProps) {
  const { matches, loading, error, reload } = useMatches();

  const newMatches   = matches.filter((m) => m.isNewMatch);
  const activeChats  = matches.filter((m) => !m.isNewMatch);
  const unreadCount  = matches.filter((m) => m.hasUnread).length;

  const handleOpen = useCallback(
    (item: MatchListItem) => onOpenChat(item.threadId, item.otherUser),
    [onOpenChat],
  );

  const renderRow = useCallback(
    ({ item }: { item: MatchListItem }) => (
      <ConversationRow item={item} onPress={() => handleOpen(item)} />
    ),
    [handleOpen],
  );

  return (
    <SafeAreaView style={styles.fill}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>ምሳሌ</Text>
        <View style={styles.headerRight}>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
          <Text style={styles.headerTitle}>Conversations</Text>
        </View>
      </View>

      {/* ── Loading ─────────────────────────────────────────────────────── */}
      {loading && (
        <View style={styles.centred}>
          <ActivityIndicator size="large" color="#C9933A" />
        </View>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {!loading && error && (
        <View style={styles.centred}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={reload}>
            <Text style={styles.retryText}>Try Again</Text>
          </Pressable>
        </View>
      )}

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {!loading && !error && (
        <FlatList
          data={activeChats}
          keyExtractor={(item) => item.threadId}
          renderItem={renderRow}
          ItemSeparatorComponent={Divider}
          ListEmptyComponent={newMatches.length === 0 ? <EmptyMatches /> : null}
          ListHeaderComponent={
            newMatches.length > 0 ? (
              <View style={styles.newSection}>
                <Text style={styles.sectionLabel}>New Matches</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.newStrip}
                >
                  {newMatches.map((item) => (
                    <NewMatchChip
                      key={item.threadId}
                      item={item}
                      onPress={() => handleOpen(item)}
                    />
                  ))}
                </ScrollView>
                {activeChats.length > 0 && (
                  <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
                    Messages
                  </Text>
                )}
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fill: {
    flex:            1,
    backgroundColor: "#0D0C0B",
  },

  centred: {
    flex:            1,
    alignItems:      "center",
    justifyContent:  "center",
    gap:             16,
  },

  // ── Header ───────────────────────────────────────────────────────────

  header: {
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 20,
    paddingTop:        14,
    paddingBottom:     12,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1917",
  },
  wordmark: {
    fontSize:      22,
    fontWeight:    "700",
    color:         "#C9933A",
    letterSpacing: 1.5,
  },
  headerRight: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  headerTitle: {
    fontSize:   16,
    fontWeight: "600",
    color:      "#F5F0E8",
  },
  headerBadge: {
    minWidth:        20,
    height:          20,
    borderRadius:    10,
    backgroundColor: "#C9933A",
    alignItems:      "center",
    justifyContent:  "center",
    paddingHorizontal: 5,
  },
  headerBadgeText: {
    fontSize:   11,
    fontWeight: "800",
    color:      "#0D0C0B",
  },

  // ── Error ────────────────────────────────────────────────────────────

  errorText: {
    fontSize:   14,
    color:      "#7A7066",
    textAlign:  "center",
    paddingHorizontal: 32,
  },
  retryBtn: {
    paddingVertical:   10,
    paddingHorizontal: 24,
    borderRadius:      10,
    borderWidth:       1.5,
    borderColor:       "#C9933A",
  },
  retryText: {
    fontSize:   14,
    fontWeight: "600",
    color:      "#C9933A",
  },

  // ── List ─────────────────────────────────────────────────────────────

  listContent: {
    paddingBottom: 24,
  },

  // ── New matches strip ─────────────────────────────────────────────────

  newSection: {
    paddingTop:  16,
    paddingBottom: 4,
  },
  sectionLabel: {
    fontSize:      11,
    fontWeight:    "700",
    color:         "#4A4744",
    letterSpacing: 1.3,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    marginBottom:  12,
  },
  newStrip: {
    paddingHorizontal: 20,
    gap:               16,
    paddingBottom:     4,
  },
});
