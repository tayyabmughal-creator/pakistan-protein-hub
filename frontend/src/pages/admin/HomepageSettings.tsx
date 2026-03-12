import { useEffect, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { fetchAdminHomePageSettings, updateAdminHomePageSettings } from "@/lib/api";
import { toast } from "sonner";

const HomepageSettings = () => {
  const [form, setForm] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setForm(await fetchAdminHomePageSettings());
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

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateAdminHomePageSettings(form);
      toast.success("Homepage settings saved");
    } catch {
      toast.error("Failed to save homepage settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="Homepage">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
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

      <div className="mt-8 grid grid-cols-1 xl:grid-cols-2 gap-8">
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Deal Banner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={form.deal_badge} onChange={(e) => updateField("deal_badge", e.target.value)} placeholder="Deal badge" />
            <Input value={form.deal_title} onChange={(e) => updateField("deal_title", e.target.value)} placeholder="Deal title" />
            <Input value={form.deal_subtitle} onChange={(e) => updateField("deal_subtitle", e.target.value)} placeholder="Deal subtitle" />
            <Input value={form.deal_code} onChange={(e) => updateField("deal_code", e.target.value)} placeholder="Coupon code" />
            <div className="space-y-2">
              <Label>Target Date</Label>
              <Input
                type="datetime-local"
                value={form.deal_target_date ? new Date(form.deal_target_date).toISOString().slice(0, 16) : ""}
                onChange={(e) => updateField("deal_target_date", new Date(e.target.value).toISOString())}
              />
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

      <div className="mt-8 flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="min-w-40">
          {saving ? "Saving..." : "Save Homepage"}
        </Button>
      </div>
    </AdminLayout>
  );
};

export default HomepageSettings;
