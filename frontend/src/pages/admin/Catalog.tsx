import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  createVariant,
  deleteVariant,
  fetchAdminBrands,
  fetchAdminProduct,
  fetchAdminProducts,
  setProductPublished,
  updateAdminProduct,
  updateVariant,
} from "@/lib/adminApi";
import { getErrorMessage } from "@/lib/errors";
import {
  CAP,
  type AdminBrand,
  type AdminProductDetail,
  type AdminProductRow,
  type AdminVariant,
  type CompletenessCheck,
} from "@/lib/types";

const money = (value: string | number) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

const Catalog = () => {
  const { can } = useCapabilities();

  const [rows, setRows] = useState<AdminProductRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [detail, setDetail] = useState<AdminProductDetail | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAdminProducts({
        search,
        incomplete: onlyIncomplete ? "true" : undefined,
      });
      setRows(data.results);
      setCount(data.count);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not load the catalogue"));
    } finally {
      setLoading(false);
    }
  }, [search, onlyIncomplete]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const open = async (id: number) => {
    try {
      setDetail(await fetchAdminProduct(id));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not open that product"));
    }
  };

  if (detail) {
    return (
      <AdminLayout title={detail.name}>
        <ProductEditor
          product={detail}
          canEdit={can(CAP.CATALOG_EDIT)}
          canPublish={can(CAP.CATALOG_PUBLISH)}
          onChanged={setDetail}
          onBack={() => {
            setDetail(null);
            load();
          }}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Catalogue">
      <div className="space-y-6">
        <Card className="bg-card-gradient border-border">
          <CardHeader className="gap-4 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="font-heading">
                Products{" "}
                <span className="text-sm font-normal text-muted-foreground">({count})</span>
              </CardTitle>
              <Button
                variant={onlyIncomplete ? "default" : "outline"}
                size="sm"
                onClick={() => setOnlyIncomplete((current) => !current)}
              >
                {onlyIncomplete ? "Showing incomplete only" : "Show incomplete only"}
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, SKU or brand"
                className="pl-9"
                aria-label="Search the catalogue"
              />
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading catalogue…</p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Nothing matches that.</p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => open(row.id)}
                      className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                        {row.primary_image ? (
                          <img
                            src={row.primary_image}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                            no image
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{row.name}</span>
                          <Badge
                            variant="outline"
                            className={
                              row.publish_status === "PUBLISHED"
                                ? "border-emerald-500/50 text-emerald-600"
                                : "border-amber-500/50 text-amber-600"
                            }
                          >
                            {row.publish_status === "PUBLISHED" ? "Live" : "Draft"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {row.brand_name || "No brand"} · {row.category_name} ·{" "}
                          {row.variant_count} variant{row.variant_count === 1 ? "" : "s"} ·{" "}
                          {row.media_count} image{row.media_count === 1 ? "" : "s"}
                        </p>
                      </div>

                      <div className="shrink-0 text-right text-sm">
                        <p
                          className={`font-semibold tabular-nums ${
                            row.total_available <= 0 ? "text-destructive" : ""
                          }`}
                        >
                          {row.total_available}
                        </p>
                        <p className="text-xs text-muted-foreground">available</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

// ---------------------------------------------------------------------------

interface EditorProps {
  product: AdminProductDetail;
  canEdit: boolean;
  canPublish: boolean;
  onChanged: (product: AdminProductDetail) => void;
  onBack: () => void;
}

const ProductEditor = ({ product, canEdit, canPublish, onChanged, onBack }: EditorProps) => {
  const [form, setForm] = useState(product);
  const [saving, setSaving] = useState(false);
  const [brands, setBrands] = useState<AdminBrand[]>([]);
  const [variantDialog, setVariantDialog] = useState<AdminVariant | "new" | null>(null);

  useEffect(() => setForm(product), [product]);
  useEffect(() => {
    fetchAdminBrands().then(setBrands).catch(() => undefined);
  }, []);

  const field = <K extends keyof AdminProductDetail>(key: K, value: AdminProductDetail[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    try {
      setSaving(true);
      const updated = await updateAdminProduct(product.id, {
        name: form.name,
        brand_ref: form.brand_ref,
        short_description: form.short_description,
        description: form.description,
        benefits: form.benefits,
        ingredients: form.ingredients,
        usage_directions: form.usage_directions,
        warnings: form.warnings,
        allergens: form.allergens,
        nutrition_facts: form.nutrition_facts,
        supplement_type: form.supplement_type,
        seo_title: form.seo_title,
        seo_description: form.seo_description,
      });
      onChanged(updated);
      toast.success("Saved");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not save the product"));
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    const goingLive = product.publish_status !== "PUBLISHED";
    try {
      onChanged(await setProductPublished(product.id, goingLive));
      toast.success(goingLive ? "Product is live" : "Product taken down");
    } catch (error: unknown) {
      // The API refuses with the specific blocking reasons; show them rather
      // than a generic failure, because they are the work still to do.
      toast.error(getErrorMessage(error, "Could not change the publish state"));
    }
  };

  const isLive = product.publish_status === "PUBLISHED";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> All products
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={isLive ? "border-emerald-500/50 text-emerald-600" : "border-amber-500/50 text-amber-600"}
          >
            {isLive ? "Live" : "Draft"}
          </Badge>
          {canEdit && (
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
          {canPublish && (
            <Button
              size="sm"
              variant={isLive ? "outline" : "default"}
              onClick={togglePublish}
              disabled={!isLive && !product.completeness.can_publish}
              title={
                !isLive && !product.completeness.can_publish
                  ? `Still missing: ${product.completeness.blocking.join(", ")}`
                  : undefined
              }
            >
              {isLive ? "Take down" : "Publish"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Tabs defaultValue="content">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="variants">
                Variants ({product.variants.length})
              </TabsTrigger>
              <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
            </TabsList>

            <TabsContent value="content" className="mt-4 space-y-4">
              <Card className="bg-card-gradient border-border">
                <CardContent className="space-y-4 pt-6">
                  <Text label="Name" value={form.name} onChange={(v) => field("name", v)} disabled={!canEdit} />

                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input value={`/products/${form.slug}`} disabled readOnly />
                    {/* A slug is a live URL. Changing one is a deliberate act
                        with a redirect, not a side effect of an edit. */}
                    <p className="text-xs text-muted-foreground">
                      Fixed. Changing it would break every existing link to this page.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="brand">Brand</Label>
                    <Select
                      value={form.brand_ref ? String(form.brand_ref) : ""}
                      onValueChange={(value) => field("brand_ref", Number(value))}
                      disabled={!canEdit}
                    >
                      <SelectTrigger id="brand">
                        <SelectValue placeholder="Choose a brand" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map((brand) => (
                          <SelectItem key={brand.id} value={String(brand.id)}>
                            {brand.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Text
                    label="Short description"
                    value={form.short_description}
                    onChange={(v) => field("short_description", v)}
                    disabled={!canEdit}
                    hint="Shown on product cards and in search results."
                  />
                  <Area
                    label="Full description"
                    value={form.description}
                    onChange={(v) => field("description", v)}
                    disabled={!canEdit}
                    rows={5}
                  />
                  <Area
                    label="Benefits"
                    value={form.benefits}
                    onChange={(v) => field("benefits", v)}
                    disabled={!canEdit}
                    hint="One per line."
                  />
                  <Area
                    label="Ingredients"
                    value={form.ingredients}
                    onChange={(v) => field("ingredients", v)}
                    disabled={!canEdit}
                    hint="Customers with allergies read this before buying."
                  />
                  <Area
                    label="How to use it"
                    value={form.usage_directions}
                    onChange={(v) => field("usage_directions", v)}
                    disabled={!canEdit}
                  />
                  <Area
                    label="Warnings"
                    value={form.warnings}
                    onChange={(v) => field("warnings", v)}
                    disabled={!canEdit}
                    hint="A safety obligation, not a nice-to-have."
                  />
                  <Area
                    label="Allergens"
                    value={form.allergens}
                    onChange={(v) => field("allergens", v)}
                    disabled={!canEdit}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="variants" className="mt-4">
              <VariantMatrix
                product={product}
                canEdit={canEdit}
                onEdit={setVariantDialog}
                onChanged={onChanged}
              />
            </TabsContent>

            <TabsContent value="nutrition" className="mt-4">
              <NutritionEditor
                rows={form.nutrition_facts}
                disabled={!canEdit}
                onChange={(rows) => field("nutrition_facts", rows)}
              />
            </TabsContent>

            <TabsContent value="seo" className="mt-4">
              <Card className="bg-card-gradient border-border">
                <CardContent className="space-y-4 pt-6">
                  <Text
                    label="SEO title"
                    value={form.seo_title}
                    onChange={(v) => field("seo_title", v)}
                    disabled={!canEdit}
                    hint={`${form.seo_title.length}/70 — what shows as the headline in search results.`}
                  />
                  <Area
                    label="SEO description"
                    value={form.seo_description}
                    onChange={(v) => field("seo_description", v)}
                    disabled={!canEdit}
                    rows={3}
                    hint={`${form.seo_description.length}/160 — leave this blank and search engines write their own, usually worse.`}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <ChecklistCard completeness={product.completeness} />

          <Card className="bg-card-gradient border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-base">
                Images ({product.media.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {product.media.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No images. Supplements do not sell without a picture of the tub.
                </p>
              ) : (
                product.media.map((item) => (
                  <div key={item.id} className="flex gap-3 rounded-xl border border-border/60 p-2">
                    <img
                      src={item.image}
                      alt={item.alt_text}
                      className="h-16 w-16 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1 text-sm">
                      {item.is_primary && (
                        <Badge variant="outline" className="mb-1">
                          Primary
                        </Badge>
                      )}
                      <p className={item.alt_text ? "" : "text-destructive"}>
                        {item.alt_text || "No description — needed for accessibility"}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <VariantDialog
        state={variantDialog}
        product={product}
        onClose={() => setVariantDialog(null)}
        onSaved={async () => {
          setVariantDialog(null);
          onChanged(await fetchAdminProduct(product.id));
        }}
      />
    </div>
  );
};

const ChecklistCard = ({ completeness }: { completeness: AdminProductDetail["completeness"] }) => (
  <Card className="bg-card-gradient border-border">
    <CardHeader className="pb-3">
      <CardTitle className="font-heading text-base">
        Ready to publish? {completeness.score}%
      </CardTitle>
      {!completeness.can_publish && (
        <p className="text-xs text-muted-foreground">
          The items marked required must be done before this can go live.
        </p>
      )}
    </CardHeader>
    <CardContent className="space-y-2">
      {completeness.checks.map((check: CompletenessCheck) => (
        <div key={check.key} className="flex items-start gap-2 text-sm">
          {check.passed ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <X
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                check.blocking ? "text-destructive" : "text-muted-foreground"
              }`}
            />
          )}
          <div className="min-w-0">
            <p className={check.passed ? "text-muted-foreground line-through" : ""}>
              {check.label}
              {check.blocking && !check.passed && (
                <span className="ml-1 text-xs text-destructive">required</span>
              )}
            </p>
            {/* Say why, so the list reads as guidance rather than nagging. */}
            {!check.passed && <p className="text-xs text-muted-foreground">{check.why}</p>}
          </div>
        </div>
      ))}
    </CardContent>
  </Card>
);

const VariantMatrix = ({
  product,
  canEdit,
  onEdit,
  onChanged,
}: {
  product: AdminProductDetail;
  canEdit: boolean;
  onEdit: (state: AdminVariant | "new") => void;
  onChanged: (product: AdminProductDetail) => void;
}) => {
  const remove = async (variant: AdminVariant) => {
    try {
      await deleteVariant(variant.id);
      onChanged(await fetchAdminProduct(product.id));
      toast.success(`${variant.sku} removed`);
    } catch (error: unknown) {
      // Refusals here are meaningful: sold variants and the last default one
      // cannot go. Show the reason.
      toast.error(getErrorMessage(error, "Could not remove that variant"));
    }
  };

  return (
    <Card className="bg-card-gradient border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="font-heading text-base">Variants</CardTitle>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => onEdit("new")}>
            <Plus className="mr-1.5 h-4 w-4" /> Add variant
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {product.variants.map((variant) => (
            <li key={variant.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{variant.descriptor || "Standard"}</span>
                  {variant.is_default && <Badge variant="outline">Default</Badge>}
                  {!variant.is_active && <Badge variant="outline">Inactive</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  <code>{variant.sku}</code>
                  {variant.serving_count ? ` · ${variant.serving_count} servings` : ""}
                </p>
              </div>

              <div className="text-sm">
                <p className="font-semibold tabular-nums">{money(variant.price)}</p>
                {variant.has_genuine_discount && (
                  <p className="text-xs text-muted-foreground line-through">
                    {money(variant.compare_at_price ?? 0)}
                  </p>
                )}
              </div>

              {/* Shown, not editable. Stock moves through the inventory
                  operations so every change records why. */}
              <div className="text-right text-sm">
                <p
                  className={`tabular-nums ${variant.available <= 0 ? "text-destructive" : ""}`}
                >
                  {variant.available} available
                </p>
                {variant.reserved > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {variant.on_hand} on hand · {variant.reserved} reserved
                  </p>
                )}
              </div>

              {canEdit && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onEdit(variant)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => remove(variant)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

const VariantDialog = ({
  state,
  product,
  onClose,
  onSaved,
}: {
  state: AdminVariant | "new" | null;
  product: AdminProductDetail;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const isNew = state === "new";
  const existing = state && state !== "new" ? state : null;

  const [form, setForm] = useState({
    sku: "",
    flavor: "",
    size_label: "",
    price: "",
    compare_at_price: "",
    serving_count: "",
    serving_size: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    setForm({
      sku: existing?.sku ?? "",
      flavor: existing?.flavor ?? "",
      size_label: existing?.size_label ?? "",
      price: existing?.price ?? "",
      compare_at_price: existing?.compare_at_price ?? "",
      serving_count: existing?.serving_count ? String(existing.serving_count) : "",
      serving_size: existing?.serving_size ?? "",
      is_active: existing?.is_active ?? true,
    });
  }, [state, existing]);

  if (!state) return null;

  const submit = async () => {
    const payload = {
      product: product.id,
      sku: form.sku.trim(),
      flavor: form.flavor,
      size_label: form.size_label,
      price: form.price,
      compare_at_price: form.compare_at_price || null,
      serving_count: form.serving_count ? Number(form.serving_count) : null,
      serving_size: form.serving_size,
      is_active: form.is_active,
    };
    try {
      setSaving(true);
      if (isNew) await createVariant(payload);
      else await updateVariant(existing!.id, payload);
      toast.success(isNew ? "Variant added" : "Variant updated");
      onSaved();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not save the variant"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add a variant" : `Edit ${existing?.sku}`}</DialogTitle>
          <DialogDescription>
            A variant is the thing a customer actually buys — one flavour in one
            size, with its own SKU and price.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="v-sku">SKU</Label>
            <Input
              id="v-sku"
              value={form.sku}
              onChange={(event) => setForm((c) => ({ ...c, sku: event.target.value }))}
              placeholder="PN-WHEY-CHOC-2KG"
            />
            <p className="text-xs text-muted-foreground">
              What staff read off the tub. Make it readable, not a number.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-flavor">Flavour</Label>
            <Input
              id="v-flavor"
              value={form.flavor}
              onChange={(event) => setForm((c) => ({ ...c, flavor: event.target.value }))}
              placeholder="Chocolate"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-size">Size</Label>
            <Input
              id="v-size"
              value={form.size_label}
              onChange={(event) => setForm((c) => ({ ...c, size_label: event.target.value }))}
              placeholder="2kg"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-price">Price (PKR)</Label>
            <Input
              id="v-price"
              type="number"
              value={form.price}
              onChange={(event) => setForm((c) => ({ ...c, price: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-compare">"Was" price</Label>
            <Input
              id="v-compare"
              type="number"
              value={form.compare_at_price}
              onChange={(event) =>
                setForm((c) => ({ ...c, compare_at_price: event.target.value }))
              }
            />
            {/* The API refuses a compare price that is not a saving, rather
                than silently not rendering it. Say so up front. */}
            <p className="text-xs text-muted-foreground">
              Must be higher than the price, or it is not a saving. Leave empty
              if there is no discount.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-servings">Servings</Label>
            <Input
              id="v-servings"
              type="number"
              value={form.serving_count}
              onChange={(event) =>
                setForm((c) => ({ ...c, serving_count: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-serving-size">Serving size</Label>
            <Input
              id="v-serving-size"
              value={form.serving_size}
              onChange={(event) =>
                setForm((c) => ({ ...c, serving_size: event.target.value }))
              }
              placeholder="1 scoop (30g)"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !form.sku.trim() || !form.price}>
            {saving ? "Saving…" : isNew ? "Add variant" : "Save variant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const NutritionEditor = ({
  rows,
  disabled,
  onChange,
}: {
  rows: AdminProductDetail["nutrition_facts"];
  disabled: boolean;
  onChange: (rows: AdminProductDetail["nutrition_facts"]) => void;
}) => (
  <Card className="bg-card-gradient border-border">
    <CardHeader className="pb-3">
      <CardTitle className="font-heading text-base">Nutrition facts</CardTitle>
      <p className="text-xs text-muted-foreground">
        The panel customers compare on. Stored as rows so the product page can
        render a real table.
      </p>
    </CardHeader>
    <CardContent className="space-y-3">
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <Input
            value={row.label}
            disabled={disabled}
            placeholder="Protein"
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, label: event.target.value };
              onChange(next);
            }}
          />
          <Input
            value={row.amount ?? ""}
            disabled={disabled}
            placeholder="24g"
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, amount: event.target.value };
              onChange(next);
            }}
          />
          <Input
            value={row.daily_value ?? ""}
            disabled={disabled}
            placeholder="48%"
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, daily_value: event.target.value };
              onChange(next);
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {!disabled && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, { label: "", amount: "", daily_value: "" }])}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add a row
        </Button>
      )}
    </CardContent>
  </Card>
);

const Text = ({
  label,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
}) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <Input value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const Area = ({
  label,
  value,
  onChange,
  disabled,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
  hint?: string;
}) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <Textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      rows={rows}
    />
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export default Catalog;
