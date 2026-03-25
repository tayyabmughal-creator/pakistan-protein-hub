import { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { ChipSelector } from "../../../src/components/ChipSelector";
import { EmptyState } from "../../../src/components/EmptyState";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { MoneyText } from "../../../src/components/MoneyText";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { SearchInput } from "../../../src/components/SearchInput";
import { fetchAdminProducts, getImageUrl } from "../../../src/lib/api";
import { colors, radii, spacing, typography } from "../../../src/theme/tokens";

const filters = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Low stock", value: "LOW" },
  { label: "Hidden", value: "HIDDEN" },
];

export default function ProductsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const { data, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: fetchAdminProducts,
  });

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data || []).filter((product) => {
      const matchesFilter =
        filter === "ALL" ||
        (filter === "ACTIVE" && product.is_active) ||
        (filter === "LOW" && product.stock <= 5) ||
        (filter === "HIDDEN" && !product.is_active);
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.brand.toLowerCase().includes(query) ||
        product.category?.name?.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [data, filter, search]);

  return (
    <ScreenShell
      title="Products"
      subtitle="Mobile inventory editor tied directly to the live web admin backend."
      showBackButton
      rightAction={
        <Pressable onPress={() => router.push("/(app)/products/new")} style={styles.addButton}>
          <Ionicons name="add" size={22} color={colors.background} />
        </Pressable>
      }
    >
      <GlassPanel style={styles.toolbar}>
        <SearchInput value={search} onChangeText={setSearch} placeholder="Search product, brand, or category" />
        <ChipSelector options={filters} selectedValue={filter} onChange={setFilter} />
      </GlassPanel>

      {isLoading ? (
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          title="No products to show"
          description="Try another filter or create a new product."
          icon={<Ionicons name="cube-outline" size={28} color={colors.textMuted} />}
        />
      ) : (
        <View style={styles.stack}>
          {filteredProducts.map((product) => (
            <Pressable key={product.id} onPress={() => router.push(`/(app)/products/${product.id}`)}>
              <GlassPanel style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.imageShell}>
                    {product.image ? (
                      <Image source={{ uri: getImageUrl(product.image) || undefined }} style={styles.image} />
                    ) : (
                      <Ionicons name="cube-outline" size={22} color={colors.textMuted} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{product.name}</Text>
                    <Text style={styles.subtitle}>{product.brand} · {product.category?.name || "No category"}</Text>
                  </View>
                </View>
                <View style={styles.metaRow}>
                  <MoneyText style={styles.price} value={product.final_price} />
                  <Text style={styles.metaText}>{product.stock} in stock</Text>
                  <Text style={styles.metaText}>{product.is_active ? "Visible" : "Hidden"}</Text>
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
    gap: spacing.md,
  },
  cardRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  imageShell: {
    width: 66,
    height: 66,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.field,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  title: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 13,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  price: {
    color: colors.primary,
    fontFamily: typography.bodyBold,
    fontSize: 14,
    maxWidth: "42%",
  },
  metaText: {
    color: colors.textMuted,
    fontFamily: typography.bodyMedium,
    fontSize: 12,
  },
});
