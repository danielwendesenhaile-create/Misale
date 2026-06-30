/**
 * BottomSheetModal
 *
 * Custom Modal-based bottom sheet — no native module dependencies.
 * Used by CulturalScreen for religion and language selection.
 */

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_H = SCREEN_H * 0.55;

export interface PickerOption {
  label: string;
  value: string;
  emoji?: string;
}

interface BottomSheetModalProps {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedValues: string[];
  multiSelect?: boolean;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function BottomSheetModal({
  visible,
  title,
  options,
  selectedValues,
  multiSelect = false,
  onSelect,
  onClose,
}: BottomSheetModalProps) {
  const slideAnim = useRef(new Animated.Value(SHEET_H)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 180,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SHEET_H,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleSelect = (value: string) => {
    onSelect(value);
    if (!multiSelect) onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.doneBtn}>
              {multiSelect ? "Done" : "✕"}
            </Text>
          </Pressable>
        </View>

        {/* Options list */}
        <FlatList
          data={options}
          keyExtractor={(item) => item.value}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const selected = selectedValues.includes(item.value);
            return (
              <Pressable
                onPress={() => handleSelect(item.value)}
                style={({ pressed }) => [
                  styles.option,
                  selected && styles.optionSelected,
                  pressed  && styles.optionPressed,
                ]}
              >
                <View style={styles.optionLeft}>
                  {item.emoji != null && (
                    <Text style={styles.emoji}>{item.emoji}</Text>
                  )}
                  <Text
                    style={[
                      styles.optionLabel,
                      selected && styles.optionLabelSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
                {selected && (
                  <View style={styles.checkDot} />
                )}
              </Pressable>
            );
          }}
        />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_H,
    backgroundColor: "#1A1917",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3A3835",
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2E2B28",
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: "#F5F0E8",
    letterSpacing: 0.2,
  },
  doneBtn: {
    fontSize: 15,
    fontWeight: "600",
    color: "#C9933A",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginVertical: 3,
  },
  optionSelected: {
    backgroundColor: "rgba(201,147,58,0.12)",
  },
  optionPressed: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emoji: {
    fontSize: 20,
  },
  optionLabel: {
    fontSize: 16,
    color: "#BDB8B0",
    fontWeight: "400",
  },
  optionLabelSelected: {
    color: "#D4A843",
    fontWeight: "600",
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#C9933A",
  },
});
