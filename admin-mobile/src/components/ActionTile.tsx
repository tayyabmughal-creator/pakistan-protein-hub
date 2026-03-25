import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

import { colors, gradients, radii, spacing, typography } from "../theme/tokens";

type ActionTileProps = {
  title: string;
  description: string;
  icon: ReactNode;
  onPress: () => void;
  accent?: "primary" | "accent";
};

export const ActionTile = ({
  title,
  description,
  icon,
  onPress,
  accent = "primary",
}: ActionTileProps) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.pressable, pressed ? styles.pressed : null]}>
    <LinearGradient
      colors={accent === "primary" ? gradients.primary : gradients.accent}
      style={styles.iconWrap}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {icon}
    </LinearGradient>
    <View style={styles.copy}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
    <View style={styles.chevronWrap}>
      <Ionicons name="arrow-forward" size={16} color={colors.text} />
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  pressable: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.overlay,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
  },
  pressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
  },
  description: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18,
  },
  chevronWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fieldStrong,
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
});
