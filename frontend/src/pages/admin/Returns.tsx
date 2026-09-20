import { useCallback, useEffect, useState } from "react";
import { Check, PackageCheck, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { decideReturn, fetchReturns, receiveReturn, refundReturn } from "@/lib/adminApi";
import { orderReference } from "@/lib/dispatchSlip";
import { getErrorMessage } from "@/lib/errors";
import { CAP, type AdminReturn } from "@/lib/types";

const money = (value: string | number) =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 0,
  }).format(Number(value || 0));

const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" }) : "—";

const STATUS_TONE: Record<string, string> = {
  REQUESTED: "border-amber-500/50 text-amber-600",
  APPROVED: "border-blue-500/50 text-blue-600",
  RECEIVED: "border-indigo-500/50 text-indigo-600",
  COMPLETED: "border-emerald-500/50 text-emerald-600",
  REJECTED: "border-muted text-muted-foreground",
  CANCELLED: "border-muted text-muted-foreground",
};

type OpenAction = "decide" | "receive" | "refund" | null;

const Returns = () => {
  const { can } = useCapabilities();

  const [rows, setRows] = useState<AdminReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("open");
  const [selected, setSelected] = useState<AdminReturn | null>(null);
  const [action, setAction] = useState<OpenAction>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchReturns({ status: statusFilter });
      setRows(data.results);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not load returns"));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const onUpdated = (updated: AdminReturn) => {
    setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    setSelected(null);
    setAction(null);
    // A resolved return leaves the open list, so refresh rather than leaving a
    // stale row that no longer belongs here.
    if (statusFilter === "open") load();
  };

  return (
    <AdminLayout title="Returns">
      <div className="space-y-6">
        <Card className="bg-card-gradient border-border">
          <CardHeader className="gap-4 pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="font-heading">
                Returns{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({rows.length})
                </span>
              </CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="REQUESTED">Awaiting decision</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="RECEIVED">Goods received</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading returns…</p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Nothing here. That is usually good news.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => (
                  <li key={row.id} className="p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-medium">{row.reference}</span>
                          <Badge variant="outline" className={STATUS_TONE[row.status]}>
                            {row.status_label}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {orderReference(row.order)} · {row.customer_name}
                          </span>
                        </div>

                        <p className="mt-1 text-sm">
                          <span className="text-muted-foreground">Reason:</span>{" "}
                          {row.reason_label}
                        </p>
                        {row.customer_note && (
                          <p className="text-sm text-muted-foreground">"{row.customer_note}"</p>
                        )}

                        <ul className="mt-2 space-y-1">
                          {row.items.map((item) => (
                            <li key={item.id} className="text-sm">
                              {item.quantity} × {item.product_name}{" "}
                              <code className="text-xs text-muted-foreground">{item.sku}</code>
                              {/* Null is "not yet inspected", which is a
                                  different answer from "decided not to". */}
                              {item.restock === true && (
                                <span className="ml-2 text-xs text-emerald-600">
                                  back on the shelf
                                </span>
                              )}
                              {item.restock === false && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  not resellable
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>

                        <p className="mt-2 text-xs text-muted-foreground">
                          Requested {dateTime(row.requested_at)}
                          {row.refunded_at &&
                            ` · ${money(row.refund_amount)} refunded ${dateTime(row.refunded_at)}`}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {can(CAP.RETURN_MANAGE) && row.status === "REQUESTED" && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelected(row);
                              setAction("decide");
                            }}
                          >
                            Decide
                          </Button>
                        )}
                        {can(CAP.RETURN_MANAGE) && row.status === "APPROVED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelected(row);
                              setAction("receive");
                            }}
                          >
                            <PackageCheck className="mr-1.5 h-4 w-4" /> Receive goods
                          </Button>
                        )}
                        {/* Refunding is independent of the goods arriving.
                            Different capability, and available either way. */}
                        {can(CAP.ORDER_REFUND) && row.is_open && !row.refunded_at && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelected(row);
                              setAction("refund");
                            }}
                          >
                            <RotateCcw className="mr-1.5 h-4 w-4" /> Refund
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <DecideDialog
        open={action === "decide"}
        request={selected}
        onClose={() => setAction(null)}
        onDone={onUpdated}
      />
      <ReceiveDialog
        open={action === "receive"}
        request={selected}
        onClose={() => setAction(null)}
        onDone={onUpdated}
      />
      <RefundDialog
        open={action === "refund"}
        request={selected}
        onClose={() => setAction(null)}
        onDone={onUpdated}
      />
    </AdminLayout>
  );
};

