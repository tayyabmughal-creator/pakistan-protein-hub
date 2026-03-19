import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fetchAdminHomePageSettings, fetchAdminPromotions, updateAdminHomePageSettings } from "@/lib/api";
import { toast } from "sonner";

const HomepageSettings = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any | null>(null);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [homepageSettings, adminPromotions] = await Promise.all([
          fetchAdminHomePageSettings(),
          fetchAdminPromotions(),
        ]);
        setForm(homepageSettings);
        setPromotions(adminPromotions);
      } catch {
        toast.error("Failed to load homepage settings");
      }
    };

    loadSettings();
  }, []);

  if (!form) {
    return (
      <AdminLayout title="Homepage">
        <p className="text-sm text-muted-foreground">Loading homepage settings...</p>
      </AdminLayout>
    );
  }

  const updateField = (field: string, value: string) => {
    setForm((prev: any) => ({ ...prev, [field]: value }));
  };

  const normalizeUrl = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        ...form,
        facebook_url: normalizeUrl(form.facebook_url || ""),
        instagram_url: normalizeUrl(form.instagram_url || ""),
        tiktok_url: normalizeUrl(form.tiktok_url || ""),
        youtube_url: normalizeUrl(form.youtube_url || ""),
        featured_promotion_id: form.featured_promotion_id || null,
      };
      await updateAdminHomePageSettings(payload);
      setForm(payload);
      queryClient.invalidateQueries({ queryKey: ["homepage-settings"] });
      toast.success("Homepage settings saved");
    } catch (error: any) {
      const detail =
        error?.response?.data?.featured_promotion_id?.[0] ||
        error?.response?.data?.facebook_url?.[0] ||
        error?.response?.data?.instagram_url?.[0] ||
        error?.response?.data?.tiktok_url?.[0] ||
        error?.response?.data?.youtube_url?.[0] ||
        error?.response?.data?.detail ||
        "Failed to save homepage settings";
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  const dealStatus = !form.deal_enabled
    ? { label: "Hidden", classes: "bg-zinc-800 text-zinc-300 border-zinc-700" }
    : new Date(form.featured_promotion?.valid_to || form.effective_deal_target_date || form.deal_target_date).getTime() > Date.now()
      ? { label: "Live", classes: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" }
      : { label: "Expired", classes: "bg-amber-500/10 text-amber-300 border-amber-500/30" };

  return (
    <AdminLayout title="Homepage">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Hero Section</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Badge</Label>
              <Input value={form.hero_badge} onChange={(e) => updateField("hero_badge", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Title Line One</Label>
              <Input value={form.hero_title_line_one} onChange={(e) => updateField("hero_title_line_one", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Title Line Two</Label>
              <Input value={form.hero_title_line_two} onChange={(e) => updateField("hero_title_line_two", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.hero_description} onChange={(e) => updateField("hero_description", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Homepage Stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              ["hero_stat_one_value", "hero_stat_one_label", "Stat One"],
              ["hero_stat_two_value", "hero_stat_two_label", "Stat Two"],
              ["hero_stat_three_value", "hero_stat_three_label", "Stat Three"],
            ].map(([valueField, labelField, heading]) => (
              <div key={valueField} className="rounded-xl border border-border/60 p-4 space-y-3">
                <p className="font-medium">{heading}</p>
                <Input value={form[valueField]} onChange={(e) => updateField(valueField, e.target.value)} placeholder="Value" />
                <Input value={form[labelField]} onChange={(e) => updateField(labelField, e.target.value)} placeholder="Label" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="font-heading">Deal Banner</CardTitle>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${dealStatus.classes}`}>
                {dealStatus.label}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">Show sale on homepage</p>
                <p className="text-sm text-muted-foreground">Turn this off to hide the sale section completely.</p>
              </div>
              <Switch checked={!!form.deal_enabled} onCheckedChange={(checked) => setForm((prev: any) => ({ ...prev, deal_enabled: checked }))} />
            </div>
            <Input value={form.deal_badge} onChange={(e) => updateField("deal_badge", e.target.value)} placeholder="Deal badge" />
            <Input value={form.deal_title} onChange={(e) => updateField("deal_title", e.target.value)} placeholder="Deal title" />
            <Input value={form.deal_subtitle} onChange={(e) => updateField("deal_subtitle", e.target.value)} placeholder="Deal subtitle" />
            <div className="space-y-2">
              <Label>Featured Promotion</Label>
              <select
                value={form.featured_promotion_id || ""}
                onChange={(e) => {
                  const value = e.target.value ? Number(e.target.value) : null;
                  const selected = promotions.find((promotion) => promotion.id === value) || null;
                  setForm((prev: any) => ({
                    ...prev,
                    featured_promotion_id: value,
                    featured_promotion: selected,
                    effective_deal_code: selected?.code || prev.deal_code,
                    effective_deal_target_date: selected?.valid_to || prev.deal_target_date,
                  }));
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select a promotion</option>
                {promotions.map((promotion) => (
                  <option key={promotion.id} value={promotion.id}>
                    {promotion.code} ({promotion.discount_percentage}% off)
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Link a real deal so the homepage banner and checkout pricing stay synced.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Support & Announcement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={form.support_email || ""} onChange={(e) => updateField("support_email", e.target.value)} placeholder="Support email" />
            <Input value={form.support_phone || ""} onChange={(e) => updateField("support_phone", e.target.value)} placeholder="Support phone" />
            <Textarea value={form.announcement_text || ""} onChange={(e) => updateField("announcement_text", e.target.value)} placeholder="Announcement text" />
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Featured Deal Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`rounded-2xl border p-5 sm:p-6 ${!form.deal_enabled ? "border-zinc-700 bg-zinc-900/50" : new Date(form.featured_promotion?.valid_to || form.effective_deal_target_date || form.deal_target_date).getTime() > Date.now() ? "border-primary/30 bg-primary/10" : "border-amber-500/20 bg-amber-500/5"}`}>
              <div className="mb-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
                {!form.deal_enabled ? "Hidden on homepage" : new Date(form.featured_promotion?.valid_to || form.effective_deal_target_date || form.deal_target_date).getTime() > Date.now() ? "Live on homepage" : "Expired on homepage"}
              </div>
              <h3 className="mb-2 font-heading text-2xl font-bold text-white sm:text-3xl">{form.deal_title || "MEGA SALE"}</h3>
              <p className="mb-4 text-gray-300">
                {!form.deal_enabled
                  ? "This campaign is saved but fully hidden from the homepage."
                  : new Date(form.featured_promotion?.valid_to || form.effective_deal_target_date || form.deal_target_date).getTime() > Date.now()
                    ? form.deal_subtitle || "Up to 50% OFF on all proteins"
                    : "This campaign will stay visible in an ended state until you hide it or move the target date forward."}
              </p>
              {form.deal_enabled && new Date(form.featured_promotion?.valid_to || form.effective_deal_target_date || form.deal_target_date).getTime() > Date.now() && (
                <p className="text-sm text-gray-400">
                  Coupon code: <span className="rounded-lg bg-primary/20 px-3 py-1 font-mono font-bold text-primary">{form.featured_promotion?.code || form.effective_deal_code || form.deal_code || "POWER50"}</span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Social Handles</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Facebook URL</Label>
              <Input value={form.facebook_url || ""} onChange={(e) => updateField("facebook_url", e.target.value)} placeholder="https://facebook.com/paknutrition" />
            </div>
            <div className="space-y-2">
              <Label>Instagram URL</Label>
              <Input value={form.instagram_url || ""} onChange={(e) => updateField("instagram_url", e.target.value)} placeholder="https://instagram.com/paknutrition" />
            </div>
            <div className="space-y-2">
              <Label>TikTok URL</Label>
              <Input value={form.tiktok_url || ""} onChange={(e) => updateField("tiktok_url", e.target.value)} placeholder="https://tiktok.com/@paknutrition" />
            </div>
            <div className="space-y-2">
              <Label>YouTube URL</Label>
              <Input value={form.youtube_url || ""} onChange={(e) => updateField("youtube_url", e.target.value)} placeholder="https://youtube.com/@paknutrition" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto sm:min-w-40">
          {saving ? "Saving..." : "Save Homepage"}
        </Button>
      </div>
    </AdminLayout>
  );
};

export default HomepageSettings;
