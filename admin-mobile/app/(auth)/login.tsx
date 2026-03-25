import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";

import { FormField } from "../../src/components/FormField";
import { GlassPanel } from "../../src/components/GlassPanel";
import { API_ROOT_URL } from "../../src/lib/config";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors, gradients, radii, spacing, typography } from "../../src/theme/tokens";

export default function LoginScreen() {
  const router = useRouter();
  const { login, session, loading } = useAuth();
  const { height } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const compactMode = height < 780;
  const extraCompactMode = height < 700;
  const liveHost = API_ROOT_URL.replace(/^https?:\/\//, "");

  useEffect(() => {
    if (session) {
      router.replace("/(app)/(tabs)/dashboard");
    }
  }, [router, session]);

  if (!loading && session) {
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  const handleLogin = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await login(email, password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Could not sign in right now.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
      <LinearGradient colors={gradients.background} style={StyleSheet.absoluteFillObject} />
      <LinearGradient colors={gradients.hero} style={styles.glow} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            compactMode ? styles.scrollContentCompact : null,
            extraCompactMode ? styles.scrollContentExtraCompact : null,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={[styles.hero, compactMode ? styles.heroCompact : null]}>
            <View style={styles.heroTopRow}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>P</Text>
              </View>
              <View style={styles.heroTopCopy}>
                <Text style={styles.heroTopEyebrow}>PakNutrition Admin</Text>
                <Text style={styles.heroTopSubtext}>Live control room for staff</Text>
              </View>
            </View>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>Realtime sync with live store</Text>
            </View>
            <Text style={[styles.title, compactMode ? styles.titleCompact : null]}>
              Manage orders, catalog, and customers without opening the desktop panel.
            </Text>
            <Text style={[styles.subtitle, extraCompactMode ? styles.subtitleCompact : null]}>
              The mobile app uses the same backend as your web admin, so every order and product change stays in sync.
            </Text>
            <View style={styles.factRow}>
              {[
                { icon: "receipt-outline", label: "Live orders" },
                { icon: "notifications-outline", label: "Push alerts" },
                { icon: "sync-outline", label: "Shared backend" },
              ].map((item) => (
                <View key={item.label} style={styles.factPill}>
                  <Ionicons name={item.icon as "receipt-outline"} size={14} color={colors.primary} />
                  <Text style={styles.factPillText}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          <GlassPanel style={[styles.formCard, compactMode ? styles.formCardCompact : null]}>
            <View style={styles.formHeader}>
              <View style={styles.formIcon}>
                <Ionicons name="shield-checkmark-outline" size={24} color={colors.background} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>Store access</Text>
                <Text style={styles.formSubtitle}>Staff and admin accounts only</Text>
              </View>
            </View>

            <FormField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="admin@paknutrition.pk"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <FormField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
            />

            <View style={styles.connectionRow}>
              <Ionicons name="cloud-done-outline" size={14} color={colors.primary} />
              <Text style={styles.connectionText}>Connected to {liveHost}</Text>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable onPress={handleLogin} disabled={submitting} style={({ pressed }) => [pressed ? styles.buttonPressed : null]}>
              <LinearGradient colors={gradients.primary} style={styles.submitButton}>
                {submitting ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <>
                    <Text style={styles.submitText}>Open admin app</Text>
                    <Ionicons name="arrow-forward" size={18} color={colors.background} />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </GlassPanel>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
    justifyContent: "space-between",
  },
  scrollContentCompact: {
    justifyContent: "center",
  },
  scrollContentExtraCompact: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  glow: {
    position: "absolute",
    top: -120,
    right: -60,
    width: 320,
    height: 320,
    borderRadius: 320,
  },
  hero: {
    gap: spacing.sm,
  },
  heroCompact: {
    gap: 10,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  heroTopCopy: {
    gap: 2,
  },
  heroTopEyebrow: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 17,
  },
  heroTopSubtext: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  brandMarkText: {
    color: colors.background,
    fontFamily: typography.display,
    fontSize: 24,
  },
  heroChip: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
    backgroundColor: colors.primarySoft,
  },
  heroChipText: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  titleCompact: {
    fontSize: 24,
    lineHeight: 30,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 15,
    lineHeight: 22,
  },
  subtitleCompact: {
    fontSize: 14,
    lineHeight: 20,
  },
  factRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  factPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
  factPillText: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  formCard: {
    padding: spacing.lg,
    gap: spacing.md,
    borderColor: colors.panelBorderStrong,
    marginTop: spacing.sm,
  },
  formCardCompact: {
    padding: spacing.md,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: 8,
  },
  formIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  formTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 19,
  },
  formSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  connectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
  connectionText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  errorBox: {
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.24)",
  },
  errorText: {
    color: colors.danger,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  submitButton: {
    marginTop: 8,
    borderRadius: radii.md,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  submitText: {
    color: colors.background,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
  buttonPressed: {
    opacity: 0.92,
  },
});
