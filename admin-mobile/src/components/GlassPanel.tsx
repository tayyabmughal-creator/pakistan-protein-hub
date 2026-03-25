import { ReactNode } from "react";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

import { colors, radii } from "../theme/tokens";

type GlassPanelProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export const GlassPanel = ({ children, style }: GlassPanelProps) => (
  <BlurView intensity={28} tint="dark" style={[styles.panel, style]}>
    {children}
  </BlurView>
);

const styles = StyleSheet.create({
  panel: {
    overflow: "hidden",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.overlay,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 10,
  },
});
