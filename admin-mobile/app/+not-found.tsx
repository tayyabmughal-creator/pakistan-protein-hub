import { Pressable, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { colors, gradients, radii, spacing, typography } from "../src/theme/tokens";

export default function NotFoundScreen() {
  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.background} style={StyleSheet.absoluteFillObject} />
      <LinearGradient colors={gradients.hero} style={styles.glow} />
      <View style={styles.panel}>
        <View style={styles.iconWrap}>
          <Ionicons name="compass-outline" size={28} color={colors.background} />
        </View>
        <Text style={styles.title}>That screen is not available</Text>
        <Text style={styles.description}>
          The link is missing or outdated. Jump back into the admin command center and continue from there.
        </Text>
        <Link href="/(app)/(tabs)/dashboard" asChild>
          <Pressable>
            <LinearGradient colors={gradients.primary} style={styles.button}>
              <Text style={styles.buttonText}>Go to dashboard</Text>
            </LinearGradient>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  glow: {
    position: "absolute",
    top: -120,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 260,
  },
  panel: {
    width: "100%",
    maxWidth: 420,
    padding: spacing.xl,
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
    backgroundColor: colors.overlay,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 28,
    lineHeight: 32,
  },
  description: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: colors.background,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
});
