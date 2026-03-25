import { useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { EmptyState } from "../../../src/components/EmptyState";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { ScreenShell } from "../../../src/components/ScreenShell";
import { SearchInput } from "../../../src/components/SearchInput";
import { fetchAdminCategories, getImageUrl } from "../../../src/lib/api";
import { colors, radii, spacing, typography } from "../../../src/theme/tokens";

export default function CategoriesScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchAdminCategories,
  });

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data || []).filter((category) => {
      return (
        !query ||
        category.name.toLowerCase().includes(query) ||
        category.slug.toLowerCase().includes(query)
      );
    });
  }, [data, search]);

  return (
    <ScreenShell
      title="Categories"
      subtitle="Curate storefront navigation and merchandising buckets."
      showBackButton
      rightAction={
        <Pressable onPress={() => router.push("/(app)/categories/new")} style={styles.addButton}>
          <Ionicons name="add" size={22} color={colors.background} />
        </Pressable>
      }
    >
      <GlassPanel style={styles.toolbar}>
        <SearchInput value={search} onChangeText={setSearch} placeholder="Search category or slug" />
      </GlassPanel>

      {isLoading ? (
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      ) : filteredCategories.length === 0 ? (
        <EmptyState
          title="No categories available"
          description="Create a category to organize the storefront."
          icon={<Ionicons name="albums-outline" size={28} color={colors.textMuted} />}
        />
      ) : (
        <View style={styles.stack}>
          {filteredCategories.map((category) => (
            <Pressable key={category.id} onPress={() => router.push(`/(app)/categories/${category.id}`)}>
              <GlassPanel style={styles.card}>
                <View style={styles.cardRow}>
                  <View style={styles.imageShell}>
                    {category.image ? (
                      <Image source={{ uri: getImageUrl(category.image) || undefined }} style={styles.image} />
                    ) : (
                      <Ionicons name="albums-outline" size={20} color={colors.textMuted} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{category.name}</Text>
                    <Text style={styles.subtitle}>{category.slug}</Text>
                  </View>
                  <Text style={styles.count}>{category.products_count || 0}</Text>
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
  },
  cardRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  imageShell: {
    width: 58,
    height: 58,
    borderRadius: 18,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.field,
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
    fontSize: 12,
    marginTop: 4,
  },
  count: {
    color: colors.primary,
    fontFamily: typography.display,
    fontSize: 22,
  },
});
