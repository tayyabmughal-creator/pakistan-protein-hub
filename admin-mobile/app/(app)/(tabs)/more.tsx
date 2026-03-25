import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ActionTile } from "../../../src/components/ActionTile";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { useAuth } from "../../../src/providers/AuthProvider";
import { colors, radii, spacing, typography } from "../../../src/theme/tokens";

export default function MoreScreen() {
  const router = useRouter();
  const { user, logout, pushState, refreshPushRegistration } = useAuth();

  const handleLogout = () => {
    Alert.alert("Sign out", "Do you want to sign out from the admin app?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => logout().catch(() => undefined),
      },
    ]);
  };

  return (
    <ScreenShell title="More" subtitle="Store settings, payment reviews, export tools, and device status.">
      <GlassPanel style={styles.profilePanel}>
        <View style={styles.profileBadge}>
          <Text style={styles.profileBadgeText}>{(user?.name || user?.email || "A").charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{user?.name || "Store admin"}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
        </View>
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>Push notifications</Text>
        <Text style={styles.sectionCopy}>
          Order and payment-review notifications are routed to this device through Expo push tokens registered in Django.
        </Text>
        <View style={styles.pushRow}>
          <View>
            <Text style={styles.pushLabel}>Status</Text>
            <Text style={styles.pushValue}>{pushState.status.toUpperCase()}</Text>
          </View>
          <Pressable onPress={() => refreshPushRegistration()} style={styles.refreshButton}>
            <Ionicons name="refresh" size={18} color={colors.text} />
          </Pressable>
        </View>
        {pushState.error ? <Text style={styles.pushError}>{pushState.error}</Text> : null}
      </GlassPanel>

      <View style={styles.tileGrid}>
        <ActionTile
          title="Analytics"
          description="Track customer growth, revenue trends, and review hotspots."
          icon={<Ionicons name="pulse" size={24} color={colors.background} />}
          accent="accent"
          onPress={() => router.push("/(app)/analytics" as never)}
        />
        <ActionTile
          title="Payment reviews"
          description="Approve or reject sessions stuck in review."
          icon={<Ionicons name="card" size={24} color={colors.background} />}
          onPress={() => router.push("/(app)/payments")}
        />
        <ActionTile
          title="Homepage settings"
          description="Refresh hero copy, support details, and sale banner content."
          icon={<Ionicons name="sparkles" size={24} color={colors.background} />}
          onPress={() => router.push("/(app)/homepage")}
        />
        <ActionTile
          title="Reports"
          description="Download and share orders, customers, and inventory CSV files."
          icon={<Ionicons name="download" size={24} color={colors.background} />}
          onPress={() => router.push("/(app)/reports")}
        />
      </View>

      <Pressable onPress={handleLogout} style={styles.logoutButton}>
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  profilePanel: {
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  profileBadge: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
  },
  profileBadgeText: {
    color: colors.primary,
    fontFamily: typography.display,
    fontSize: 26,
  },
  profileName: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18,
  },
  profileEmail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: 4,
  },
  sectionPanel: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18,
  },
  sectionCopy: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
  },
  pushRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pushLabel: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  pushValue: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    marginTop: 4,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.fieldStrong,
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
  pushError: {
    color: colors.danger,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  tileGrid: {
    gap: spacing.md,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.24)",
    backgroundColor: colors.dangerSoft,
    paddingVertical: 16,
  },
  logoutText: {
    color: colors.danger,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
});
