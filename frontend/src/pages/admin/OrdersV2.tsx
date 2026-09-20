import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Info, Printer, Search, Undo2 } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCapabilities } from "@/hooks/useCapabilities";
import {
  addOrderNote,
  fetchAdminOrderDetail,
  fetchAdminOrdersV2,
  fetchOrderQueues,
  transitionOrder,
} from "@/lib/adminApi";
import { printDispatchSlip, orderReference } from "@/lib/dispatchSlip";
import { getErrorMessage } from "@/lib/errors";
import {
  CAP,
  type AdminOrderDetail,
  type AdminOrderRow,
  type FulfilmentStatus,
  type OrderQueues,
  type TransitionOption,
} from "@/lib/types";

const money = (value: string | number) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }) : "—";

/** Colour carries meaning: amber is "needs a human", green is done, red is money owed. */
const FULFILMENT_TONE: Record<string, string> = {
  PENDING_CONFIRMATION: "border-amber-500/50 text-amber-600",
  CONFIRMED: "border-blue-500/50 text-blue-600",
  READY_TO_PACK: "border-blue-500/50 text-blue-600",
  PACKED: "border-indigo-500/50 text-indigo-600",
  READY_FOR_PICKUP: "border-indigo-500/50 text-indigo-600",
  SHIPPED: "border-purple-500/50 text-purple-600",
  DELIVERED: "border-emerald-500/50 text-emerald-600",
  CANCELLED: "border-muted text-muted-foreground",
  RETURNED: "border-orange-500/50 text-orange-600",
};

const PAYMENT_TONE: Record<string, string> = {
  PAID: "border-emerald-500/50 text-emerald-600",
  COD_PENDING: "border-amber-500/50 text-amber-600",
  PENDING: "border-amber-500/50 text-amber-600",
  FAILED: "border-destructive/50 text-destructive",
  REFUNDED: "border-orange-500/50 text-orange-600",
  PARTIALLY_REFUNDED: "border-orange-500/50 text-orange-600",
};

const QUEUE_CARDS: { key: keyof OrderQueues; label: string; filter?: FulfilmentStatus }[] = [
  { key: "awaiting_confirmation", label: "To confirm", filter: "PENDING_CONFIRMATION" },
  { key: "confirmed", label: "Confirmed", filter: "CONFIRMED" },
  { key: "ready_to_pack", label: "To pack", filter: "READY_TO_PACK" },
  { key: "packed", label: "Packed", filter: "PACKED" },
  { key: "shipped", label: "Shipped", filter: "SHIPPED" },
  { key: "open_returns", label: "Open returns" },
];

