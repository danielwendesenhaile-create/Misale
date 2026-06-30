/**
 * OnboardingNavigator
 *
 * Renders the correct screen based on OnboardingContext.state.step.
 * Uses a single-screen swap model (no React Navigation stack needed
 * for the onboarding phase) — the step transition is handled by the context.
 */

import React from "react";
import { useOnboarding } from "../../context/OnboardingContext";
import { PhoneOtpScreen }  from "./PhoneOtpScreen";
import { BasicInfoScreen } from "./BasicInfoScreen";
import { CulturalScreen }  from "./CulturalScreen";
import { LocationScreen }  from "./LocationScreen";

export function OnboardingNavigator() {
  const { state } = useOnboarding();

  switch (state.step) {
    case "phone":
      return <PhoneOtpScreen />;
    case "basicInfo":
      return <BasicInfoScreen />;
    case "cultural":
      return <CulturalScreen />;
    case "location":
      return <LocationScreen />;
    default: {
      // Exhaustive type guard — TypeScript will error here if a new step is
      // added to OnboardingStep without a case above.
      const _exhaustive: never = state.step;
      return _exhaustive;
    }
  }
}
