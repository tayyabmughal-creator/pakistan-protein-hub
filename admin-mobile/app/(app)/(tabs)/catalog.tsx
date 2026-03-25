import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ActionTile } from "../../../src/components/ActionTile";
import { EmptyState } from "../../../src/components/EmptyState";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { SectionTitle } from "../../../src/components/SectionTitle";
import { fetchAdminCatalogSummary } from "../../../src/lib/api";
import { colors, radii, spacing, typography } from "../../../src/theme/tokens";

export default function CatalogScreen() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["catalog-summary"],
    queryFn: fetchAdminCatalogSummary,
  });

  return (
    <ScreenShell
      title="Catalog"
      subtitle="Jump into product, category, and promotion workflows from one place."
    >
      <View style={styles.tileGrid}>
        <ActionTile
          title="Products"
          description="Add, edit, deactivate, or restock products."
          icon={<Ionicons name="cube" size={24} color={colors.background} />}
          onPress={() => router.push("/(app)/products")}
        />
        <ActionTile
          title="Categories"
          description="Shape storefront navigation and category visuals."
          icon={<Ionicons name="albums" size={24} color={colors.background} />}
          accent="accent"
          onPress={() => router.push("/(app)/categories")}
        />
        <ActionTile
          title="Deals"
          description="Launch campaigns, promo codes, and limited offers."
          icon={<Ionicons name="pricetags" size={24} color={colors.background} />}
          onPress={() => router.push("/(app)/promotions")}
        />
      </View>

      <GlassPanel style={styles.sectionPanel}>
        <SectionTitle title="Category spread" subtitle="Quick count of catalog structure" />
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !data?.categories.length ? (
          <EmptyState
            title="No categories yet"
            description="Create the first category to start organizing the catalog."
            icon={<Ionicons name="albums-outline" size={28} color={colors.textMuted} />}
          />
        ) : (
          <View style={styles.list}>
            {data.categories.map((category) => (
              <View key={category.id} style={styles.row}>
                <View>
                  <Text style={styles.rowTitle}>{category.name}</Text>
                  <Text style={styles.rowSubtitle}>{category.slug}</Text>
                </View>
                <View style={styles.counterBadge}>
                  <Text style={styles.counterText}>{category.product_count}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <SectionTitle title="Most reviewed products" subtitle="Social proof hotspots across the store" />
        {!data?.reviews.length ? (
          <EmptyState
            title="No review activity yet"
            description="Customer review trends will appear here as products collect feedback."
            icon={<Ionicons name="sparkles-outline" size={28} color={colors.textMuted} />}
          />
        ) : (
          <View style={styles.list}>
            {data.reviews.map((review) => (
              <View key={review.product_name} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{review.product_name}</Text>
                  <Text style={styles.rowSubtitle}>Review activity</Text>
                </View>
                <Text style={styles.reviewCount}>{review.review_count} reviews</Text>
              </View>
            ))}
          </View>
        )}
      </GlassPanel>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  tileGrid: {
    gap: spacing.md,
  },
  sectionPanel: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  centered: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
  rowTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
  rowSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 4,
  },
  counterBadge: {
    minWidth: 52,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.panelBorderStrong,
    alignItems: "center",
  },
  counterText: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 13,
  },
  reviewCount: {
    color: colors.accent,
    fontFamily: typography.bodyBold,
    fontSize: 13,
  },
});
