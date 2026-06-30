/**
 * Cultural badge components for the profile card.
 *
 * ReligionBadge  — faith icon + label
 * LocationBadge  — tier flag + city / country
 * LanguageTags   — pill per spoken language
 * VerifiedBadge  — gold checkmark when is_verified
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type {
  LocationTierType,
  ReligionType,
} from "../../../types/discovery";

// ── Data maps ─────────────────────────────────────────────────────────────────

const RELIGION_META: Record<ReligionType, { emoji: string; label: string }> = {
  Orthodox:   { emoji: "✝",  label: "Orthodox" },
  Protestant: { emoji: "✟",  label: "Protestant" },
  Catholic:   { emoji: "⛪", label: "Catholic" },
  Muslim:     { emoji: "☪",  label: "Muslim" },
  Other:      { emoji: "🕊",  label: "Faith" },
  None:       { emoji: "·",   label: "No faith" },
};

const LANGUAGE_NATIVE: Record<string, string> = {
  Amharic:  "አማርኛ",
  Tigrinya: "ትግርኛ",
  Oromo:    "Afaan Oromoo",
  English:  "English",
};

// Country → emoji flag (common diaspora destinations)
const COUNTRY_FLAG: Record<string, string> = {
  "United States":  "🇺🇸",
  "Canada":         "🇨🇦",
  "United Kingdom": "🇬🇧",
  "Sweden":         "🇸🇪",
  "Norway":         "🇳🇴",
  "Germany":        "🇩🇪",
  "Netherlands":    "🇳🇱",
  "Italy":          "🇮🇹",
  "Australia":      "🇦🇺",
  "UAE":            "🇦🇪",
  "Saudi Arabia":   "🇸🇦",
  "Israel":         "🇮🇱",
  "South Africa":   "🇿🇦",
  "Kenya":          "🇰🇪",
  "Sudan":          "🇸🇩",
};

// ── Components ────────────────────────────────────────────────────────────────

interface ReligionBadgeProps {
  religion: ReligionType | null;
}

export function ReligionBadge({ religion }: ReligionBadgeProps) {
  if (!religion || religion === "None") return null;
  const meta = RELIGION_META[religion];
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeEmoji}>{meta.emoji}</Text>
      <Text style={styles.badgeText}>{meta.label}</Text>
    </View>
  );
}

interface LocationBadgeProps {
  locationTier: LocationTierType;
  country: string | null;
  city: string | null;
}

export function LocationBadge({ locationTier, country, city }: LocationBadgeProps) {
  const isEthiopia = locationTier === "Local_Ethiopia";
  const flag  = isEthiopia ? "🇪🇹" : (country ? (COUNTRY_FLAG[country] ?? "🌍") : "🌍");
  const place = isEthiopia ? (city ?? "Ethiopia") : (country ?? "International");

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeEmoji}>{flag}</Text>
      <Text style={styles.badgeText}>{place}</Text>
    </View>
  );
}

interface LanguageTagsProps {
  languages: string[];
  /** Limit rendered tags to avoid overflow on small cards */
  maxVisible?: number;
}

export function LanguageTags({ languages, maxVisible = 3 }: LanguageTagsProps) {
  if (languages.length === 0) return null;
  const visible  = languages.slice(0, maxVisible);
  const overflow = languages.length - visible.length;

  return (
    <View style={styles.langRow}>
      {visible.map((lang) => (
        <View key={lang} style={styles.langTag}>
          <Text style={styles.langText}>
            {LANGUAGE_NATIVE[lang] ?? lang}
          </Text>
        </View>
      ))}
      {overflow > 0 && (
        <View style={styles.langTag}>
          <Text style={styles.langText}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
}

export function VerifiedBadge() {
  return (
    <View style={styles.verifiedBadge}>
      <Text style={styles.verifiedIcon}>✓</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(13,12,11,0.55)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  badgeEmoji: {
    fontSize: 13,
    lineHeight: 16,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#F5F0E8",
    letterSpacing: 0.1,
  },

  langRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  langTag: {
    backgroundColor: "rgba(201,147,58,0.22)",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(201,147,58,0.4)",
  },
  langText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#D4A843",
    letterSpacing: 0.2,
  },

  verifiedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#C9933A",
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedIcon: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0D0C0B",
    lineHeight: 15,
  },
});
