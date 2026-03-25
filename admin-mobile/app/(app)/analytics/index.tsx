import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Defs, Line, LinearGradient as SvgLinearGradient, Path, Stop } from "react-native-svg";

import { EmptyState } from "../../../src/components/EmptyState";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { MetricCard } from "../../../src/components/MetricCard";
import { MoneyText } from "../../../src/components/MoneyText";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { SectionTitle } from "../../../src/components/SectionTitle";
import { fetchAdminCatalogSummary, fetchAdminDashboard } from "../../../src/lib/api";
import { formatCompactNumber, formatCurrency, formatNumber } from "../../../src/lib/format";
import { colors, radii, spacing, typography } from "../../../src/theme/tokens";

type TrendPoint = {
  label: string;
  value: number;
};

const CHART_WIDTH = 320;
const CHART_HEIGHT = 182;
const CHART_PADDING_X = 18;
const CHART_PADDING_TOP = 18;
const CHART_PADDING_BOTTOM = 28;

const shortMonth = (label: string) => label.split(" ")[0];

const TrendAreaChart = ({
  data,
  id,
  strokeColor,
  fillStart,
  fillEnd,
}: {
  data: TrendPoint[];
  id: string;
  strokeColor: string;
  fillStart: string;
  fillEnd: string;
}) => {
  if (!data.length) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyText}>Not enough data yet.</Text>
      </View>
    );
  }

  const innerWidth = CHART_WIDTH - CHART_PADDING_X * 2;
  const innerHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const maxValue = Math.max(1, ...data.map((point) => point.value));

  const points = data.map((point, index) => {
    const x =
      CHART_PADDING_X + (data.length === 1 ? innerWidth / 2 : (index * innerWidth) / Math.max(1, data.length - 1));
    const ratio = point.value / maxValue;
    const y = CHART_PADDING_TOP + (1 - ratio) * innerHeight;
    return { x, y };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const areaPath = `${linePath} L ${lastPoint?.x || CHART_PADDING_X} ${CHART_HEIGHT - CHART_PADDING_BOTTOM} L ${firstPoint?.x || CHART_PADDING_X} ${CHART_HEIGHT - CHART_PADDING_BOTTOM} Z`;

  return (
    <View style={styles.chartWrap}>
      <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        <Defs>
          <SvgLinearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={fillStart} stopOpacity={0.38} />
            <Stop offset="100%" stopColor={fillEnd} stopOpacity={0.02} />
          </SvgLinearGradient>
        </Defs>

        {[0, 1, 2, 3].map((step) => {
          const y = CHART_PADDING_TOP + (innerHeight / 3) * step;
          return <Line key={step} x1={CHART_PADDING_X} x2={CHART_WIDTH - CHART_PADDING_X} y1={y} y2={y} stroke={colors.panelBorder} strokeDasharray="5 8" />;
        })}

        <Path d={areaPath} fill={`url(#${id})`} />
        <Path d={linePath} stroke={strokeColor} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point) => (
          <Circle key={`${id}-${point.x}`} cx={point.x} cy={point.y} r={4.5} fill={strokeColor} />
        ))}
      </Svg>

      <View style={styles.chartLabelsRow}>
        {data.map((point) => (
          <View key={`${id}-${point.label}`} style={styles.chartLabelCell}>
            <Text style={styles.chartLabel}>{shortMonth(point.label)}</Text>
            <Text style={styles.chartValue}>{formatCompactNumber(point.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const RankingBars = ({
  items,
}: {
  items: Array<{ label: string; value: number; meta: string }>;
}) => {
  if (!items.length) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyText}>No ranking data yet.</Text>
      </View>
    );
  }

  const maxValue = Math.max(1, ...items.map((item) => item.value));

  return (
    <View style={styles.rankStack}>
      {items.map((item, index) => (
        <View key={`${item.label}-${index}`} style={styles.rankItem}>
          <View style={styles.rankHeader}>
            <Text numberOfLines={1} style={styles.rankTitle}>
              {item.label}
            </Text>
            <MoneyText style={styles.rankAmount} value={item.value} />
          </View>
          <View style={styles.rankTrack}>
            <View
              style={[
                styles.rankFill,
                {
                  width: `${Math.max(16, (item.value / maxValue) * 100)}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.rankMeta}>{item.meta}</Text>
        </View>
      ))}
    </View>
  );
};

export default function AnalyticsScreen() {
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchAdminDashboard,
  });
  const catalogQuery = useQuery({
    queryKey: ["catalog-summary"],
    queryFn: fetchAdminCatalogSummary,
  });

  const customerTrend = useMemo(
    () => (dashboardQuery.data?.customer_growth || []).map((point) => ({ label: point.month, value: Number(point.customers || 0) })),
    [dashboardQuery.data?.customer_growth],
  );

  const revenueTrend = useMemo(
    () => (dashboardQuery.data?.revenue_trend || []).map((point) => ({ label: point.month, value: Number(point.revenue || 0) })),
    [dashboardQuery.data?.revenue_trend],
  );

  const topProductBars = useMemo(
    () =>
      (dashboardQuery.data?.top_products || []).slice(0, 5).map((product) => ({
        label: product.name,
        value: Number(product.revenue || 0),
        meta: `${formatNumber(product.units_sold)} units sold`,
      })),
    [dashboardQuery.data?.top_products],
  );

  const categoryRows = catalogQuery.data?.categories || [];
  const reviewRows = catalogQuery.data?.reviews || [];

  const customerStart = customerTrend[0]?.value || 0;
  const customerEnd = customerTrend[customerTrend.length - 1]?.value || 0;
  const customerGrowth = customerEnd - customerStart;
  const bestSeller = dashboardQuery.data?.top_products?.[0];
  const reviewLeader = reviewRows[0];

  const metrics = [
    {
      label: "Customer growth",
      value: customerGrowth >= 0 ? `+${formatNumber(customerGrowth)}` : formatNumber(customerGrowth),
      caption: `${formatNumber(customerEnd)} total customers tracked`,
      icon: <Ionicons name="people" size={20} color={colors.background} />,
      accent: "primary" as const,
    },
    {
      label: "Best seller",
      value: bestSeller ? formatCurrency(bestSeller.revenue) : formatCurrency(0),
      caption: bestSeller ? bestSeller.name : "Waiting for sales data",
      icon: <Ionicons name="flame" size={20} color={colors.background} />,
      accent: "accent" as const,
    },
    {
      label: "Review leader",
      value: reviewLeader ? `${formatNumber(reviewLeader.review_count)}` : "0",
      caption: reviewLeader ? reviewLeader.product_name : "No review activity yet",
      icon: <Ionicons name="chatbubbles" size={20} color={colors.background} />,
      accent: "primary" as const,
    },
  ];

  const isLoading = dashboardQuery.isLoading || catalogQuery.isLoading;
  const errorMessage =
    dashboardQuery.error instanceof Error
      ? dashboardQuery.error.message
      : catalogQuery.error instanceof Error
        ? catalogQuery.error.message
        : null;

  return (
    <ScreenShell title="Analytics" subtitle="Performance, customer momentum, and revenue depth in one mobile view." showBackButton>
      {isLoading ? (
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      ) : errorMessage ? (
        <EmptyState
          title="Analytics could not load"
          description={errorMessage}
          icon={<Ionicons name="pulse-outline" size={28} color={colors.textMuted} />}
        />
      ) : (
        <>
          <View style={styles.metricGrid}>
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </View>

          <GlassPanel style={styles.sectionPanel}>
            <SectionTitle title="Customer growth" subtitle="The same six-month trend your web analytics screen uses." />
            <TrendAreaChart
              data={customerTrend}
              id="customer-growth"
              strokeColor={colors.accent}
              fillStart={colors.accent}
              fillEnd={colors.background}
            />
          </GlassPanel>

          <GlassPanel style={styles.sectionPanel}>
            <SectionTitle title="Revenue trend" subtitle="Monthly revenue buckets in PKR." />
            <TrendAreaChart
              data={revenueTrend}
              id="revenue-trend"
              strokeColor={colors.primary}
              fillStart={colors.primary}
              fillEnd={colors.background}
            />
          </GlassPanel>

          <GlassPanel style={styles.sectionPanel}>
            <SectionTitle title="Top product revenue" subtitle="Which SKUs are driving the most cash right now." />
            <RankingBars items={topProductBars} />
          </GlassPanel>

          <GlassPanel style={styles.sectionPanel}>
            <SectionTitle title="Category coverage" subtitle="Merchandising spread across the storefront." />
            {!categoryRows.length ? (
              <EmptyState
                title="No category data"
                description="Category distribution will show up here once the catalog is organized."
                icon={<Ionicons name="albums-outline" size={28} color={colors.textMuted} />}
              />
            ) : (
              <View style={styles.listStack}>
                {categoryRows.map((category) => (
                  <View key={category.id} style={styles.listRow}>
                    <View>
                      <Text style={styles.listTitle}>{category.name}</Text>
                      <Text style={styles.listSubtitle}>{category.slug}</Text>
                    </View>
                    <Text style={styles.listValue}>{formatNumber(category.product_count)} products</Text>
                  </View>
                ))}
              </View>
            )}
          </GlassPanel>

          <GlassPanel style={styles.sectionPanel}>
            <SectionTitle title="Most reviewed products" subtitle="Social proof hotspots from the storefront." />
            {!reviewRows.length ? (
              <EmptyState
                title="No review activity yet"
                description="Customer review trends will show up here as products collect feedback."
                icon={<Ionicons name="sparkles-outline" size={28} color={colors.textMuted} />}
              />
            ) : (
              <View style={styles.listStack}>
                {reviewRows.map((review) => (
                  <View key={review.product_name} style={styles.listRow}>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.listTitle}>
                        {review.product_name}
                      </Text>
                      <Text style={styles.listSubtitle}>Review activity</Text>
                    </View>
                    <Text style={styles.listValue}>{formatNumber(review.review_count)} reviews</Text>
                  </View>
                ))}
              </View>
            )}
          </GlassPanel>
        </>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loadingPanel: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
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
  chartWrap: {
    gap: spacing.sm,
  },
  chartLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
  },
  chartLabelCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
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
  chartEmpty: {
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.field,
  },
  chartEmptyText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 14,
  },
  rankStack: {
    gap: spacing.md,
  },
  rankItem: {
    gap: 8,
  },
  rankHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  rankTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
  rankAmount: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 13,
    maxWidth: "42%",
    textAlign: "right",
  },
  rankTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: colors.field,
  },
  rankFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  rankMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
  },
  listStack: {
    gap: spacing.sm,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.field,
  },
  listTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
  listSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 4,
  },
  listValue: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 13,
  },
});
