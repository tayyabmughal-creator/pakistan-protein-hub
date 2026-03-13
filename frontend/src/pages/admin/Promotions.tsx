import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { createPromotion, deletePromotion, fetchAdminPromotions, updatePromotion } from "@/lib/api";

const emptyForm = {
  code: "",
  description: "",
  discount_percentage: 10,
  valid_from: "",
  valid_to: "",
  active: true,
  usage_limit: 100,
  used_count: 0,
};

const toDateTimeLocal = (value?: string) => {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 16);
};

const Promotions = () => {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<any | null>(null);
  const [form, setForm] = useState<any>(emptyForm);

  const loadPromotions = async () => {
    try {
      const data = await fetchAdminPromotions();
      setPromotions(data);
    } catch {
      toast.error("Failed to load deals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPromotions();
  }, []);

  const openDialog = (promotion?: any) => {
    if (promotion) {
      setEditingPromotion(promotion);
      setForm({
        ...promotion,
        valid_from: toDateTimeLocal(promotion.valid_from),
        valid_to: toDateTimeLocal(promotion.valid_to),
      });
    } else {
      const now = new Date();
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      setEditingPromotion(null);
      setForm({
        ...emptyForm,
        valid_from: now.toISOString().slice(0, 16),
        valid_to: nextWeek.toISOString().slice(0, 16),
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        discount_percentage: Number(form.discount_percentage),
        usage_limit: Number(form.usage_limit),
        used_count: Number(form.used_count),
        valid_from: new Date(form.valid_from).toISOString(),
        valid_to: new Date(form.valid_to).toISOString(),
      };

      if (editingPromotion) {
        await updatePromotion(editingPromotion.id, payload);
        toast.success("Deal updated");
      } else {
        await createPromotion(payload);
        toast.success("Deal created");
      }

      setIsDialogOpen(false);
      loadPromotions();
    } catch (error: any) {
      const detail =
        error?.response?.data?.code?.[0] ||
        error?.response?.data?.discount_percentage?.[0] ||
        error?.response?.data?.valid_to?.[0] ||
        error?.response?.data?.detail ||
        "Failed to save deal";
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this deal?")) return;
    try {
      await deletePromotion(id);
      toast.success("Deal deleted");
      loadPromotions();
    } catch {
      toast.error("Failed to delete deal");
    }
  };

  return (
    <AdminLayout title="Deals">
      <div className="mb-6 flex justify-end">
        <Button onClick={() => openDialog()} className="gap-2 shadow-glow">
          <Plus className="w-4 h-4" /> Add Deal
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card-gradient overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Validity</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center">Loading deals...</TableCell></TableRow>
            ) : promotions.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center">No deals found.</TableCell></TableRow>
            ) : (
              promotions.map((promotion) => (
                <TableRow key={promotion.id} className="border-border hover:bg-secondary/30">
                  <TableCell>
                    <div className="font-semibold">{promotion.code}</div>
                    <div className="text-xs text-muted-foreground">{promotion.description || "No description"}</div>
                  </TableCell>
                  <TableCell>{promotion.discount_percentage}% OFF</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                      promotion.is_valid
                        ? "bg-emerald-500/10 text-emerald-300"
                        : promotion.active
                          ? "bg-amber-500/10 text-amber-300"
                          : "bg-zinc-800 text-zinc-300"
                    }`}>
                      {promotion.is_valid ? "Live" : promotion.active ? "Inactive Window" : "Disabled"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(promotion.valid_from).toLocaleDateString()} to {new Date(promotion.valid_to).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{promotion.used_count}/{promotion.usage_limit}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openDialog(promotion)}>
                        <Pencil className="h-4 w-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(promotion.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[640px] bg-card border-border">
          <DialogHeader>
            <DialogTitle>{editingPromotion ? "Edit Deal" : "Add Deal"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm((prev: any) => ({ ...prev, code: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Discount Percentage</Label>
                <Input type="number" min="1" max="100" value={form.discount_percentage} onChange={(e) => setForm((prev: any) => ({ ...prev, discount_percentage: e.target.value }))} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((prev: any) => ({ ...prev, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valid From</Label>
                <Input type="datetime-local" value={form.valid_from} onChange={(e) => setForm((prev: any) => ({ ...prev, valid_from: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Valid To</Label>
                <Input type="datetime-local" value={form.valid_to} onChange={(e) => setForm((prev: any) => ({ ...prev, valid_to: e.target.value }))} required />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Usage Limit</Label>
                <Input type="number" min="1" value={form.usage_limit} onChange={(e) => setForm((prev: any) => ({ ...prev, usage_limit: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Used Count</Label>
                <Input type="number" min="0" value={form.used_count} onChange={(e) => setForm((prev: any) => ({ ...prev, used_count: e.target.value }))} required />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
              <div>
                <p className="font-medium">Active</p>
                <p className="text-sm text-muted-foreground">Inactive deals stay saved but are hidden from customers.</p>
              </div>
              <Switch checked={!!form.active} onCheckedChange={(checked) => setForm((prev: any) => ({ ...prev, active: checked }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Deal"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default Promotions;
