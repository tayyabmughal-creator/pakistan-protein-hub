import { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, gradients, radii, spacing, typography } from "../theme/tokens";

type ScreenShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  rightAction?: ReactNode;
  scroll?: boolean;
  showBackButton?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export const ScreenShell = ({
  title,
  subtitle,
  children,
  rightAction,
  scroll = true,
  showBackButton = false,
  contentStyle,
}: ScreenShellProps) => {
  const router = useRouter();
  const content = (
    <>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {showBackButton ? (
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </Pressable>
          ) : null}
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>
        {rightAction}
      </View>
      {children}
    </>
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.background} style={StyleSheet.absoluteFillObject} />
      <LinearGradient colors={gradients.hero} style={styles.heroGlow} />
      <LinearGradient colors={gradients.accent} style={styles.heroGlowSecondary} />
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.scrollContent, contentStyle]}
            showsVerticalScrollIndicator={false}
          >
            {content}
          </ScrollView>
        ) : (
          <View style={[styles.staticContent, contentStyle]}>{content}</View>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 118,
    gap: spacing.lg,
  },
  staticContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 118,
    gap: spacing.lg,
  },
  heroGlow: {
    position: "absolute",
    top: -140,
    right: -90,
    width: 300,
    height: 300,
    borderRadius: 300,
    opacity: 0.92,
  },
  heroGlowSecondary: {
    position: "absolute",
    bottom: 120,
    left: -120,
    width: 240,
    height: 240,
    borderRadius: 240,
    opacity: 0.12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.field,
    gap: spacing.md,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  titleWrap: {
    flex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fieldStrong,
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -1,
  },
  subtitle: {
    marginTop: 6,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 20,
  },
});
