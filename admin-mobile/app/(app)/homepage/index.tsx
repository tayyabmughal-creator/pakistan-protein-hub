import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { ChipSelector } from "../../../src/components/ChipSelector";
import { DateTimeField } from "../../../src/components/DateTimeField";
import { FormField } from "../../../src/components/FormField";
import { GlassPanel } from "../../../src/components/GlassPanel";
import { ScreenShell } from "../../../src/components/ScreenShell";
import {
  fetchAdminHomePageSettings,
  fetchAdminPromotions,
  updateAdminHomePageSettings,
} from "../../../src/lib/api";
import { colors, gradients, radii, spacing, typography } from "../../../src/theme/tokens";

export default function HomepageSettingsScreen() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["homepage-settings"],
    queryFn: fetchAdminHomePageSettings,
  });
  const promotionsQuery = useQuery({
    queryKey: ["promotions"],
    queryFn: fetchAdminPromotions,
  });
  const [form, setForm] = useState<Record<string, string | boolean | number | null>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setForm({
      hero_badge: settingsQuery.data.hero_badge,
      hero_title_line_one: settingsQuery.data.hero_title_line_one,
      hero_title_line_two: settingsQuery.data.hero_title_line_two,
      hero_description: settingsQuery.data.hero_description,
      hero_stat_one_label: settingsQuery.data.hero_stat_one_label,
      hero_stat_one_value: settingsQuery.data.hero_stat_one_value,
      hero_stat_two_label: settingsQuery.data.hero_stat_two_label,
      hero_stat_two_value: settingsQuery.data.hero_stat_two_value,
      hero_stat_three_label: settingsQuery.data.hero_stat_three_label,
      hero_stat_three_value: settingsQuery.data.hero_stat_three_value,
      deal_badge: settingsQuery.data.deal_badge,
      deal_title: settingsQuery.data.deal_title,
      deal_subtitle: settingsQuery.data.deal_subtitle,
      deal_code: settingsQuery.data.deal_code,
      deal_enabled: settingsQuery.data.deal_enabled,
      deal_target_date: settingsQuery.data.deal_target_date,
      featured_promotion_id: settingsQuery.data.featured_promotion_id ?? null,
      support_email: settingsQuery.data.support_email,
      support_phone: settingsQuery.data.support_phone,
      announcement_text: settingsQuery.data.announcement_text,
      facebook_url: settingsQuery.data.facebook_url,
      instagram_url: settingsQuery.data.instagram_url,
      tiktok_url: settingsQuery.data.tiktok_url,
      youtube_url: settingsQuery.data.youtube_url,
    });
  }, [settingsQuery.data]);

  const promotionOptions = useMemo(() => {
    const base = [{ label: "None", value: "0" }];
    return base.concat(
      (promotionsQuery.data || []).map((promotion) => ({
        label: promotion.code,
        value: String(promotion.id),
      })),
    );
  }, [promotionsQuery.data]);

  const updateField = (field: string, value: string | boolean | number | null) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      await updateAdminHomePageSettings({
        ...form,
        featured_promotion_id: Number(form.featured_promotion_id || 0) || null,
      });
      await queryClient.invalidateQueries({ queryKey: ["homepage-settings"] });
      Alert.alert("Saved", "Homepage settings are now synced to the store.");
    } catch (error) {
      Alert.alert("Save failed", error instanceof Error ? error.message : "Could not save homepage settings.");
    } finally {
      setSaving(false);
    }
  };

  if (settingsQuery.isLoading) {
    return (
      <ScreenShell title="Homepage settings" showBackButton>
        <GlassPanel style={styles.loadingPanel}>
          <ActivityIndicator color={colors.primary} />
        </GlassPanel>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Homepage settings" subtitle="This controls the same storefront content used by the web admin." showBackButton>
      <GlassPanel style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>Hero copy</Text>
        <FormField label="Hero badge" value={String(form.hero_badge || "")} onChangeText={(value) => updateField("hero_badge", value)} />
        <FormField label="Title line one" value={String(form.hero_title_line_one || "")} onChangeText={(value) => updateField("hero_title_line_one", value)} />
        <FormField label="Title line two" value={String(form.hero_title_line_two || "")} onChangeText={(value) => updateField("hero_title_line_two", value)} />
        <FormField label="Hero description" value={String(form.hero_description || "")} onChangeText={(value) => updateField("hero_description", value)} multiline />
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>Hero stats</Text>
        <FormField label="Stat one label" value={String(form.hero_stat_one_label || "")} onChangeText={(value) => updateField("hero_stat_one_label", value)} />
        <FormField label="Stat one value" value={String(form.hero_stat_one_value || "")} onChangeText={(value) => updateField("hero_stat_one_value", value)} />
        <FormField label="Stat two label" value={String(form.hero_stat_two_label || "")} onChangeText={(value) => updateField("hero_stat_two_label", value)} />
        <FormField label="Stat two value" value={String(form.hero_stat_two_value || "")} onChangeText={(value) => updateField("hero_stat_two_value", value)} />
        <FormField label="Stat three label" value={String(form.hero_stat_three_label || "")} onChangeText={(value) => updateField("hero_stat_three_label", value)} />
        <FormField label="Stat three value" value={String(form.hero_stat_three_value || "")} onChangeText={(value) => updateField("hero_stat_three_value", value)} />
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>Deal banner</Text>
        <Pressable style={styles.switchRow} onPress={() => updateField("deal_enabled", !form.deal_enabled)}>
          <Text style={styles.switchLabel}>Enable homepage deal</Text>
          <Switch value={Boolean(form.deal_enabled)} onValueChange={(value) => updateField("deal_enabled", value)} trackColor={{ true: colors.primary, false: "#33434b" }} />
        </Pressable>
        <FormField label="Deal badge" value={String(form.deal_badge || "")} onChangeText={(value) => updateField("deal_badge", value)} />
        <FormField label="Deal title" value={String(form.deal_title || "")} onChangeText={(value) => updateField("deal_title", value)} />
        <FormField label="Deal subtitle" value={String(form.deal_subtitle || "")} onChangeText={(value) => updateField("deal_subtitle", value)} multiline />
        <FormField label="Fallback deal code" value={String(form.deal_code || "")} onChangeText={(value) => updateField("deal_code", value)} />
        <DateTimeField label="Deal target date" value={String(form.deal_target_date || new Date().toISOString())} onChange={(value) => updateField("deal_target_date", value)} />
        <Text style={styles.switchLabel}>Featured promotion</Text>
        <ChipSelector
          options={promotionOptions}
          selectedValue={String(form.featured_promotion_id || 0)}
          onChange={(value) => updateField("featured_promotion_id", Number(value))}
        />
      </GlassPanel>

      <GlassPanel style={styles.sectionPanel}>
        <Text style={styles.sectionTitle}>Support and socials</Text>
        <FormField label="Support email" value={String(form.support_email || "")} onChangeText={(value) => updateField("support_email", value)} keyboardType="email-address" autoCapitalize="none" />
        <FormField label="Support phone" value={String(form.support_phone || "")} onChangeText={(value) => updateField("support_phone", value)} keyboardType="phone-pad" />
        <FormField label="Announcement text" value={String(form.announcement_text || "")} onChangeText={(value) => updateField("announcement_text", value)} multiline />
        <FormField label="Facebook URL" value={String(form.facebook_url || "")} onChangeText={(value) => updateField("facebook_url", value)} autoCapitalize="none" />
        <FormField label="Instagram URL" value={String(form.instagram_url || "")} onChangeText={(value) => updateField("instagram_url", value)} autoCapitalize="none" />
        <FormField label="TikTok URL" value={String(form.tiktok_url || "")} onChangeText={(value) => updateField("tiktok_url", value)} autoCapitalize="none" />
        <FormField label="YouTube URL" value={String(form.youtube_url || "")} onChangeText={(value) => updateField("youtube_url", value)} autoCapitalize="none" />
      </GlassPanel>

      <Pressable onPress={saveSettings} disabled={saving}>
        <LinearGradient colors={gradients.primary} style={styles.saveButton}>
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Text style={styles.saveText}>Save homepage settings</Text>
              <Ionicons name="checkmark-circle" size={18} color={colors.background} />
            </>
          )}
        </LinearGradient>
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
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.bodyBold,
    fontSize: 18,
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
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  saveText: {
    color: colors.background,
    fontFamily: typography.bodyBold,
    fontSize: 15,
  },
});
