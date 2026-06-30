/**
 * Misale — Root App Component
 *
 * Auth-aware root:
 *   loading  → splash / spinner
 *   session  → MainApp (tab navigator: Discover | Matches | Profile)
 *   no session → OnboardingFlow (Phone OTP → BasicInfo → Cultural → Location)
 */

import {
  NotoSerifEthiopic_400Regular,
  NotoSerifEthiopic_700Bold,
  useFonts,
} from "@expo-google-fonts/noto-serif-ethiopic";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./src/lib/supabase";
import { OnboardingProvider } from "./src/context/OnboardingContext";
import { OnboardingNavigator } from "./src/screens/onboarding";
import { MainApp } from "./src/screens/main/MainApp";

SplashScreen.preventAutoHideAsync();

// ── Auth state ────────────────────────────────────────────────────────────────

type AppView = "loading" | "onboarding" | "main";

function resolveView(session: Session | null): AppView {
  if (!session) return "onboarding";
  return "main";
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSerifEthiopic_400Regular,
    NotoSerifEthiopic_700Bold,
  });

  const [view, setView] = useState<AppView>("loading");

  // Resolve auth once on mount, then listen for changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setView(resolveView(session));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setView(resolveView(session));
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  const handleSignOut = () => setView("onboarding");
  const handleOnboardingComplete = () => setView("main");

  return (
    <GestureHandlerRootView style={styles.root} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <StatusBar style="light" />

        {view === "loading" && (
          <View style={styles.splash}>
            <ActivityIndicator size="large" color="#C9933A" />
          </View>
        )}

        {view === "onboarding" && (
          <OnboardingProvider onComplete={handleOnboardingComplete}>
            <OnboardingNavigator />
          </OnboardingProvider>
        )}

        {view === "main" && (
          <MainApp onSignOut={handleSignOut} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  splash: { flex: 1, backgroundColor: "#0D0C0B", alignItems: "center", justifyContent: "center" },
});
