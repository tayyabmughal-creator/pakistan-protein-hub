import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { GlassPanel } from "./GlassPanel";
import { colors, gradients, spacing, typography } from "../theme/tokens";

type MetricCardProps = {
  label: string;
  value: string | number;
  caption?: string;
  icon?: ReactNode;
  accent?: "primary" | "accent";
};

export const MetricCard = ({
  label,
  value,
  caption,
  icon,
  accent = "primary",
}: MetricCardProps) => (
  <GlassPanel style={styles.card}>
    <LinearGradient
      colors={accent === "primary" ? gradients.primary : gradients.accent}
      style={styles.topEdge}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
    />
    <LinearGradient
      colors={accent === "primary" ? gradients.primary : gradients.accent}
      style={styles.iconBubble}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {icon}
    </LinearGradient>
    <Text style={styles.label}>{label}</Text>
    <Text adjustsFontSizeToFit minimumFontScale={0.76} numberOfLines={1} style={styles.value}>
      {value}
    </Text>
    {caption ? <Text style={styles.caption}>{caption}</Text> : null}
  </GlassPanel>
);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 150,
    padding: spacing.md,
    paddingTop: spacing.lg,
    gap: 12,
    position: "relative",
  },
  topEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  iconBubble: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  value: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 30,
    letterSpacing: -1,
    flexShrink: 1,
    includeFontPadding: false,
  },
  caption: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
});
