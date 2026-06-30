/**
 * OnboardingContext
 *
 * Single source of truth for the 4-step onboarding flow.
 * Collected in one place so the final step can compile a complete
 * Supabase update payload without prop-drilling.
 *
 * Step progression: phone → basicInfo → cultural → location (submit)
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useReducer,
} from "react";
import { supabase } from "../lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OnboardingStep = "phone" | "basicInfo" | "cultural" | "location";

export type GenderType = "male" | "female" | "non_binary" | "prefer_not_to_say";

export type ReligionType =
  | "Orthodox"
  | "Protestant"
  | "Catholic"
  | "Muslim"
  | "Other"
  | "None";

export type LocationTierType = "Local_Ethiopia" | "Diaspora";

export interface OnboardingState {
  step: OnboardingStep;
  userId: string | null;

  // Screen A — Phone OTP
  phone: string;

  // Screen B — Basic info
  fullName: string;
  dateOfBirth: Date | null;
  gender: GenderType | null;

  // Screen C — Cultural
  religion: ReligionType | null;
  languages: string[];
  strictReligiousAlignment: boolean;

  // Screen D — Location
  locationTier: LocationTierType | null;
  country: string | null;
  city: string | null;

  // Submission state
  submitting: boolean;
  submitError: string | null;
}

type OnboardingAction =
  | { type: "SET_STEP"; payload: OnboardingStep }
  | { type: "SET_USER_ID"; payload: string }
  | { type: "SET_PHONE"; payload: string }
  | { type: "SET_FULL_NAME"; payload: string }
  | { type: "SET_DATE_OF_BIRTH"; payload: Date }
  | { type: "SET_GENDER"; payload: GenderType }
  | { type: "SET_RELIGION"; payload: ReligionType }
  | { type: "TOGGLE_LANGUAGE"; payload: string }
  | { type: "SET_STRICT_ALIGNMENT"; payload: boolean }
  | { type: "SET_LOCATION_TIER"; payload: LocationTierType }
  | { type: "SET_COUNTRY"; payload: string }
  | { type: "SET_CITY"; payload: string }
  | { type: "SUBMIT_START" }
  | { type: "SUBMIT_SUCCESS" }
  | { type: "SUBMIT_ERROR"; payload: string };

// ── Initial state ─────────────────────────────────────────────────────────────

const initialState: OnboardingState = {
  step: "phone",
  userId: null,
  phone: "",
  fullName: "",
  dateOfBirth: null,
  gender: null,
  religion: null,
  languages: [],
  strictReligiousAlignment: false,
  locationTier: null,
  country: null,
  city: null,
  submitting: false,
  submitError: null,
};

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(
  state: OnboardingState,
  action: OnboardingAction,
): OnboardingState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.payload };
    case "SET_USER_ID":
      return { ...state, userId: action.payload };
    case "SET_PHONE":
      return { ...state, phone: action.payload };
    case "SET_FULL_NAME":
      return { ...state, fullName: action.payload };
    case "SET_DATE_OF_BIRTH":
      return { ...state, dateOfBirth: action.payload };
    case "SET_GENDER":
      return { ...state, gender: action.payload };
    case "SET_RELIGION":
      return { ...state, religion: action.payload };
    case "TOGGLE_LANGUAGE": {
      const exists = state.languages.includes(action.payload);
      return {
        ...state,
        languages: exists
          ? state.languages.filter((l) => l !== action.payload)
          : [...state.languages, action.payload],
      };
    }
    case "SET_STRICT_ALIGNMENT":
      return { ...state, strictReligiousAlignment: action.payload };
    case "SET_LOCATION_TIER":
      return {
        ...state,
        locationTier: action.payload,
        // Reset location fields when tier changes
        country: null,
        city: null,
      };
    case "SET_COUNTRY":
      return { ...state, country: action.payload };
    case "SET_CITY":
      return { ...state, city: action.payload };
    case "SUBMIT_START":
      return { ...state, submitting: true, submitError: null };
    case "SUBMIT_SUCCESS":
      return { ...state, submitting: false };
    case "SUBMIT_ERROR":
      return { ...state, submitting: false, submitError: action.payload };
    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface OnboardingContextValue {
  state: OnboardingState;
  dispatch: React.Dispatch<OnboardingAction>;
  goToStep: (step: OnboardingStep) => void;
  submitProfile: () => Promise<boolean>;
  onComplete: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function OnboardingProvider({
  children,
  onComplete = () => {},
}: {
  children: React.ReactNode;
  onComplete?: () => void;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const goToStep = useCallback((step: OnboardingStep) => {
    dispatch({ type: "SET_STEP", payload: step });
  }, []);

  /**
   * Compiles the full profile payload and PATCHes the users row.
   * Called from LocationScreen (step 4) after all fields are confirmed.
   * Returns true on success, false on validation/API failure.
   */
  const submitProfile = useCallback(async (): Promise<boolean> => {
    if (!state.userId) {
      dispatch({ type: "SUBMIT_ERROR", payload: "Session lost — please sign in again." });
      return false;
    }

    // Guard: all required fields must be present
    if (
      !state.fullName.trim() ||
      !state.dateOfBirth ||
      !state.gender ||
      state.languages.length === 0 ||
      !state.locationTier
    ) {
      dispatch({
        type: "SUBMIT_ERROR",
        payload: "Please complete all required fields before submitting.",
      });
      return false;
    }

    dispatch({ type: "SUBMIT_START" });

    try {
      const payload = {
        full_name:                   state.fullName.trim(),
        date_of_birth:               state.dateOfBirth.toISOString().split("T")[0],
        gender:                      state.gender,
        religion:                    state.religion ?? null,
        strict_religious_alignment:  state.strictReligiousAlignment,
        languages:                   state.languages,
        location_tier:               state.locationTier,
        country:                     state.country ?? null,
        city:                        state.city ?? null,
        phone_verified:              true,
        last_active_at:              new Date().toISOString(),
      };

      const { error } = await supabase
        .from("users")
        .update(payload)
        .eq("id", state.userId);

      if (error) throw error;

      dispatch({ type: "SUBMIT_SUCCESS" });
      return true;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      dispatch({ type: "SUBMIT_ERROR", payload: message });
      return false;
    }
  }, [state]);

  return (
    <OnboardingContext.Provider value={{ state, dispatch, goToStep, submitProfile, onComplete }}>
      {children}
    </OnboardingContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within <OnboardingProvider>");
  }
  return ctx;
}
