import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "gold" | "outline" | "ghost";
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "gold",
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === "gold"    && styles.gold,
        variant === "outline" && styles.outline,
        variant === "ghost"   && styles.ghost,
        isDisabled            && styles.disabled,
        pressed               && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "gold" ? "#0D0C0B" : "#C9933A"}
        />
      ) : (
        <Text
          style={[
            styles.label,
            variant === "gold"    && styles.labelGold,
            variant === "outline" && styles.labelOutline,
            variant === "ghost"   && styles.labelGhost,
            isDisabled            && styles.labelDisabled,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

// Inline style fallback (NativeWind classes applied via className on screens)
const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  gold: {
    backgroundColor: "#C9933A",
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#C9933A",
  },
  ghost: {
    backgroundColor: "transparent",
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  labelGold: {
    color: "#0D0C0B",
  },
  labelOutline: {
    color: "#C9933A",
  },
  labelGhost: {
    color: "#7A7066",
  },
  labelDisabled: {
    opacity: 0.6,
  },
});

// Re-export a loading overlay for use in screens
export function LoadingOverlay() {
  return (
    <View style={overlayStyles.backdrop} pointerEvents="none">
      <View style={overlayStyles.card}>
        <ActivityIndicator size="large" color="#C9933A" />
      </View>
    </View>
  );
}

const overlayStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(13,12,11,0.7)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99,
  },
  card: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "#1A1917",
    alignItems: "center",
    justifyContent: "center",
  },
});
