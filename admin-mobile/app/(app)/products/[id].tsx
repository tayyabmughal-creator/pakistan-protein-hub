import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { ChipSelector } from "../../../src/components/ChipSelector";
import { FormField } from "../../../src/components/FormField";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { ImageField } from "../../../src/components/ImageField";
import { ScreenShell } from "../../../src/components/ScreenShell";
import {
  appendImageToFormData,
  createAdminProduct,
  deleteAdminProduct,
  fetchAdminCategories,
  fetchAdminProductById,
  getImageUrl,
  updateAdminProduct,
} from "../../../src/lib/api";
import { PickedImageAsset } from "../../../src/types/api";
import { colors, gradients, radii, spacing, typography } from "../../../src/theme/tokens";

const initialState = {
  name: "",
  slug: "",
  brand: "",
  weight: "",
  description: "",
  price: "",
  discount_price: "",
  stock: "",
  category_id: "",
  is_active: true,
  show_sale_badge: true,
};

export default function ProductEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isNew = id === "new";
  const [form, setForm] = useState(initialState);
  const [image, setImage] = useState<PickedImageAsset | null>(null);
  const [saving, setSaving] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchAdminCategories,
  });

  const productQuery = useQuery({
    queryKey: ["product", id],
    queryFn: () => fetchAdminProductById(id || ""),
    enabled: Boolean(id) && !isNew,
  });

  useEffect(() => {
    if (!productQuery.data) return;
    setForm({
      name: productQuery.data.name,
      slug: productQuery.data.slug,
      brand: productQuery.data.brand,
      weight: productQuery.data.weight,
      description: productQuery.data.description,
      price: productQuery.data.price,
      discount_price: productQuery.data.discount_price || "",
      stock: String(productQuery.data.stock),
      category_id: String(productQuery.data.category?.id || ""),
      is_active: productQuery.data.is_active,
      show_sale_badge: productQuery.data.show_sale_badge,
    });
  }, [productQuery.data]);

  const categoryOptions = useMemo(
    () => (categoriesQuery.data || []).map((category) => ({ label: category.name, value: String(category.id) })),
    [categoriesQuery.data],
  );

  const updateField = (field: keyof typeof initialState, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleNameChange = (value: string) => {
    updateField("name", value);
    if (isNew || !form.slug) {
      updateField(
        "slug",
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
      );
    }
  };

  const saveProduct = async () => {
    if (!form.category_id) {
      Alert.alert("Category required", "Select a category before saving the product.");
      return;
    }

    const formData = new FormData();
    formData.append("name", form.name);
    formData.append("slug", form.slug);
    formData.append("brand", form.brand);
    formData.append("weight", form.weight);
    formData.append("description", form.description);
    formData.append("price", form.price);
    formData.append("discount_price", form.discount_price || "");
    formData.append("stock", form.stock || "0");
    formData.append("category_id", form.category_id);
    formData.append("is_active", String(form.is_active));
    formData.append("show_sale_badge", String(form.show_sale_badge));
    appendImageToFormData(formData, "image", image);

    try {
      setSaving(true);
      if (isNew) {
        await createAdminProduct(formData);
      } else {
        await updateAdminProduct(id || "", formData);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      Alert.alert("Saved", "Product changes have been synced.");
      router.back();
    } catch (error) {
      Alert.alert("Save failed", error instanceof Error ? error.message : "Could not save the product.");
    } finally {
      setSaving(false);
    }
  };

  const removeProduct = () => {
    if (isNew) {
      router.back();
      return;
    }

    Alert.alert("Delete product", "This will remove the product from the admin panel.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAdminProduct(id || "");
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ["products"] }),
              queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
            ]);
            router.back();
          } catch (error) {
            Alert.alert("Delete failed", error instanceof Error ? error.message : "Could not delete the product.");
          }
        },
      },
    ]);
  };

  if (productQuery.isLoading) {
    return (
      <ScreenShell title="Product editor" showBackButton>
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={isNew ? "New product" : "Edit product"}
      subtitle="Use mobile to keep the same web catalog updated in real time."
      showBackButton
    >
      <GlassPanel style={styles.sectionPanel}>
        <ImageField
          label="Product image"
          imageUri={image?.uri || getImageUrl(productQuery.data?.image)}
          onChange={setImage}
        />
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <FormField label="Name" value={form.name} onChangeText={handleNameChange} placeholder="Gold Whey Isolate" />
        <FormField label="Slug" value={form.slug} onChangeText={(value) => updateField("slug", value)} placeholder="gold-whey-isolate" autoCapitalize="none" />
        <FormField label="Brand" value={form.brand} onChangeText={(value) => updateField("brand", value)} placeholder="PakNutrition" />
        <FormField label="Weight" value={form.weight} onChangeText={(value) => updateField("weight", value)} placeholder="2kg" />
        <FormField label="Description" value={form.description} onChangeText={(value) => updateField("description", value)} placeholder="Product description" multiline />
        <FormField label="Price" value={form.price} onChangeText={(value) => updateField("price", value)} keyboardType="decimal-pad" placeholder="8500" />
        <FormField label="Discount price" value={form.discount_price} onChangeText={(value) => updateField("discount_price", value)} keyboardType="decimal-pad" placeholder="7999" />
        <FormField label="Stock" value={form.stock} onChangeText={(value) => updateField("stock", value)} keyboardType="number-pad" placeholder="12" />
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <Text style={styles.switchLabel}>Category</Text>
        <ChipSelector options={categoryOptions} selectedValue={form.category_id} onChange={(value) => updateField("category_id", value)} />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Visible in storefront</Text>
          <Switch value={form.is_active} onValueChange={(value) => updateField("is_active", value)} trackColor={{ true: colors.primary, false: "#33434b" }} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Show sale badge</Text>
          <Switch value={form.show_sale_badge} onValueChange={(value) => updateField("show_sale_badge", value)} trackColor={{ true: colors.primary, false: "#33434b" }} />
        </View>
      </GlassPanel>

      <Pressable onPress={saveProduct} disabled={saving}>
        <LinearGradient colors={gradients.primary} style={styles.saveButton}>
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Text style={styles.saveText}>{isNew ? "Create product" : "Save product"}</Text>
              <Ionicons name="checkmark-circle" size={18} color={colors.background} />
            </>
          )}
        </LinearGradient>
      </Pressable>

      <Pressable onPress={removeProduct} style={styles.deleteButton}>
        <Ionicons name={isNew ? "close-circle-outline" : "trash-outline"} size={18} color={colors.danger} />
        <Text style={styles.deleteText}>{isNew ? "Discard draft" : "Delete product"}</Text>
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
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  switchLabel: {
    color: colors.text,
    fontFamily: typography.bodyMedium,
    fontSize: 14,
  },
  saveButton: {
    borderRadius: radii.md,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
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
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  deleteText: {
    color: colors.danger,
    fontFamily: typography.bodyBold,
    fontSize: 14,
  },
});
