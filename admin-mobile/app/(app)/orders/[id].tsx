import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import { ChipSelector } from "../../../src/components/ChipSelector";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { MoneyText } from "../../../src/components/MoneyText";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { SectionTitle } from "../../../src/components/SectionTitle";
import { StatusPill } from "../../../src/components/StatusPill";
import { fetchAdminOrderById, getImageUrl, updateAdminOrder } from "../../../src/lib/api";
import { formatDateTime } from "../../../src/lib/format";
import { colors, gradients, radii, spacing, typography } from "../../../src/theme/tokens";
import { LinearGradient } from "expo-linear-gradient";

const orderOptions = [
  { label: "Pending", value: "PENDING" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const paymentOptions = [
  { label: "Pending", value: "PENDING" },
  { label: "Paid", value: "PAID" },
  { label: "Failed", value: "FAILED" },
];

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => fetchAdminOrderById(id || ""),
    enabled: Boolean(id),
  });
  const [status, setStatus] = useState("PENDING");
  const [paymentStatus, setPaymentStatus] = useState("PENDING");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setStatus(data.status);
    setPaymentStatus(data.payment_status);
  }, [data]);

  const progressIndex = useMemo(() => {
    const order = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"];
    return order.indexOf(data?.status || "PENDING");
  }, [data?.status]);

  const saveChanges = async () => {
    if (!data) return;
    const payload: Record<string, string> = {};
    if (status !== data.status) payload.status = status;
    if (paymentStatus !== data.payment_status) payload.payment_status = paymentStatus;

    if (!Object.keys(payload).length) {
      Alert.alert("No changes", "Everything is already up to date.");
      return;
    }

    try {
      setSaving(true);
      await updateAdminOrder(data.id, payload);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["order", id] }),
      ]);
      Alert.alert("Updated", "Order changes were saved successfully.");
    } catch (error) {
      Alert.alert("Update failed", error instanceof Error ? error.message : "Could not update the order.");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !data) {
    return (
      <ScreenShell title="Order details" showBackButton>
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      </ScreenShell>
    );
  }

  const shippingLines = data.shipping_address.split(",").map((line) => line.trim()).filter(Boolean);

  return (
    <ScreenShell
      title={`Order #${data.id}`}
      subtitle={`Placed ${formatDateTime(data.created_at)} by ${data.customer_name}`}
      showBackButton
    >
      <GlassPanel style={styles.heroPanel}>
        <View style={styles.heroHeader}>
          <View>
            <Text style={styles.heroEyebrow}>Current state</Text>
            <Text style={styles.heroTitle}>{data.status}</Text>
          </View>
          <StatusPill value={data.payment_status} />
        </View>
        <View style={styles.progressRow}>
          {["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"].map((step, index) => (
            <View key={step} style={styles.progressStep}>
              <View
                style={[
                  styles.progressDot,
                  index <= progressIndex ? styles.progressDotActive : null,
                ]}
              />
              <Text style={styles.progressLabel}>{step}</Text>
            </View>
          ))}
        </View>
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <SectionTitle title="Fulfillment controls" subtitle="Update order and payment state from mobile" />
        <ChipSelector options={orderOptions} selectedValue={status} onChange={setStatus} />
        <ChipSelector options={paymentOptions} selectedValue={paymentStatus} onChange={setPaymentStatus} />
        <Pressable onPress={saveChanges} disabled={saving}>
          <LinearGradient colors={gradients.primary} style={styles.saveButton}>
            {saving ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <>
                <Text style={styles.saveButtonText}>Save changes</Text>
                <Ionicons name="checkmark-circle" size={18} color={colors.background} />
              </>
            )}
          </LinearGradient>
        </Pressable>
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <SectionTitle title="Payment summary" subtitle="Customer total and payment references" />
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <MoneyText style={styles.summaryValue} value={data.subtotal_amount} />
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Discount</Text>
          <MoneyText style={styles.summaryValue} value={data.discount_amount} prefix="-" />
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Shipping</Text>
          <MoneyText style={styles.summaryValue} value={data.shipping_fee} />
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total</Text>
          <MoneyText style={styles.summaryTotal} value={data.total_amount} />
        </View>
        <View style={styles.summaryMeta}>
          <StatusPill value={data.payment_status} />
          <Text style={styles.summaryMetaText}>{data.payment_method}</Text>
        </View>
        {data.payment_reference ? <Text style={styles.summaryMetaText}>Reference: {data.payment_reference}</Text> : null}
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <SectionTitle title="Shipping" subtitle="Delivery snapshot saved with the order" />
        <Text style={styles.blockTitle}>{data.customer_name}</Text>
        {shippingLines.map((line) => (
          <Text key={line} style={styles.blockText}>{line}</Text>
        ))}
        <Text style={styles.blockText}>{data.customer_phone_number || data.guest_phone_number}</Text>
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <SectionTitle title="Items" subtitle={`${data.items_count} units in this order`} />
        <View style={styles.itemStack}>
          {data.items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.imageShell}>
                {item.product_image ? (
                  <Image source={{ uri: getImageUrl(item.product_image) || undefined }} style={styles.image} />
                ) : (
                  <Ionicons name="cube-outline" size={20} color={colors.textMuted} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.blockTitle}>{item.product_name}</Text>
                <Text style={styles.blockText}>Qty {item.quantity}</Text>
              </View>
              <MoneyText style={styles.itemPrice} value={item.price} />
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
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  heroEyebrow: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 28,
    marginTop: 4,
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  progressStep: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  progressDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  progressDotActive: {
    backgroundColor: colors.primary,
  },
  progressLabel: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 10,
    textAlign: "center",
  },
  sectionPanel: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  saveButton: {
    borderRadius: radii.md,
    paddingVertical: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  saveButtonText: {
    color: colors.background,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
  },
  summaryValue: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
    maxWidth: "52%",
    textAlign: "right",
  },
  summaryTotal: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    maxWidth: "52%",
    textAlign: "right",
  },
  summaryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  summaryMetaText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  blockTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
  blockText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
  itemStack: {
    gap: spacing.sm,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
  imageShell: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.field,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  itemPrice: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    maxWidth: "36%",
    textAlign: "right",
  },
});
