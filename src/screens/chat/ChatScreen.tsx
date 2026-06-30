/**
 * ChatScreen — real-time 1:1 message interface.
 *
 * Architecture:
 *  - FlatList with inverted={true} so new messages stream in from the bottom.
 *  - useChat() manages server messages + pending optimistic messages.
 *  - KeyboardAvoidingView wraps the FlatList + input bar (not the header) so
 *    the header never jumps on keyboard open, and the input bar always sits
 *    just above the keyboard on both iOS (padding) and Android (height).
 *  - Pending messages render at low opacity with a micro spinner.
 *  - Failed messages show a ⚠ indicator.
 *  - Ge'ez / Amharic text: lineHeight + includeFontPadding:false prevent clip.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useChat } from "../../hooks/useChat";
import type { ChatMessage, MatchedUser } from "../../types/chat";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ChatScreenProps {
  chatThreadId: string;
  onBack:       () => void;
}

// ── Avatar (header) ───────────────────────────────────────────────────────────

function HeaderAvatar({ user }: { user: MatchedUser }) {
  const initials = (user.display_name ?? "?")[0]!.toUpperCase();
  const photoUri = user.profile_photos[0];

  if (photoUri) {
    return (
      <Image
        source={{ uri: photoUri }}
        style={headerStyles.avatar}
      />
    );
  }
  return (
    <View style={[headerStyles.avatar, headerStyles.avatarFallback]}>
      <Text style={headerStyles.avatarInitial}>{initials}</Text>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  avatar: {
    width:        36,
    height:       36,
    borderRadius: 18,
  },
  avatarFallback: {
    backgroundColor: "#2C2A1A",
    alignItems:      "center",
    justifyContent:  "center",
  },
  avatarInitial: {
    fontSize:   14,
    fontWeight: "700",
    color:      "#F5F0E8",
  },
});

// ── Message bubble ────────────────────────────────────────────────────────────

interface BubbleProps {
  msg:  ChatMessage;
  isMe: boolean;
}

function MessageBubble({ msg, isMe }: BubbleProps) {
  const isFailed  = msg.status === "failed";
  const isSending = msg.status === "sending";

  const time = new Date(msg.sent_at).toLocaleTimeString([], {
    hour:   "2-digit",
    minute: "2-digit",
  });

  return (
    <View
      style={[
        bubbleStyles.wrapper,
        isMe ? bubbleStyles.wrapperMe : bubbleStyles.wrapperThem,
      ]}
    >
      <View
        style={[
          bubbleStyles.bubble,
          isMe   && bubbleStyles.bubbleMe,
          !isMe  && bubbleStyles.bubbleThem,
          isFailed && bubbleStyles.bubbleFailed,
          isSending && bubbleStyles.bubbleSending,
        ]}
      >
        <Text
          style={[
            bubbleStyles.body,
            isMe ? bubbleStyles.bodyMe : bubbleStyles.bodyThem,
          ]}
        >
          {msg.body}
        </Text>
      </View>

      {/* Timestamp row */}
      <View
        style={[
          bubbleStyles.meta,
          isMe ? bubbleStyles.metaMe : bubbleStyles.metaThem,
        ]}
      >
        {isSending && (
          <ActivityIndicator
            size="small"
            color="#7A7066"
            style={bubbleStyles.spinner}
          />
        )}
        {isFailed && <Text style={bubbleStyles.failedIcon}>⚠</Text>}
        <Text style={bubbleStyles.time}>{time}</Text>
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    marginVertical:    3,
  },
  wrapperMe:   { alignItems: "flex-end"  },
  wrapperThem: { alignItems: "flex-start" },

  bubble: {
    maxWidth:          "75%",
    borderRadius:      18,
    paddingHorizontal: 14,
    paddingVertical:   10,
  },
  bubbleMe: {
    backgroundColor:      "#2C2014",
    borderWidth:          1,
    borderColor:          "#4A3820",
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor:     "#1F1E1C",
    borderWidth:         1,
    borderColor:         "#2E2B28",
    borderBottomLeftRadius: 4,
  },
  bubbleFailed: {
    borderColor: "#8B2020",
    opacity:     0.85,
  },
  bubbleSending: {
    opacity: 0.65,
  },

  body: {
    fontSize:           15,
    lineHeight:         22,
    includeFontPadding: false,
  },
  bodyMe:   { color: "#F5F0E8" },
  bodyThem: { color: "#D4CFC8" },

  meta: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           4,
    marginTop:     3,
    paddingHorizontal: 4,
  },
  metaMe:   { justifyContent: "flex-end"  },
  metaThem: { justifyContent: "flex-start" },

  time: {
    fontSize: 10,
    color:    "#4A4744",
  },
  spinner: {
    width:  12,
    height: 12,
    transform: [{ scale: 0.6 }],
  },
  failedIcon: {
    fontSize: 10,
    color:    "#8B2020",
  },
});

