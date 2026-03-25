import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import { ChipSelector } from "../../../src/components/ChipSelector";
import { EmptyState } from "../../../src/components/EmptyState";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { MoneyText } from "../../../src/components/MoneyText";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { StatusPill } from "../../../src/components/StatusPill";
import { fetchAdminPaymentReviews, resolveAdminPaymentReview } from "../../../src/lib/api";
import { formatDateTime } from "../../../src/lib/format";
import { colors, radii, spacing, typography } from "../../../src/theme/tokens";

const filters = [
  { label: "Needs review", value: "REVIEW" },
  { label: "All", value: "ALL" },
];

export default function PaymentReviewsScreen() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("REVIEW");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["payment-reviews", filter],
    queryFn: () => fetchAdminPaymentReviews(filter),
  });

  const sessions = useMemo(() => data || [], [data]);

  const handleAction = async (sessionId: string, action: "approve" | "fail") => {
    try {
      setProcessingId(sessionId);
      await resolveAdminPaymentReview(sessionId, action);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payment-reviews"] }),
        queryClient.invalidateQueries({ queryKey: ["orders"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      Alert.alert("Updated", action === "approve" ? "Payment approved and order created." : "Payment marked as failed.");
      refetch();
    } catch (error) {
      Alert.alert("Action failed", error instanceof Error ? error.message : "Could not update this payment session.");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <ScreenShell title="Payment reviews" subtitle="Manual action queue for sessions that need human confirmation." showBackButton>
      <GlassPanel style={styles.toolbar}>
        <ChipSelector options={filters} selectedValue={filter} onChange={setFilter} />
      </GlassPanel>

      {isLoading ? (
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No payment reviews waiting"
          description="When Safepay sessions need manual action, they will appear here."
          icon={<Ionicons name="card-outline" size={28} color={colors.textMuted} />}
        />
      ) : (
        <View style={styles.stack}>
          {sessions.map((session) => {
            const isProcessing = processingId === session.public_id;
            return (
              <GlassPanel key={session.public_id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{session.customer_name}</Text>
                    <Text style={styles.subtitle}>{session.customer_email || "No email"}</Text>
                  </View>
                  <StatusPill value={session.status} />
                </View>
                <View style={styles.metaSplitRow}>
                  <MoneyText style={styles.metaAmount} value={session.total_amount} />
                  <Text style={styles.meta}>{session.payment_method}</Text>
                </View>
                <Text style={styles.meta}>Updated {formatDateTime(session.updated_at)}</Text>
                <Text style={styles.meta}>Gateway {session.gateway_reference || "Pending reference"}</Text>
                <Text style={styles.blockTitle}>Items</Text>
                {session.items_snapshot.map((item, index) => (
                  <View key={`${session.public_id}-${index}`} style={styles.itemRow}>
                    <Text style={styles.itemName}>{item.product_name}</Text>
                    <MoneyText style={styles.itemValue} value={item.price} prefix={`${item.quantity} × `} />
                  </View>
                ))}
                <Text style={styles.address}>{session.shipping_address}</Text>
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => handleAction(session.public_id, "approve")}
                    disabled={isProcessing || session.status === "COMPLETED"}
                    style={styles.approveButton}
                  >
                    {isProcessing ? <ActivityIndicator color={colors.background} /> : <Text style={styles.approveText}>Approve</Text>}
                  </Pressable>
                  <Pressable
                    onPress={() => handleAction(session.public_id, "fail")}
                    disabled={isProcessing || session.status === "COMPLETED"}
                    style={styles.failButton}
                  >
                    <Text style={styles.failText}>Fail</Text>
                  </Pressable>
                </View>
              </GlassPanel>
            );
          })}
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    padding: spacing.md,
  },
  loadingPanel: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  stack: {
    gap: spacing.md,
  },
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  title: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: 4,
  },
  meta: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
  metaSplitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  metaAmount: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    maxWidth: "50%",
  },
  blockTitle: {
    marginTop: 6,
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  itemName: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
    flex: 1,
  },
  itemValue: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    maxWidth: "42%",
    textAlign: "right",
  },
  address: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 8,
  },
  approveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  approveText: {
    color: colors.background,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
  failButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.3)",
    backgroundColor: colors.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  failText: {
    color: colors.danger,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
});
