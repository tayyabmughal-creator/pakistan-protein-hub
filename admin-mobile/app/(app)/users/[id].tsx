import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { FormField } from "../../../src/components/FormField";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { MoneyText } from "../../../src/components/MoneyText";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { StatusPill } from "../../../src/components/StatusPill";
import { fetchAdminUserById, updateAdminUser } from "../../../src/lib/api";
import { formatCurrency, formatDate, formatDateTime } from "../../../src/lib/format";
import { colors, gradients, radii, spacing, typography } from "../../../src/theme/tokens";

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["user", id],
    queryFn: () => fetchAdminUserById(id || ""),
    enabled: Boolean(id),
  });
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isStaff, setIsStaff] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setPhoneNumber(data.phone_number || "");
    setIsStaff(data.is_staff);
    setIsActive(data.is_active);
  }, [data]);

  const saveUser = async () => {
    if (!data) return;
    try {
      setSaving(true);
      await updateAdminUser(data.id, {
        name,
        phone_number: phoneNumber,
        is_staff: isStaff,
        is_active: isActive,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["users"] }),
        queryClient.invalidateQueries({ queryKey: ["user", id] }),
      ]);
      Alert.alert("Saved", "Customer changes have been synced.");
    } catch (error) {
      Alert.alert("Save failed", error instanceof Error ? error.message : "Could not update the customer.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !data) {
    return (
      <ScreenShell title="Customer detail" showBackButton>
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={data.name || data.email} subtitle={`Joined ${formatDate(data.date_joined)}`} showBackButton>
      <GlassPanel style={styles.heroPanel}>
        <View style={styles.heroHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(data.name || data.email).charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{data.name || "No name"}</Text>
            <Text style={styles.heroEmail}>{data.email}</Text>
          </View>
        </View>
        <View style={styles.heroMeta}>
          <StatusPill value={data.account_type} />
          <Text style={styles.heroMetaText}>{data.order_count} orders</Text>
          <Text style={styles.heroMetaText}>{formatCurrency(data.total_spent)} spent</Text>
        </View>
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <FormField label="Name" value={name} onChangeText={setName} placeholder="Customer name" />
        <FormField label="Phone number" value={phoneNumber} onChangeText={setPhoneNumber} placeholder="+92..." keyboardType="phone-pad" />
        <Pressable style={styles.switchRow} onPress={() => setIsStaff((current) => !current)}>
          <Text style={styles.switchLabel}>Staff access</Text>
          <Switch value={isStaff} onValueChange={setIsStaff} trackColor={{ true: colors.primary, false: "#33434b" }} />
        </Pressable>
        <Pressable style={styles.switchRow} onPress={() => setIsActive((current) => !current)}>
          <Text style={styles.switchLabel}>Account active</Text>
          <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: colors.primary, false: "#33434b" }} />
        </Pressable>
      </GlassPanel>

      <Pressable onPress={saveUser} disabled={saving}>
        <LinearGradient colors={gradients.primary} style={styles.saveButton}>
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Text style={styles.saveText}>Save customer</Text>
              <Ionicons name="checkmark-circle" size={18} color={colors.background} />
            </>
          )}
        </LinearGradient>
      </Pressable>

      <GlassPanel style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>Addresses</Text>
        <View style={styles.stack}>
          {data.addresses.map((address) => (
            <View key={address.id} style={styles.addressCard}>
              <Text style={styles.addressTitle}>{address.full_name}</Text>
              <Text style={styles.addressText}>{address.phone_number}</Text>
              <Text style={styles.addressText}>{address.street}, {address.area}, {address.city}</Text>
              {address.is_default ? <StatusPill value="Default" /> : null}
            </View>
          ))}
        </View>
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>Recent orders</Text>
        <View style={styles.stack}>
          {data.recent_orders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <Text style={styles.addressTitle}>#{order.id}</Text>
                <StatusPill value={order.status} />
              </View>
              <Text style={styles.addressText}>{formatDateTime(order.created_at)}</Text>
              <Text style={styles.addressText}>{order.items_count} items · {order.payment_method}</Text>
              <MoneyText style={styles.orderAmount} value={order.total_amount} />
            </View>
          ))}
        </View>
      </GlassPanel>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loadingPanel: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPanel: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
  },
  avatarText: {
    color: colors.primary,
    fontFamily: typography.display,
    fontSize: 26,
  },
  heroName: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18,
  },
  heroEmail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: 4,
  },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  heroMetaText: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  sectionPanel: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  switchLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
  },
  saveButton: {
    borderRadius: radii.md,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  saveText: {
    color: colors.background,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18,
  },
  stack: {
    gap: spacing.sm,
  },
  addressCard: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    gap: 6,
  },
  addressTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
  addressText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  orderCard: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    gap: 8,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  orderAmount: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    textAlign: "right",
  },
});