interface ActionProps {
  open: boolean;
  request: AdminReturn | null;
  onClose: () => void;
  onDone: (updated: AdminReturn) => void;
}

const DecideDialog = ({ open, request, onClose, onDone }: ActionProps) => {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!open || !request) return null;

  const submit = async (decision: "approve" | "reject") => {
    try {
      setSaving(true);
      onDone(await decideReturn(request.id, { action: decision, reason }));
      toast.success(`Return ${decision === "approve" ? "approved" : "rejected"}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not record that decision"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decide on {request.reference}</DialogTitle>
          <DialogDescription>
            {request.customer_name} · {request.reason_label}
            {request.customer_note && <span className="mt-2 block">"{request.customer_note}"</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="decision-reason">Note (required to reject)</Label>
          <Textarea
            id="decision-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="e.g. Outside the returns window"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => submit("reject")}
            disabled={saving || !reason.trim()}
          >
            <X className="mr-1.5 h-4 w-4" /> Reject
          </Button>
          <Button onClick={() => submit("approve")} disabled={saving}>
            <Check className="mr-1.5 h-4 w-4" /> Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ReceiveDialog = ({ open, request, onClose, onDone }: ActionProps) => {
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && request) {
      // Default to not restocking. Putting something back on the shelf should
      // be a decision someone made, not what happens if they click through.
      setRestock(Object.fromEntries(request.items.map((item) => [String(item.id), false])));
    }
  }, [open, request]);

  if (!open || !request) return null;

  const submit = async () => {
    try {
      setSaving(true);
      onDone(await receiveReturn(request.id, restock));
      toast.success("Goods received");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not record the goods"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive goods for {request.reference}</DialogTitle>
          <DialogDescription>
            Tick what came back in sellable condition. Only ticked items go back
            into stock.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {request.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 rounded-xl border border-border/60 p-3">
              <Checkbox
                id={`restock-${item.id}`}
                checked={restock[String(item.id)] ?? false}
                onCheckedChange={(checked) =>
                  setRestock((current) => ({ ...current, [String(item.id)]: Boolean(checked) }))
                }
              />
              <Label htmlFor={`restock-${item.id}`} className="flex-1 cursor-pointer font-normal">
                <span className="font-medium">
                  {item.quantity} × {item.product_name}
                </span>
                <span className="block text-xs text-muted-foreground">{item.sku}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {restock[String(item.id)]
                    ? "Goes back into sellable stock"
                    : "Written off — does not return to stock"}
                </span>
              </Label>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Record goods received"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RefundDialog = ({ open, request, onClose, onDone }: ActionProps) => {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setNote("");
    }
  }, [open]);

  if (!open || !request) return null;

  const submit = async () => {
    try {
      setSaving(true);
      onDone(await refundReturn(request.id, { amount, note }));
      toast.success(`Refunded ${money(amount)}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Could not record the refund"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund {request.reference}</DialogTitle>
          <DialogDescription>
            {request.customer_name} · {orderReference(request.order)}
            <span className="mt-2 block">
              This records money returned to the customer. It does not move any
              stock — receiving goods back is recorded separately.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="refund-amount">Amount (PKR)</Label>
            <Input
              id="refund-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-note">Note</Label>
            <Input
              id="refund-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Refunded to Easypaisa"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || Number(amount) <= 0}>
            {saving ? "Recording…" : `Refund ${amount ? money(amount) : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Returns;
