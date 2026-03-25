import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "../theme/tokens";

type SectionTitleProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  accessory?: ReactNode;
};

export const SectionTitle = ({
  title,
  subtitle,
  actionLabel,
  onActionPress,
  accessory,
}: SectionTitleProps) => (
  <View style={styles.row}>
    <View style={styles.copy}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
    {accessory}
    {actionLabel && onActionPress ? (
      <Pressable onPress={onActionPress}>
        <Text style={styles.action}>{actionLabel}</Text>
      </Pressable>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 19,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18,
  },
  action: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: colors.primarySoft,
  },
});
