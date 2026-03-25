import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ChipSelector } from "../../../src/components/ChipSelector";
import { EmptyState } from "../../../src/components/EmptyState";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { SearchInput } from "../../../src/components/SearchInput";
import { fetchAdminPromotions } from "../../../src/lib/api";
import { formatDate } from "../../../src/lib/format";
import { colors, spacing, typography } from "../../../src/theme/tokens";

const filters = [
  { label: "All", value: "ALL" },
  { label: "Live", value: "LIVE" },
  { label: "Disabled", value: "DISABLED" },
];

export default function PromotionsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const { data, isLoading } = useQuery({
    queryKey: ["promotions"],
    queryFn: fetchAdminPromotions,
  });

  const filteredPromotions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data || []).filter((promotion) => {
      const matchesFilter =
        filter === "ALL" ||
        (filter === "LIVE" && promotion.is_valid) ||
        (filter === "DISABLED" && !promotion.active);
      const matchesSearch =
        !query ||
        promotion.code.toLowerCase().includes(query) ||
        promotion.description.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [data, filter, search]);

  return (
    <ScreenShell
      title="Deals"
      subtitle="Promo code control room for flash deals and sale campaigns."
      showBackButton
      rightAction={
        <Pressable onPress={() => router.push("/(app)/promotions/new")} style={styles.addButton}>
          <Ionicons name="add" size={22} color={colors.background} />
        </Pressable>
      }
    >
      <GlassPanel style={styles.toolbar}>
        <SearchInput value={search} onChangeText={setSearch} placeholder="Search code or description" />
        <ChipSelector options={filters} selectedValue={filter} onChange={setFilter} />
      </GlassPanel>

      {isLoading ? (
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      ) : filteredPromotions.length === 0 ? (
        <EmptyState
          title="No deals to show"
          description="Create a promotion to launch a new campaign."
          icon={<Ionicons name="pricetags-outline" size={28} color={colors.textMuted} />}
        />
      ) : (
        <View style={styles.stack}>
          {filteredPromotions.map((promotion) => (
            <Pressable key={promotion.id} onPress={() => router.push(`/(app)/promotions/${promotion.id}`)}>
              <GlassPanel style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.code}>{promotion.code}</Text>
                  <Text style={styles.discount}>{promotion.discount_percentage}% OFF</Text>
                </View>
                <Text style={styles.description}>{promotion.description || "No description"}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.meta}>{formatDate(promotion.valid_from)} to {formatDate(promotion.valid_to)}</Text>
                  <Text style={styles.meta}>{promotion.used_count}/{promotion.usage_limit}</Text>
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
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  toolbar: {
    padding: spacing.md,
    gap: spacing.md,
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
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  code: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 24,
  },
  discount: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
  description: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 19,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  meta: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
});
