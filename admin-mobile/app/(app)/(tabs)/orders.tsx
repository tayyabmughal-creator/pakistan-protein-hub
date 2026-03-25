import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ChipSelector } from "../../../src/components/ChipSelector";
import { EmptyState } from "../../../src/components/EmptyState";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { MoneyText } from "../../../src/components/MoneyText";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { SearchInput } from "../../../src/components/SearchInput";
import { StatusPill } from "../../../src/components/StatusPill";
import { fetchAdminOrders } from "../../../src/lib/api";
import { formatDateTime, formatNumber } from "../../../src/lib/format";
import { colors, radii, spacing, typography } from "../../../src/theme/tokens";

const filters = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default function OrdersScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["orders"],
    queryFn: fetchAdminOrders,
  });

  const filteredOrders = useMemo(() => {
    return (data || []).filter((order) => {
      const matchesFilter = filter === "ALL" || order.status === filter;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        order.customer_name.toLowerCase().includes(query) ||
        order.customer_email.toLowerCase().includes(query) ||
        String(order.id).includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [data, filter, search]);

  const pendingCount = filteredOrders.filter((order) => order.status === "PENDING").length;
  const visibleRevenue = filteredOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  return (
    <ScreenShell
      title="Orders"
      subtitle={`${formatNumber((data || []).filter((order) => order.status === "PENDING").length)} orders still need attention.`}
      rightAction={
        <Pressable onPress={() => refetch()} style={styles.refreshButton}>
          {isRefetching ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Ionicons name="refresh" size={18} color={colors.text} />
          )}
        </Pressable>
      }
    >
      <GlassPanel style={styles.toolbar}>
        <SearchInput value={search} onChangeText={setSearch} placeholder="Search order, customer, or email" />
        <ChipSelector options={filters} selectedValue={filter} onChange={setFilter} />
      </GlassPanel>

      {!isLoading ? (
        <View style={styles.summaryRow}>
          <GlassPanel style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Visible orders</Text>
            <Text style={styles.summaryValue}>{formatNumber(filteredOrders.length)}</Text>
          </GlassPanel>
          <GlassPanel style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Pending / value</Text>
            <Text style={styles.summaryValue}>{pendingCount}</Text>
            <MoneyText style={styles.summaryCaption} value={visibleRevenue} />
          </GlassPanel>
        </View>
      ) : null}

      {isLoading ? (
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="No orders match right now"
          description="Try a different filter or search phrase."
          icon={<Ionicons name="receipt-outline" size={28} color={colors.textMuted} />}
        />
      ) : (
        <View style={styles.stack}>
          {filteredOrders.map((order) => (
            <Pressable key={order.id} onPress={() => router.push(`/(app)/orders/${order.id}`)}>
              <GlassPanel style={styles.orderCard}>
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.orderNumber}>Order #{order.id}</Text>
                    <Text style={styles.orderDate}>{formatDateTime(order.created_at)}</Text>
                  </View>
                  <StatusPill value={order.status} />
                </View>

                <Text style={styles.customerName}>{order.customer_name}</Text>
                <Text style={styles.customerEmail}>{order.customer_email || "Guest checkout"}</Text>

                <View style={styles.metaRow}>
                  <StatusPill value={order.payment_status} />
                  <Text style={styles.metaText}>{order.payment_method}</Text>
                  <MoneyText style={styles.amount} value={order.total_amount} />
                </View>

                <View style={styles.footerRow}>
                  <Text style={styles.footerText}>{order.items_count} items</Text>
                  <Text style={styles.footerText}>{order.customer_type}</Text>
                </View>
              </GlassPanel>
            </Pressable>
          ))}
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
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
  toolbar: {
    padding: spacing.md,
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    padding: spacing.md,
    gap: 6,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  summaryValue: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 26,
    letterSpacing: -0.8,
  },
  summaryCaption: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    lineHeight: 16,
  },
  loadingPanel: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  stack: {
    gap: spacing.md,
  },
  orderCard: {
    padding: spacing.md,
    gap: spacing.sm,
    borderColor: colors.panelBorderStrong,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  orderNumber: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 17,
  },
  orderDate: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 4,
  },
  customerName: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
  customerEmail: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  metaText: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 13,
  },
  amount: {
    marginLeft: "auto",
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    maxWidth: "45%",
    textAlign: "right",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
  },
  footerText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
  },
});
