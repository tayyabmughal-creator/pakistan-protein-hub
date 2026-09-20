import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ClipboardCheck,
  History,
  PackagePlus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  adjustStock,
  countStock,
  fetchInventory,
  fetchStockMovements,
  receiveStock,
} from "@/lib/adminApi";
import { getErrorMessage } from "@/lib/errors";
import { CAP, type InventoryBalance, type StockMovement } from "@/lib/types";

type StockFilter = "" | "low" | "out" | "never_counted";
type OpenAction = "receive" | "adjust" | "count" | "history" | null;

const STOCK_FILTERS: { value: StockFilter; label: string }[] = [
  { value: "", label: "All stock" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
  { value: "never_counted", label: "Never counted" },
];

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }) : "—";

const Inventory = () => {
  const { can } = useCapabilities();

  const [rows, setRows] = useState<InventoryBalance[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<InventoryBalance | null>(null);
  const [openAction, setOpenAction] = useState<OpenAction>(null);
  const [submitting, setSubmitting] = useState(false);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchInventory({ search, stock: stockFilter, page });
      setRows(data.results);
      setCount(data.count);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not load stock levels"));
    } finally {
      setLoading(false);
    }
  }, [search, stockFilter, page]);

  useEffect(() => {
    // Debounced so typing a SKU does not fire a request per keystroke.
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const openFor = (row: InventoryBalance, action: OpenAction) => {
    setSelected(row);
    setOpenAction(action);
    if (action === "history") {
      fetchStockMovements({ variant: row.variant })
        .then((data) => setMovements(data.results))
        .catch((error: unknown) =>
          toast.error(getErrorMessage(error, "Could not load movement history")),
        );
    }
  };

  const closeDialog = () => {
    setOpenAction(null);
    setSelected(null);
    setMovements([]);
  };

  const afterChange = (updated: InventoryBalance, message: string) => {
    setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    toast.success(message);
    closeDialog();
  };

  const neverCountedCount = rows.filter((row) => row.never_counted).length;

  return (
    <AdminLayout title="Inventory">
      <div className="space-y-6">
        {/* Migrated balances are not observations. Say so, rather than letting
            a carried-over number pass as a counted one. */}
        {stockFilter !== "never_counted" && neverCountedCount > 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div className="text-sm">
                  <p className="font-medium">
                    {neverCountedCount} item{neverCountedCount === 1 ? "" : "s"} on this page
                    ha{neverCountedCount === 1 ? "s" : "ve"} never been counted.
                  </p>
                  <p className="text-muted-foreground">
                    These figures came across from the old system and were never checked
                    against the shelf. Count them before relying on them.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setStockFilter("never_counted");
                  setPage(1);
                }}
              >
                Show only these
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="bg-card-gradient border-border">
          <CardHeader className="gap-4 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="font-heading">
                Stock{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({count} item{count === 1 ? "" : "s"})
                </span>
              </CardTitle>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by SKU, product or barcode"
                  className="pl-9"
                  aria-label="Search stock"
                />
              </div>
              <Select
                value={stockFilter || "all"}
                onValueChange={(value) => {
                  setStockFilter(value === "all" ? "" : (value as StockFilter));
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-52">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STOCK_FILTERS.map((option) => (
                    <SelectItem key={option.value || "all"} value={option.value || "all"}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading stock…</p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Nothing matches that.</p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => (
                  <li key={row.id} className="p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium">{row.product_name}</p>
                          {row.variant_description && (
                            <span className="text-sm text-muted-foreground">
                              {row.variant_description}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <code className="rounded bg-muted px-1.5 py-0.5">{row.sku}</code>
                          <span>{row.brand}</span>
                          {row.never_counted && (
                            <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                              Never counted
                            </Badge>
                          )}
                          {row.is_out_of_stock && <Badge variant="destructive">Out of stock</Badge>}
                          {row.is_low_stock && (
                            <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                              Low stock
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Three numbers, always together. "Available" is the one
                          that decides whether it can be sold. */}
                      <div className="flex shrink-0 gap-6 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">On hand</p>
                          <p className="font-semibold tabular-nums">{row.on_hand}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Reserved</p>
                          <p className="font-semibold tabular-nums text-muted-foreground">
                            {row.reserved}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Available</p>
                          <p
                            className={`font-semibold tabular-nums ${
                              row.available <= 0 ? "text-destructive" : "text-primary"
                            }`}
                          >
                            {row.available}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {can(CAP.INVENTORY_RECEIVE) && (
                          <Button size="sm" variant="outline" onClick={() => openFor(row, "receive")}>
                            <PackagePlus className="mr-1.5 h-4 w-4" /> Receive
                          </Button>
                        )}
                        {can(CAP.INVENTORY_ADJUST) && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openFor(row, "count")}>
                              <ClipboardCheck className="mr-1.5 h-4 w-4" /> Count
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => openFor(row, "adjust")}>
                              Adjust
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => openFor(row, "history")}>
                          <History className="mr-1.5 h-4 w-4" /> History
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {count > rows.length && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 50 >= count}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      <ReceiveDialog
        open={openAction === "receive"}
        balance={selected}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onDone={afterChange}
        onClose={closeDialog}
      />
      <AdjustDialog
        open={openAction === "adjust"}
        balance={selected}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onDone={afterChange}
        onClose={closeDialog}
      />
      <CountDialog
        open={openAction === "count"}
        balance={selected}
        submitting={submitting}
        setSubmitting={setSubmitting}
        onDone={afterChange}
        onClose={closeDialog}
      />
      <HistoryDialog
        open={openAction === "history"}
        balance={selected}
        movements={movements}
        onClose={closeDialog}
      />
    </AdminLayout>
  );
};

interface DialogProps {
  open: boolean;
  balance: InventoryBalance | null;
  submitting: boolean;
  setSubmitting: (value: boolean) => void;
  onDone: (updated: InventoryBalance, message: string) => void;
  onClose: () => void;
}

const ReceiveDialog = ({ open, balance, submitting, setSubmitting, onDone, onClose }: DialogProps) => {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setQuantity("");
      setReason("");
    }
  }, [open]);

  const submit = async () => {
    if (!balance) return;
    try {
      setSubmitting(true);
      const updated = await receiveStock({
        variant: balance.variant,
        quantity: Number(quantity),
        reason,
      });
      onDone(updated, `Received ${quantity} × ${balance.sku}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not record the delivery"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive stock</DialogTitle>
          <DialogDescription>
            {balance?.product_name} · {balance?.sku} — currently {balance?.on_hand} on hand.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="receive-quantity">How many arrived?</Label>
            <Input
              id="receive-quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receive-reason">Supplier or delivery note</Label>
            <Input
              id="receive-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Delivery 4471 from ON Pakistan"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || Number(quantity) < 1}>
            {submitting ? "Recording…" : "Record delivery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AdjustDialog = ({ open, balance, submitting, setSubmitting, onDone, onClose }: DialogProps) => {
  const [delta, setDelta] = useState("");
  const [movementType, setMovementType] = useState<"DAMAGE" | "MANUAL_ADJUSTMENT">("DAMAGE");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setDelta("");
      setMovementType("DAMAGE");
      setReason("");
    }
  }, [open]);

  const submit = async () => {
    if (!balance) return;
    try {
      setSubmitting(true);
      const updated = await adjustStock({
        variant: balance.variant,
        delta: Number(delta),
        movement_type: movementType,
        reason,
      });
      onDone(updated, `Adjusted ${balance.sku} by ${Number(delta) > 0 ? "+" : ""}${delta}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not adjust the stock"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {balance?.product_name} · {balance?.sku} — {balance?.on_hand} on hand,{" "}
            {balance?.reserved} reserved.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adjust-type">What happened?</Label>
            <Select
              value={movementType}
              onValueChange={(value) => setMovementType(value as "DAMAGE" | "MANUAL_ADJUSTMENT")}
            >
              <SelectTrigger id="adjust-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAMAGE">Damaged or written off</SelectItem>
                <SelectItem value="MANUAL_ADJUSTMENT">Manual correction</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adjust-delta">Change</Label>
            <Input
              id="adjust-delta"
              type="number"
              value={delta}
              onChange={(event) => setDelta(event.target.value)}
              placeholder="e.g. -3"
            />
            <p className="text-xs text-muted-foreground">
              Negative removes stock, positive adds it.
            </p>
          </div>
          <div className="space-y-2">
            {/* Required, and the API refuses without it. "Why is this different
                from yesterday" must always have an answer. */}
            <Label htmlFor="adjust-reason">Reason (required)</Label>
            <Textarea
              id="adjust-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Three tubs with torn seals, discarded"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !reason.trim() || !delta || Number(delta) === 0}
          >
            {submitting ? "Saving…" : "Record adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CountDialog = ({ open, balance, submitting, setSubmitting, onDone, onClose }: DialogProps) => {
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setCounted("");
      setReason("");
    }
  }, [open]);

  const difference = counted === "" || !balance ? null : Number(counted) - balance.on_hand;

  const submit = async () => {
    if (!balance) return;
    try {
      setSubmitting(true);
      const updated = await countStock({
        variant: balance.variant,
        counted: Number(counted),
        reason,
      });
      onDone(updated, `Counted ${balance.sku}: ${counted} on the shelf`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not record the count"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Physical count</DialogTitle>
          <DialogDescription>
            {balance?.product_name} · {balance?.sku}. The system says{" "}
            <strong>{balance?.on_hand}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="count-quantity">How many are actually on the shelf?</Label>
            <Input
              id="count-quantity"
              type="number"
              min={0}
              value={counted}
              onChange={(event) => setCounted(event.target.value)}
              autoFocus
            />
          </div>

          {difference !== null && difference !== 0 && (
            <p
              className={`text-sm ${difference < 0 ? "text-destructive" : "text-primary"}`}
              role="status"
            >
              {difference > 0 ? "+" : ""}
              {difference} against the system. This difference will be recorded.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="count-reason">Note</Label>
            <Input
              id="count-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Monthly stocktake"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || counted === ""}>
            {submitting ? "Saving…" : "Record count"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const HistoryDialog = ({
  open,
  balance,
  movements,
  onClose,
}: {
  open: boolean;
  balance: InventoryBalance | null;
  movements: StockMovement[];
  onClose: () => void;
}) => (
  <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Movement history</DialogTitle>
        <DialogDescription>
          {balance?.product_name} · {balance?.sku}
        </DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] overflow-y-auto">
        {movements.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">No movements recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {movements.map((movement) => (
              <li key={movement.id} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{movement.movement_label}</p>
                    {movement.reason && (
                      <p className="text-sm text-muted-foreground">{movement.reason}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(movement.created_at)} · {movement.actor_email}
                      {movement.reference && ` · ${movement.reference}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-semibold tabular-nums ${
                        movement.quantity < 0 ? "text-destructive" : "text-primary"
                      }`}
                    >
                      {movement.quantity > 0 ? "+" : ""}
                      {movement.quantity}
                    </p>
                    {movement.balance_after !== null && (
                      <p className="text-xs text-muted-foreground">
                        → {movement.balance_after}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DialogContent>
  </Dialog>
);

export default Inventory;