// ── Empty thread state ────────────────────────────────────────────────────────

function EmptyThread({ name }: { name: string }) {
  return (
    <View style={emptyStyles.wrap}>
      <Text style={emptyStyles.icon}>💛</Text>
      <Text style={emptyStyles.headline}>You matched with {name}!</Text>
      <Text style={emptyStyles.sub}>
        Send a message and start your story.
      </Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: {
    // FlatList is inverted — this renders at the visual bottom
    flex:            1,
    alignItems:      "center",
    justifyContent:  "flex-end",
    paddingBottom:   40,
    paddingHorizontal: 32,
    gap:             10,
  },
  icon:     { fontSize: 40 },
  headline: { fontSize: 16, fontWeight: "700", color: "#F5F0E8", textAlign: "center" },
  sub:      { fontSize: 13, color:  "#7A7066", textAlign: "center", lineHeight: 20 },
});

// ── Date separator ────────────────────────────────────────────────────────────

function DateSeparator({ isoDate }: { isoDate: string }) {
  const label = new Date(isoDate).toLocaleDateString([], {
    weekday: "short",
    month:   "short",
    day:     "numeric",
  });
  return (
    <View style={sepStyles.row}>
      <View style={sepStyles.line} />
      <Text style={sepStyles.label}>{label}</Text>
      <View style={sepStyles.line} />
    </View>
  );
}

const sepStyles = StyleSheet.create({
  row: {
    flexDirection:     "row",
    alignItems:        "center",
    marginVertical:    12,
    paddingHorizontal: 20,
    gap:               10,
  },
  line:  { flex: 1, height: 1, backgroundColor: "#1A1917" },
  label: { fontSize: 10, color: "#4A4744", fontWeight: "600", letterSpacing: 0.8 },
});

// ── Input bar ─────────────────────────────────────────────────────────────────

interface InputBarProps {
  onSend: (text: string) => void;
}

function InputBar({ onSend }: InputBarProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    onSend(trimmed);
    inputRef.current?.focus();
  }, [text, onSend]);

  const canSend = text.trim().length > 0;

  return (
    <View style={inputStyles.bar}>
      <TextInput
        ref={inputRef}
        style={inputStyles.input}
        placeholder="Type a message…"
        placeholderTextColor="#4A4744"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={1000}
        returnKeyType="default"
        blurOnSubmit={false}
        // Prevent keyboard dismiss on newline in multiline mode
        textAlignVertical="center"
      />
      <Pressable
        style={({ pressed }) => [
          inputStyles.sendBtn,
          !canSend && inputStyles.sendBtnDisabled,
          pressed && canSend && inputStyles.sendBtnPressed,
        ]}
        onPress={handleSend}
        disabled={!canSend}
      >
        <Text style={[inputStyles.sendIcon, !canSend && inputStyles.sendIconDisabled]}>
          ➤
        </Text>
      </Pressable>
    </View>
  );
}