const OrdersV2 = () => {
  const { can } = useCapabilities();

  const [rows, setRows] = useState<AdminOrderRow[]>([]);
  const [count, setCount] = useState(0);
  const [queues, setQueues] = useState<OrderQueues | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fulfilment, setFulfilment] = useState<string>("");
  const [payment, setPayment] = useState<string>("");
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAdminOrdersV2({
        search,
        fulfilment_status: fulfilment,
        payment_status: payment,
        page,
      });
      setRows(data.results);
      setCount(data.count);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not load orders"));
    } finally {
      setLoading(false);
    }
  }, [search, fulfilment, payment, page]);

  const loadQueues = useCallback(async () => {
    try {
      setQueues(await fetchOrderQueues());
    } catch {
      // The queue strip is a convenience; failing to load it must not block
      // the list underneath, which is what the job actually needs.
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadList, 250);
    return () => clearTimeout(timer);
  }, [loadList]);

  useEffect(() => {
    loadQueues();
  }, [loadQueues]);

  const openOrder = async (id: number) => {
    try {
      setDetailLoading(true);
      setDetail(await fetchAdminOrderDetail(id));
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not open that order"));
    } finally {
      setDetailLoading(false);
    }
  };

  const onOrderChanged = (updated: AdminOrderDetail) => {
    setDetail(updated);
    setRows((current) =>
      current.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)),
    );
    loadQueues();
  };

  if (detail) {
    return (
      <AdminLayout title={`Order ${orderReference(detail.id)}`}>
        <OrderDetailPanel
          order={detail}
          onBack={() => {
            setDetail(null);
            loadList();
          }}
          onChanged={onOrderChanged}
          can={can}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Orders">
      <div className="space-y-6">
        {queues && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {QUEUE_CARDS.map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => {
                  setFulfilment(card.filter ?? "");
                  setPage(1);
                }}
                className={`rounded-xl border p-3 text-left transition-colors hover:border-primary ${
                  fulfilment === card.filter && card.filter
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <p className="text-2xl font-semibold tabular-nums">
                  {queues[card.key] as number}
                </p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </button>
            ))}
          </div>
        )}

        {/* Cash owed, labelled as owed. This is the number the old dashboard
            was quietly counting as revenue. */}
        {queues && queues.cod_orders_outstanding > 0 && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">
                  {money(queues.cod_cash_outstanding)} cash on delivery outstanding
                </span>
                <span className="text-muted-foreground">
                  across {queues.cod_orders_outstanding} order
                  {queues.cod_orders_outstanding === 1 ? "" : "s"}
                </span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label="What this figure means">
                        <Info className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {queues.definitions.cod_cash_outstanding}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-card-gradient border-border">
          <CardHeader className="gap-4 pb-4">
            <CardTitle className="font-heading">
              Orders{" "}
              <span className="text-sm font-normal text-muted-foreground">({count})</span>
            </CardTitle>

            <div className="flex flex-col gap-3 lg:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  // Phone first: it is what the customer gives on the call.
                  placeholder="Search by phone, order number, name or SKU"
                  className="pl-9"
                  aria-label="Search orders"
                />
              </div>

              <Select
                value={fulfilment || "all"}
                onValueChange={(value) => {
                  setFulfilment(value === "all" ? "" : value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full lg:w-56">
                  <SelectValue placeholder="Any fulfilment state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any fulfilment state</SelectItem>
                  {Object.keys(FULFILMENT_TONE).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.replace(/_/g, " ").toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={payment || "all"}
                onValueChange={(value) => {
                  setPayment(value === "all" ? "" : value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full lg:w-52">
                  <SelectValue placeholder="Any payment state" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any payment state</SelectItem>
                  {Object.keys(PAYMENT_TONE).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status.replace(/_/g, " ").toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading orders…</p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No orders match that.</p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => openOrder(row.id)}
                      className="w-full p-4 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-medium">
                              {orderReference(row.id)}
                            </span>
                            <span className="truncate font-medium">{row.customer_name}</span>
                            <span className="text-sm text-muted-foreground">
                              {row.customer_phone}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {dateTime(row.created_at)} · {row.items_count} item
                            {row.items_count === 1 ? "" : "s"} · {row.payment_method}
                          </p>
                        </div>

                        {/* Payment and fulfilment side by side, always. One
                            badge cannot say "shipped but unpaid". */}
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={PAYMENT_TONE[row.payment_status]}>
                            {row.payment_label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={FULFILMENT_TONE[row.fulfilment_status]}
                          >
                            {row.fulfilment_label}
                          </Badge>
                        </div>

                        <div className="shrink-0 text-right">
                          <p className="font-semibold tabular-nums">{money(row.total_amount)}</p>
                          {Number(row.refunded_amount) > 0 && (
                            <p className="text-xs text-orange-600">
                              {money(row.refunded_amount)} refunded
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
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

        {detailLoading && (
          <p className="text-center text-sm text-muted-foreground">Opening order…</p>
        )}
      </div>
    </AdminLayout>
  );
};

// ---------------------------------------------------------------------------

interface DetailProps {
  order: AdminOrderDetail;
  onBack: () => void;
  onChanged: (order: AdminOrderDetail) => void;
  can: (capability: string) => boolean;
}

const OrderDetailPanel = ({ order, onBack, onChanged, can }: DetailProps) => {
  const [pending, setPending] = useState<TransitionOption | null>(null);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const print = () => {
    if (!printDispatchSlip(order)) {
      toast.error("Pop-up blocked. Allow pop-ups to print the dispatch slip.");
    }
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    try {
      setSavingNote(true);
      onChanged(await addOrderNote(order.id, note));
      setNote("");
      toast.success("Note added");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not add the note"));
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> All orders
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={print}>
            <Printer className="mr-1.5 h-4 w-4" /> Dispatch slip
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="bg-card-gradient border-border">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="font-heading">{orderReference(order.id)}</CardTitle>
                <Badge variant="outline" className={PAYMENT_TONE[order.payment_status]}>
                  {order.payment_label}
                </Badge>
                <Badge variant="outline" className={FULFILMENT_TONE[order.fulfilment_status]}>
                  {order.fulfilment_label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Customer
                  </p>
                  <p className="font-medium">{order.customer_name}</p>
                  <p className="text-muted-foreground">{order.customer_phone}</p>
                  <p className="text-muted-foreground">{order.customer_email}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Deliver to
                  </p>
                  <p className="whitespace-pre-line text-muted-foreground">
                    {order.shipping_address}
                  </p>
                </div>
              </div>

              {order.tracking_number && (
                <p className="text-muted-foreground">
                  {order.courier_name || "Courier"} · {order.tracking_number}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card-gradient border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-base">Items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <p className="font-medium">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.variant_description && `${item.variant_description} · `}
                        <code>{item.sku || "no SKU"}</code>
                        {item.brand_name && ` · ${item.brand_name}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-sm">
                      <p className="tabular-nums">
                        {item.quantity} × {money(item.price)}
                      </p>
                      <p className="font-semibold tabular-nums">{money(item.line_total)}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="space-y-1 border-t border-border p-4 text-sm">
                <Row label="Subtotal" value={money(order.subtotal_amount)} />
                {Number(order.discount_amount) > 0 && (
                  <Row
                    label={`Discount${order.applied_promo_code ? ` (${order.applied_promo_code})` : ""}`}
                    value={`− ${money(order.discount_amount)}`}
                  />
                )}
                <Row label="Shipping" value={money(order.shipping_fee)} />
                <Row label="Total" value={money(order.total_amount)} strong />
                {Number(order.refunded_amount) > 0 && (
                  <Row label="Refunded" value={money(order.refunded_amount)} />
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card-gradient border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-base">History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {can(CAP.ORDER_VIEW) && (
                <div className="space-y-2">
                  <Textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add an internal note — not shown to the customer"
                    rows={2}
                  />
                  <Button size="sm" onClick={saveNote} disabled={savingNote || !note.trim()}>
                    {savingNote ? "Saving…" : "Add note"}
                  </Button>
                </div>
              )}

              <ul className="space-y-3">
                {order.history.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-border pl-3 text-sm">
                    <p>
                      {entry.from_status && entry.to_status ? (
                        <>
                          <span className="text-muted-foreground">
                            {entry.from_status.replace(/_/g, " ").toLowerCase()}
                          </span>{" "}
                          →{" "}
                          <span className="font-medium">
                            {entry.to_status.replace(/_/g, " ").toLowerCase()}
                          </span>
                        </>
                      ) : (
                        <span className="font-medium">{entry.kind_label}</span>
                      )}
                    </p>
                    {entry.note && <p className="text-muted-foreground">{entry.note}</p>}
                    <p className="text-xs text-muted-foreground">
                      {dateTime(entry.created_at)} · {entry.actor_email}
                    </p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-card-gradient border-border">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-base">What happens next</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {order.available_transitions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This order is finished. Nothing further to do.
                </p>
              ) : (
                // Served by the API from the same table the transition endpoint
                // validates against, so no button here can be refused.
                order.available_transitions.map((option) => {
                  const isCancel = option.value === "CANCELLED";
                  if (isCancel && !can(CAP.ORDER_CANCEL)) return null;
                  if (!isCancel && !can(CAP.ORDER_TRANSITION)) return null;
                  return (
                    <Button
                      key={option.value}
                      variant={isCancel ? "outline" : "default"}
                      className={`w-full justify-start ${isCancel ? "text-destructive" : ""}`}
                      onClick={() => setPending(option)}
                    >
                      {isCancel && <Undo2 className="mr-2 h-4 w-4" />}
                      {option.label}
                    </Button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <TransitionDialog
        order={order}
        option={pending}
        onClose={() => setPending(null)}
        onDone={(updated) => {
          onChanged(updated);
          setPending(null);
        }}
      />
    </div>
  );
};

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex justify-between">
    <span className={strong ? "font-medium" : "text-muted-foreground"}>{label}</span>
    <span className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</span>
  </div>
);

const TransitionDialog = ({
  order,
  option,
  onClose,
  onDone,
}: {
  order: AdminOrderDetail;
  option: TransitionOption | null;
  onClose: () => void;
  onDone: (order: AdminOrderDetail) => void;
}) => {
  const [reason, setReason] = useState("");
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (option) {
      setReason("");
      setCourier(order.courier_name || "");
      setTracking(order.tracking_number || "");
    }
  }, [option, order.courier_name, order.tracking_number]);

  if (!option) return null;

  const isShipping = option.value === "SHIPPED";
  const isCancelling = option.value === "CANCELLED";
  const blocked = (isShipping && !tracking.trim()) || (isCancelling && !reason.trim());

  const submit = async () => {
    try {
      setSaving(true);
      const updated = await transitionOrder(order.id, {
        status: option.value,
        reason,
        courier_name: courier,
        tracking_number: tracking,
      });
      toast.success(`Order marked ${option.label.toLowerCase()}`);
      onDone(updated);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not update the order"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as {option.label.toLowerCase()}</DialogTitle>
          <DialogDescription>
            {orderReference(order.id)} · {order.customer_name}
            {isCancelling && order.inventory_committed && (
              <span className="mt-2 block text-foreground">
                The stock on this order will go back into inventory.
              </span>
            )}
            {option.value === "DELIVERED" && order.payment_method === "COD" && (
              <span className="mt-2 block text-foreground">
                This records {money(order.total_amount)} as collected in cash.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isShipping && (
            <>
              <div className="space-y-2">
                <Label htmlFor="courier">Courier</Label>
                <Input
                  id="courier"
                  value={courier}
                  onChange={(event) => setCourier(event.target.value)}
                  placeholder="e.g. TCS, Leopards"
                />
              </div>
              <div className="space-y-2">
                {/* Required by the API too. A shipped parcel nobody can trace
                    is a support call waiting to happen. */}
                <Label htmlFor="tracking">Tracking number (required)</Label>
                <Input
                  id="tracking"
                  value={tracking}
                  onChange={(event) => setTracking(event.target.value)}
                  autoFocus
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="transition-reason">
              {isCancelling ? "Reason (required)" : "Note (optional)"}
            </Label>
            <Textarea
              id="transition-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder={
                isCancelling ? "e.g. Customer changed their mind" : "Anything worth recording"
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving || blocked}
            variant={isCancelling ? "destructive" : "default"}
          >
            {saving ? "Saving…" : option.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OrdersV2;
