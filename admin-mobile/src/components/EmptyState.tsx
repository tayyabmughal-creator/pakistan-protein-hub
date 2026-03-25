import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { GlassPanel } from "./GlassPanel";
import { colors, spacing, typography } from "../theme/tokens";

type EmptyStateProps = {
  title: string;
  description: string;
  icon?: ReactNode;
};

export const EmptyState = ({ title, description, icon }: EmptyStateProps) => (
  <GlassPanel style={styles.panel}>
    {icon ? <View style={styles.icon}>{icon}</View> : null}
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.description}>{description}</Text>
  </GlassPanel>
);

const styles = StyleSheet.create({
  panel: {
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  icon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    backgroundColor: colors.fieldStrong,
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
  title: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18,
  },
  description: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