const inputStyles = StyleSheet.create({
  bar: {
    flexDirection:     "row",
    alignItems:        "flex-end",
    paddingHorizontal: 16,
    paddingVertical:   10,
    paddingBottom:     14,
    borderTopWidth:    1,
    borderTopColor:    "#1A1917",
    backgroundColor:   "#0D0C0B",
    gap:               10,
  },
  input: {
    flex:              1,
    backgroundColor:   "#1A1917",
    borderRadius:      22,
    paddingHorizontal: 18,
    paddingVertical:   10,
    fontSize:          15,
    lineHeight:        22,
    color:             "#F5F0E8",
    maxHeight:         120,
    borderWidth:       1,
    borderColor:       "#2E2B28",
    includeFontPadding: false,
  },
  sendBtn: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: "#C9933A",
    alignItems:      "center",
    justifyContent:  "center",

    shadowColor:   "#C9933A",
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius:  6,
    elevation:     4,
  },
  sendBtnDisabled: {
    backgroundColor: "#2E2B28",
    shadowOpacity:   0,
    elevation:       0,
  },
  sendBtnPressed: {
    opacity:   0.8,
    transform: [{ scale: 0.95 }],
  },
  sendIcon: {
    fontSize:   18,
    color:      "#0D0C0B",
    fontWeight: "800",
    lineHeight: 22,
  },
  sendIconDisabled: {
    color: "#4A4744",
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ChatScreen({ chatThreadId, onBack }: ChatScreenProps) {
  const { messages, otherUser, myId, loading, error, sendMessage } =
    useChat(chatThreadId);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Auto-scroll to bottom when a new outbound message is added
  useEffect(() => {
    if (messages.length > 0 && messages[0]?.sender_id === myId) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [messages, myId]);

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const isMe = item.sender_id === myId;

      // FlatList is inverted: index 0 = newest. The "previous" visible
      // message is at index + 1 (older).
      const nextItem = messages[index + 1];
      const showSep =
        nextItem != null && !sameDay(item.sent_at, nextItem.sent_at);

      return (
        <>
          <MessageBubble msg={item} isMe={isMe} />
          {showSep && <DateSeparator isoDate={nextItem.sent_at} />}
        </>
      );
    },
    [myId, messages],
  );

  const keyExtractor = useCallback((item: ChatMessage) => item.local_id, []);

  const name = otherUser?.display_name ?? "…";

  return (
    <SafeAreaView style={styles.fill}>
      {/* ── Header — always visible above the keyboard ──────────────────── */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backPressed]}
          onPress={onBack}
          hitSlop={12}
        >
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>

        {otherUser && <HeaderAvatar user={otherUser} />}

        <View style={styles.headerNameWrap}>
          <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
          {otherUser?.is_verified && (
            <View style={styles.verifiedDot}>
              <Text style={styles.verifiedCheck}>✓</Text>
            </View>
          )}
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
        </View>
      )}

      {/* ── Chat area — KeyboardAvoidingView wraps messages + input only ── */}
      {!loading && !error && (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {/* Messages list */}
          <FlatList
            ref={listRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            inverted
            ListEmptyComponent={
              otherUser ? <EmptyThread name={name} /> : null
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            // Optimize rendering
            removeClippedSubviews
            maxToRenderPerBatch={20}
            windowSize={10}
          />

          {/* Input bar */}
          <InputBar onSend={sendMessage} />
        </KeyboardAvoidingView>
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
  flex: {
    flex: 1,
  },
  centred: {
    flex:           1,
    alignItems:     "center",
    justifyContent: "center",
  },

  // ── Header ───────────────────────────────────────────────────────────

  header: {
    flexDirection:     "row",
    alignItems:        "center",
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: "#1A1917",
    gap:               10,
    backgroundColor:   "#0D0C0B",
  },
  backBtn: {
    width:          36,
    height:         36,
    alignItems:     "center",
    justifyContent: "center",
  },
  backPressed: {
    opacity: 0.6,
  },
  backIcon: {
    fontSize:   28,
    color:      "#F5F0E8",
    lineHeight: 32,
    fontWeight: "300",
  },
  headerNameWrap: {
    flex:          1,
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
  },
  headerName: {
    fontSize:   17,
    fontWeight: "700",
    color:      "#F5F0E8",
    flexShrink: 1,
  },
  verifiedDot: {
    width:           16,
    height:          16,
    borderRadius:    8,
    backgroundColor: "#C9933A",
    alignItems:      "center",
    justifyContent:  "center",
    flexShrink:      0,
  },
  verifiedCheck: {
    fontSize:   9,
    fontWeight: "800",
    color:      "#0D0C0B",
    lineHeight: 11,
  },

  // ── Error ────────────────────────────────────────────────────────────

  errorText: {
    fontSize:          14,
    color:             "#7A7066",
    textAlign:         "center",
    paddingHorizontal: 32,
  },

  // ── Messages ─────────────────────────────────────────────────────────

  listContent: {
    paddingTop:    12,
    paddingBottom: 8,
    flexGrow:      1,
  },
});
