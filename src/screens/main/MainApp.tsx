/**
 * MainApp — post-onboarding shell.
 *
 * Renders a custom bottom tab bar (Discover | Matches | Profile) and
 * a full-screen ChatScreen overlay that slides in from Matches.
 */

import React, { useCallback, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { DailyDropDeck } from "../discovery/DailyDropDeck";
import { MatchesList } from "../chat/MatchesList";
import { ChatScreen } from "../chat/ChatScreen";
import { ProfileScreen } from "../profile/ProfileScreen";
import type { MatchedUser } from "../../types/chat";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "discover" | "matches" | "profile";

interface ChatState {
  threadId: string;
  otherUser: MatchedUser;
}

interface MainAppProps {
  onSignOut: () => void;
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

interface TabBarProps {
  active: Tab;
  onSelect: (tab: Tab) => void;
}

function TabBar({ active, onSelect }: TabBarProps) {
  const insets = useSafeAreaInsets();

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: "discover", icon: "✦",  label: "Discover" },
    { id: "matches",  icon: "💬", label: "Matches"  },
    { id: "profile",  icon: "◉",  label: "Profile"  },
  ];

  return (
    <View style={[tabStyles.bar, { paddingBottom: insets.bottom + 8 }]}>
      {tabs.map((t) => (
        <Pressable
          key={t.id}
          onPress={() => onSelect(t.id)}
          style={({ pressed }) => [tabStyles.tab, pressed && tabStyles.tabPressed]}
        >
          <Text style={[tabStyles.icon, active === t.id && tabStyles.iconActive]}>
            {t.icon}
          </Text>
          <Text style={[tabStyles.label, active === t.id && tabStyles.labelActive]}>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "#111010",
    borderTopWidth: 1,
    borderTopColor: "#1E1C1A",
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  tabPressed: { opacity: 0.6 },
  icon:        { fontSize: 20, color: "#4A4744" },
  iconActive:  { color: "#C9933A" },
  label:       { fontSize: 10, fontWeight: "600", color: "#4A4744", letterSpacing: 0.4 },
  labelActive: { color: "#C9933A" },
});

// ── Main ──────────────────────────────────────────────────────────────────────

export function MainApp({ onSignOut }: MainAppProps) {
  const [activeTab, setActiveTab] = useState<Tab>("discover");
  const [chat, setChat] = useState<ChatState | null>(null);

  const openChat = useCallback((threadId: string, otherUser: MatchedUser) => {
    setChat({ threadId, otherUser });
  }, []);

  const openChatFromDeck = useCallback((threadId: string) => {
    // DailyDropDeck doesn't pass otherUser — navigate to matches tab so user
    // can tap the matched person from there.
    setActiveTab("matches");
  }, []);

  const closeChat = useCallback(() => setChat(null), []);

  // ChatScreen overlays everything
  if (chat) {
    return (
      <SafeAreaProvider>
        <ChatScreen chatThreadId={chat.threadId} onBack={closeChat} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <View style={styles.content}>
          {activeTab === "discover" && (
            <DailyDropDeck onOpenChat={openChatFromDeck} />
          )}
          {activeTab === "matches" && (
            <MatchesList onOpenChat={openChat} />
          )}
          {activeTab === "profile" && (
            <ProfileScreen onSignOut={onSignOut} />
          )}
        </View>
        <TabBar active={activeTab} onSelect={setActiveTab} />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#0D0C0B" },
  content: { flex: 1 },
});
