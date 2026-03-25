import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { FormField } from "../../../src/components/FormField";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { ImageField } from "../../../src/components/ImageField";
import { ScreenShell } from "../../../src/components/ScreenShell";
import {
  appendImageToFormData,
  createAdminCategory,
  deleteAdminCategory,
  fetchAdminCategoryById,
  getImageUrl,
  updateAdminCategory,
} from "../../../src/lib/api";
import { PickedImageAsset } from "../../../src/types/api";
import { colors, gradients, radii, spacing, typography } from "../../../src/theme/tokens";

export default function CategoryEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isNew = id === "new";
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [image, setImage] = useState<PickedImageAsset | null>(null);
  const [saving, setSaving] = useState(false);

  const categoryQuery = useQuery({
    queryKey: ["category", id],
    queryFn: () => fetchAdminCategoryById(id || ""),
    enabled: Boolean(id) && !isNew,
  });

  useEffect(() => {
    if (!categoryQuery.data) return;
    setName(categoryQuery.data.name);
    setSlug(categoryQuery.data.slug);
  }, [categoryQuery.data]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (isNew || !slug) {
      setSlug(
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
      );
    }
  };

  const saveCategory = async () => {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("slug", slug);
    appendImageToFormData(formData, "image", image);

    try {
      setSaving(true);
      if (isNew) {
        await createAdminCategory(formData);
      } else {
        await updateAdminCategory(id || "", formData);
      }
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      Alert.alert("Saved", "Category changes have been synced.");
      router.back();
    } catch (error) {
      Alert.alert("Save failed", error instanceof Error ? error.message : "Could not save the category.");
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = () => {
    if (isNew) {
      router.back();
      return;
    }

    Alert.alert("Delete category", "Products in this category may be affected. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAdminCategory(id || "");
            await queryClient.invalidateQueries({ queryKey: ["categories"] });
            router.back();
          } catch (error) {
            Alert.alert("Delete failed", error instanceof Error ? error.message : "Could not delete the category.");
          }
        },
      },
    ]);
  };

  if (categoryQuery.isLoading) {
    return (
      <ScreenShell title="Category editor" showBackButton>
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={isNew ? "New category" : "Edit category"} subtitle="Mobile category management with the same live backend." showBackButton>
      <GlassPanel style={styles.sectionPanel}>
        <ImageField
          label="Category image"
          imageUri={image?.uri || getImageUrl(categoryQuery.data?.image)}
          onChange={setImage}
        />
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <FormField label="Name" value={name} onChangeText={handleNameChange} placeholder="Mass Gainers" />
        <FormField label="Slug" value={slug} onChangeText={setSlug} placeholder="mass-gainers" autoCapitalize="none" />
      </GlassPanel>

      <Pressable onPress={saveCategory} disabled={saving}>
        <LinearGradient colors={gradients.primary} style={styles.saveButton}>
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Text style={styles.saveText}>{isNew ? "Create category" : "Save category"}</Text>
              <Ionicons name="checkmark-circle" size={18} color={colors.background} />
            </>
          )}
        </LinearGradient>
      </Pressable>

      <Pressable onPress={deleteCategory} style={styles.deleteButton}>
        <Ionicons name={isNew ? "close-circle-outline" : "trash-outline"} size={18} color={colors.danger} />
        <Text style={styles.deleteText}>{isNew ? "Discard draft" : "Delete category"}</Text>
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loadingPanel: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionPanel: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  saveButton: {
    borderRadius: radii.md,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  saveText: {
    color: colors.background,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
  deleteButton: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.3)",
    backgroundColor: colors.dangerSoft,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  deleteText: {
    color: colors.danger,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
});
