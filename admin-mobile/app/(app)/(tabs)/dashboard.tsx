import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

import { fetchAdminDashboard } from "../../../src/lib/api";
import { formatCompactNumber, formatCurrency, formatNumber } from "../../../src/lib/format";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { MetricCard } from "../../../src/components/MetricCard";
import { MoneyText } from "../../../src/components/MoneyText";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { SectionTitle } from "../../../src/components/SectionTitle";
import { StatusPill } from "../../../src/components/StatusPill";
import { useAuth } from "../../../src/providers/AuthProvider";
import { colors, gradients, radii, spacing, typography } from "../../../src/theme/tokens";

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchAdminDashboard,
  });

  const revenueMax = useMemo(
    () => Math.max(1, ...(data?.revenue_trend || []).map((item) => item.revenue || 0)),
    [data?.revenue_trend],
  );

  const metrics = [
    {
      label: "Revenue",
      value: formatCurrency(data?.overview.total_revenue),
      caption: "Store lifetime",
      icon: <Ionicons name="trending-up" size={20} color={colors.background} />,
    },
    {
      label: "This month",
      value: formatCurrency(data?.overview.monthly_revenue),
      caption: `${formatNumber(data?.overview.pending_orders)} pending orders`,
      icon: <Ionicons name="flash-outline" size={20} color={colors.background} />,
      accent: "accent" as const,
    },
    {
      label: "Customers",
      value: formatCompactNumber(data?.overview.total_customers),
      caption: `${formatNumber(data?.overview.guest_orders)} guest orders`,
      icon: <Ionicons name="people" size={20} color={colors.background} />,
    },
  ];

  return (
    <ScreenShell
      title="Admin command"
      subtitle={`Welcome back, ${(user?.name || "Admin").split(" ")[0]}. Here’s the live pulse of your store.`}
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
      {isLoading ? (
        <GlassPanel style={styles.centerPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      ) : (
        <>
          <GlassPanel style={styles.heroPanel}>
            <LinearGradient colors={gradients.hero} style={styles.heroSweep} />
            <Text style={styles.heroEyebrow}>Live operations</Text>
            <Text style={styles.heroValue}>{formatNumber(data?.overview.total_orders)} orders tracked</Text>
            <Text style={styles.heroCopy}>
              Low stock on {formatNumber(data?.overview.low_stock_products)} products. Average order value sits at{" "}
              {formatCurrency(data?.overview.avg_order_value)}.
            </Text>
            <View style={styles.heroMetaRow}>
              <View style={styles.heroMetaCard}>
                <Text style={styles.heroMetaLabel}>Low stock</Text>
                <Text style={styles.heroMetaValue}>{formatNumber(data?.overview.low_stock_products)}</Text>
              </View>
              <View style={styles.heroMetaCard}>
                <Text style={styles.heroMetaLabel}>AOV</Text>
                <MoneyText style={styles.heroMetaValue} value={data?.overview.avg_order_value} />
              </View>
            </View>
          </GlassPanel>

          <View style={styles.metricGrid}>
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </View>

          <GlassPanel style={styles.sectionPanel}>
            <SectionTitle title="Revenue trend" subtitle="Last six monthly buckets" />
            <View style={styles.chartRow}>
              {(data?.revenue_trend || []).map((point) => {
                const height = ((point.revenue || 0) / revenueMax) * 124;
                return (
                  <View key={point.month} style={styles.chartColumn}>
                    <View style={styles.chartTrack}>
                      <View style={[styles.chartFill, { height: Math.max(12, height) }]} />
                    </View>
                    <Text style={styles.chartLabel}>{point.month.split(" ")[0]}</Text>
                    <Text style={styles.chartValue}>{formatCompactNumber(point.revenue)}</Text>
                  </View>
                );
              })}
            </View>
          </GlassPanel>

          <GlassPanel style={styles.sectionPanel}>
            <SectionTitle title="Order mix" subtitle="How fulfillment is distributed right now" />
            <View style={styles.mixList}>
              {(data?.order_status_breakdown || []).map((item) => (
                <View key={item.status} style={styles.mixRow}>
                  <View style={styles.mixLabelWrap}>
                    <StatusPill value={item.status} />
                    <Text style={styles.mixCount}>{item.count}</Text>
                  </View>
                  <View style={styles.mixBarTrack}>
                    <View
                      style={[
                        styles.mixBarFill,
                        {
                          width: `${Math.max(
                            12,
                            ((item.count || 0) /
                              Math.max(1, ...(data?.order_status_breakdown || []).map((entry) => entry.count))) *
                              100,
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          </GlassPanel>

          <GlassPanel style={styles.sectionPanel}>
            <SectionTitle title="Recent orders" subtitle="Tap any card to open the full order flow" />
            <View style={styles.stack}>
              {(data?.recent_orders || []).map((order) => (
                <Pressable key={order.id} onPress={() => router.push(`/(app)/orders/${order.id}`)}>
                  <View style={styles.listCard}>
                    <View style={styles.listHeader}>
                      <Text style={styles.listTitle}>#{order.id}</Text>
                      <StatusPill value={order.status} />
                    </View>
                    <Text style={styles.listCustomer}>{order.customer_name}</Text>
                    <View style={styles.listMeta}>
                      <StatusPill value={order.customer_type} />
                      <MoneyText style={styles.listAmount} value={order.total_amount} />
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </GlassPanel>

          <GlassPanel style={styles.sectionPanel}>
            <SectionTitle title="Inventory watch" subtitle="Products that need attention first" />
            <View style={styles.stack}>
              {(data?.low_stock_products || []).map((product) => (
                <View key={product.id} style={styles.lowStockRow}>
                  <View>
                    <Text style={styles.listTitle}>{product.name}</Text>
                    <Text style={styles.lowStockBrand}>{product.brand}</Text>
                  </View>
                  <View style={styles.lowStockBadge}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                    <Text style={styles.lowStockText}>{product.stock} left</Text>
                  </View>
                </View>
              ))}
            </View>
          </GlassPanel>
        </>
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
  centerPanel: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPanel: {
    padding: spacing.lg,
    gap: spacing.sm,
    position: "relative",
    overflow: "hidden",
    borderColor: colors.panelBorderStrong,
  },
  heroSweep: {
    position: "absolute",
    top: -20,
    right: -40,
    width: 220,
    height: 220,
    borderRadius: 220,
    opacity: 0.7,
  },
  heroEyebrow: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroValue: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 30,
    lineHeight: 34,
  },
  heroCopy: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 21,
  },
  heroMetaRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heroMetaCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.fieldStrong,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    gap: 6,
  },
  heroMetaLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroMetaValue: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
    textAlign: "right",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sectionPanel: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  chartColumn: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  chartTrack: {
    width: "100%",
    height: 128,
    borderRadius: radii.md,
    justifyContent: "flex-end",
    backgroundColor: colors.field,
    overflow: "hidden",
  },
  chartFill: {
    width: "100%",
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  chartLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 11,
  },
  chartValue: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 11,
  },
  mixList: {
    gap: spacing.sm,
  },
  mixRow: {
    gap: 10,
  },
  mixLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mixCount: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
  mixBarTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.field,
    overflow: "hidden",
  },
  mixBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  stack: {
    gap: spacing.sm,
  },
  listCard: {
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    gap: 10,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 16,
  },
  listCustomer: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
  },
  listMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listAmount: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    maxWidth: "48%",
    textAlign: "right",
  },
  lowStockRow: {
    borderRadius: radii.md,
    padding: spacing.md,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  lowStockBrand: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  lowStockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.warningSoft,
  },
  lowStockText: {
    color: colors.warning,
    fontFamily: typography.bodyBold,
    fontSize: 12,
  },
});
