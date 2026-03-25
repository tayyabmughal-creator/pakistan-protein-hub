import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { DateTimeField } from "../../../src/components/DateTimeField";
import { FormField } from "../../../src/components/FormField";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { ScreenShell } from "../../../src/components/ScreenShell";
import {
  createAdminPromotion,
  deleteAdminPromotion,
  fetchAdminPromotionById,
  updateAdminPromotion,
} from "../../../src/lib/api";
import { colors, gradients, radii, spacing, typography } from "../../../src/theme/tokens";

const initialState = {
  code: "",
  description: "",
  discount_percentage: "10",
  usage_limit: "100",
  active: true,
  valid_from: new Date().toISOString(),
  valid_to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

export default function PromotionEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isNew = id === "new";
  const [form, setForm] = useState(initialState);
  const [saving, setSaving] = useState(false);

  const promotionQuery = useQuery({
    queryKey: ["promotion", id],
    queryFn: () => fetchAdminPromotionById(id || ""),
    enabled: Boolean(id) && !isNew,
  });

  useEffect(() => {
    if (!promotionQuery.data) return;
    setForm({
      code: promotionQuery.data.code,
      description: promotionQuery.data.description,
      discount_percentage: String(promotionQuery.data.discount_percentage),
      usage_limit: String(promotionQuery.data.usage_limit),
      active: promotionQuery.data.active,
      valid_from: promotionQuery.data.valid_from,
      valid_to: promotionQuery.data.valid_to,
    });
  }, [promotionQuery.data]);

  const updateField = (field: keyof typeof initialState, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const savePromotion = async () => {
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description,
      discount_percentage: Number(form.discount_percentage),
      usage_limit: Number(form.usage_limit),
      active: form.active,
      valid_from: form.valid_from,
      valid_to: form.valid_to,
    };

    try {
      setSaving(true);
      if (isNew) {
        await createAdminPromotion(payload);
      } else {
        await updateAdminPromotion(id || "", payload);
      }
      await queryClient.invalidateQueries({ queryKey: ["promotions"] });
      Alert.alert("Saved", "Promotion changes have been synced.");
      router.back();
    } catch (error) {
      Alert.alert("Save failed", error instanceof Error ? error.message : "Could not save the promotion.");
    } finally {
      setSaving(false);
    }
  };

  const deletePromotion = () => {
    if (isNew) {
      router.back();
      return;
    }

    Alert.alert("Delete deal", "This promotion will be removed from live operations.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAdminPromotion(id || "");
            await queryClient.invalidateQueries({ queryKey: ["promotions"] });
            router.back();
          } catch (error) {
            Alert.alert("Delete failed", error instanceof Error ? error.message : "Could not delete the promotion.");
          }
        },
      },
    ]);
  };

  if (promotionQuery.isLoading) {
    return (
      <ScreenShell title="Promotion editor" showBackButton>
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={isNew ? "New deal" : "Edit deal"} subtitle="Launch and tune promo campaigns from mobile." showBackButton>
      <GlassPanel style={styles.sectionPanel}>
        <FormField label="Code" value={form.code} onChangeText={(value) => updateField("code", value)} autoCapitalize="characters" placeholder="POWER20" />
        <FormField label="Description" value={form.description} onChangeText={(value) => updateField("description", value)} placeholder="Weekend protein flash sale" multiline />
        <FormField label="Discount %" value={form.discount_percentage} onChangeText={(value) => updateField("discount_percentage", value)} keyboardType="number-pad" placeholder="20" />
        <FormField label="Usage limit" value={form.usage_limit} onChangeText={(value) => updateField("usage_limit", value)} keyboardType="number-pad" placeholder="100" />
        <DateTimeField label="Valid from" value={form.valid_from} onChange={(value) => updateField("valid_from", value)} />
        <DateTimeField label="Valid to" value={form.valid_to} onChange={(value) => updateField("valid_to", value)} />
        <Pressable style={styles.switchRow} onPress={() => updateField("active", !form.active)}>
          <Text style={styles.switchLabel}>Promotion active</Text>
          <Switch value={form.active} onValueChange={(value) => updateField("active", value)} trackColor={{ true: colors.primary, false: "#33434b" }} />
        </Pressable>
      </GlassPanel>

      <Pressable onPress={savePromotion} disabled={saving}>
        <LinearGradient colors={gradients.primary} style={styles.saveButton}>
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Text style={styles.saveText}>{isNew ? "Create deal" : "Save deal"}</Text>
              <Ionicons name="checkmark-circle" size={18} color={colors.background} />
            </>
          )}
        </LinearGradient>
      </Pressable>

      <Pressable onPress={deletePromotion} style={styles.deleteButton}>
        <Ionicons name={isNew ? "close-circle-outline" : "trash-outline"} size={18} color={colors.danger} />
        <Text style={styles.deleteText}>{isNew ? "Discard draft" : "Delete deal"}</Text>
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
    alignItems: "center",
    justifyContent: "space-between",
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
