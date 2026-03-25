import { StyleSheet, Text, View } from "react-native";

import { colors, typography } from "../theme/tokens";

const palette: Record<string, { backgroundColor: string; borderColor: string; color: string }> = {
  PENDING: { backgroundColor: colors.warningSoft, borderColor: "rgba(245,158,11,0.24)", color: colors.warning },
  CONFIRMED: { backgroundColor: colors.accentSoft, borderColor: "rgba(45,212,191,0.24)", color: colors.accent },
  SHIPPED: { backgroundColor: colors.infoSoft, borderColor: "rgba(96,165,250,0.24)", color: colors.info },
  DELIVERED: { backgroundColor: "rgba(74,222,128,0.14)", borderColor: "rgba(74,222,128,0.24)", color: colors.success },
  CANCELLED: { backgroundColor: colors.dangerSoft, borderColor: "rgba(251,113,133,0.24)", color: colors.danger },
  PAID: { backgroundColor: "rgba(74,222,128,0.14)", borderColor: "rgba(74,222,128,0.24)", color: colors.success },
  FAILED: { backgroundColor: colors.dangerSoft, borderColor: "rgba(251,113,133,0.24)", color: colors.danger },
  REVIEW: { backgroundColor: colors.infoSoft, borderColor: "rgba(96,165,250,0.24)", color: colors.info },
  Registered: { backgroundColor: colors.accentSoft, borderColor: "rgba(45,212,191,0.24)", color: colors.accent },
  Guest: { backgroundColor: colors.fieldStrong, borderColor: colors.panelBorder, color: colors.text },
};

export const StatusPill = ({ value }: { value: string }) => {
  const current = palette[value] || { backgroundColor: colors.field, borderColor: colors.panelBorder, color: colors.text };
  return (
    <View style={[styles.pill, { backgroundColor: current.backgroundColor, borderColor: current.borderColor }]}>
      <View style={[styles.dot, { backgroundColor: current.color }]} />
      <Text style={[styles.text, { color: current.color }]}>{value.replace("_", " ")}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    alignSelf: "flex-start",
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  text: {
    fontFamily: typography.bodyBold,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
