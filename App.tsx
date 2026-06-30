/**
 * Misale — Root App Component
 *
 * Loads Noto Serif Ethiopic (for Ge'ez/Amharic strings) and wraps
 * the onboarding flow in the shared state provider.
 */

import {
  NotoSerifEthiopic_400Regular,
  NotoSerifEthiopic_700Bold,
  useFonts,
} from "@expo-google-fonts/noto-serif-ethiopic";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OnboardingProvider } from "./src/context/OnboardingContext";
import { OnboardingNavigator } from "./src/screens/onboarding";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSerifEthiopic_400Regular,
    NotoSerifEthiopic_700Bold,
  });

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

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <OnboardingProvider>
          <OnboardingNavigator />
        </OnboardingProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
