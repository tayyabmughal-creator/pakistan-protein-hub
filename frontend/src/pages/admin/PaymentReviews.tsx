import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, XCircle } from "lucide-react";
import { toast } from "sonner";

import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { fetchAdminPaymentReviews, resolveAdminPaymentReview } from "@/lib/api";
import { cn } from "@/lib/utils";

const PaymentReviews = () => {
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<"REVIEW" | "ALL">("REVIEW");
    const [selectedSession, setSelectedSession] = useState<any | null>(null);
    const [processingSessionId, setProcessingSessionId] = useState<string | null>(null);

    const loadSessions = async (nextFilter = statusFilter) => {
        try {
            setLoading(true);
            const data = await fetchAdminPaymentReviews(nextFilter);
            setSessions(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Failed to load payment review queue");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSessions(statusFilter);
    }, [statusFilter]);

    const handleResolve = async (session: any, action: "approve" | "fail") => {
        try {
            setProcessingSessionId(session.public_id);
            const updated = await resolveAdminPaymentReview(session.public_id, action);
            toast.success(action === "approve" ? "Payment approved and order created." : "Payment marked as failed.");

            setSessions((prev) => {
                if (statusFilter === "REVIEW") {
                    return prev.filter((item) => item.public_id !== session.public_id);
                }
                return prev.map((item) => (item.public_id === session.public_id ? updated : item));
            });
            setSelectedSession((prev) => (prev?.public_id === session.public_id ? updated : prev));
        } catch (error: any) {
            toast.error(error.response?.data?.error || "Could not update this payment review.");
        } finally {
            setProcessingSessionId(null);
        }
    };

    const formatMoney = (value: string | number | null | undefined) => {
        return new Intl.NumberFormat("en-PK", {
            style: "currency",
            currency: "PKR",
            minimumFractionDigits: 0,
        }).format(Number(value || 0));
    };

    const formatDate = (value?: string) => {
        if (!value) return "N/A";
        return new Date(value).toLocaleString();
    };

    const statusCounts = useMemo(() => {
        return {
            REVIEW: sessions.filter((item) => item.status === "REVIEW").length,
            ALL: sessions.length,
        };
    }, [sessions]);

    const selectedItems = selectedSession?.items_snapshot || [];

    return (
        <AdminLayout title="Payment Reviews">
            <div className="mb-6 rounded-xl border border-border bg-card-gradient p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="font-heading text-xl font-semibold">Manual Payment Review Queue</h2>
                        <p className="text-sm text-muted-foreground">
                            Approve Safepay callbacks that need manual confirmation, or mark them failed if the payment should not turn into an order.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { key: "REVIEW", label: "Needs Review" },
                            { key: "ALL", label: "All Sessions" },
                        ].map((filter) => (
                            <button
                                key={filter.key}
                                type="button"
                                onClick={() => setStatusFilter(filter.key as "REVIEW" | "ALL")}
                                className={cn(
                                    "rounded-full border px-4 py-2 text-sm transition-colors",
                                    statusFilter === filter.key
                                        ? "border-primary/30 bg-primary text-primary-foreground"
                                        : "border-border bg-background/60 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                                )}
                            >
                                {filter.label}
                                <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">
                                    {statusCounts[filter.key as "REVIEW" | "ALL"] || 0}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="rounded-xl border border-border bg-card-gradient px-4 py-10 text-center">
                    Loading payment sessions...
                </div>
            ) : sessions.length === 0 ? (
                <div className="rounded-xl border border-border bg-card-gradient px-4 py-10 text-center">
                    No payment sessions found for this filter.
                </div>
            ) : (
                <>
                    <div className="space-y-4 md:hidden">
                        {sessions.map((session) => {
                            const isProcessing = processingSessionId === session.public_id;
                            return (
                                <div key={session.public_id} className="rounded-2xl border border-border bg-card-gradient p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Session</p>
                                            <p className="mt-1 font-semibold break-all">{session.public_id}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">{session.customer_name}</p>
                                            <p className="text-sm text-muted-foreground break-all">{session.customer_email || "No email"}</p>
                                        </div>
                                        <Badge variant={session.status === "REVIEW" ? "destructive" : "secondary"}>
                                            {session.status}
                                        </Badge>
                                    </div>

                                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                        <div className="rounded-xl border border-border/60 px-3 py-3">
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                                            <p className="mt-1 font-semibold">{formatMoney(session.total_amount)}</p>
                                        </div>
                                        <div className="rounded-xl border border-border/60 px-3 py-3">
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Gateway Ref</p>
                                            <p className="mt-1 font-semibold break-all">{session.gateway_reference || "Pending"}</p>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex flex-col gap-2">
                                        <Button variant="outline" onClick={() => setSelectedSession(session)}>
                                            <Eye className="mr-2 h-4 w-4" />
                                            View Details
                                        </Button>
                                        <Button onClick={() => handleResolve(session, "approve")} disabled={isProcessing || session.status === "COMPLETED"}>
                                            <CheckCircle2 className="mr-2 h-4 w-4" />
                                            {isProcessing ? "Working..." : "Approve Payment"}
                                        </Button>
                                        <Button
                                            variant="destructive"
                                            onClick={() => handleResolve(session, "fail")}
                                            disabled={isProcessing || session.status === "COMPLETED"}
                                        >
                                            <XCircle className="mr-2 h-4 w-4" />
                                            Mark Failed
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="hidden overflow-hidden rounded-2xl border border-border bg-card-gradient md:block">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[980px] text-sm">
                                <thead className="bg-background/70 text-left">
                                    <tr>
                                        <th className="px-4 py-3 font-medium text-muted-foreground">Customer</th>
                                        <th className="px-4 py-3 font-medium text-muted-foreground">Amount</th>
                                        <th className="px-4 py-3 font-medium text-muted-foreground">Gateway</th>
                                        <th className="px-4 py-3 font-medium text-muted-foreground">Updated</th>
                                        <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                                        <th className="px-4 py-3 font-medium text-muted-foreground text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.map((session) => {
                                        const isProcessing = processingSessionId === session.public_id;
                                        return (
                                            <tr key={session.public_id} className="border-t border-border/60">
                                                <td className="px-4 py-4 align-top">
                                                    <p className="font-medium">{session.customer_name}</p>
                                                    <p className="text-muted-foreground">{session.customer_email || "No email"}</p>
                                                    <p className="mt-1 text-xs uppercase tracking-wider text-primary">{session.customer_type}</p>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <p className="font-medium">{formatMoney(session.total_amount)}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Subtotal {formatMoney(session.subtotal_amount)}
                                                    </p>
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <p className="font-medium break-all">{session.gateway_reference || "Pending"}</p>
                                                    <p className="text-xs text-muted-foreground break-all">{session.gateway_tracker || "No tracker"}</p>
                                                </td>
                                                <td className="px-4 py-4 align-top text-muted-foreground">
                                                    {formatDate(session.updated_at)}
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <Badge variant={session.status === "REVIEW" ? "destructive" : "secondary"}>
                                                        {session.status}
                                                    </Badge>
                                                    {session.order?.id && (
                                                        <p className="mt-2 text-xs text-muted-foreground">Order #{session.order.id}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="flex justify-end gap-2">
                                                        <Button variant="outline" size="sm" onClick={() => setSelectedSession(session)}>
                                                            <Eye className="mr-2 h-4 w-4" />
                                                            Details
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleResolve(session, "approve")}
                                                            disabled={isProcessing || session.status === "COMPLETED"}
                                                        >
                                                            {isProcessing ? "Working..." : "Approve"}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            onClick={() => handleResolve(session, "fail")}
                                                            disabled={isProcessing || session.status === "COMPLETED"}
                                                        >
                                                            Fail
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            <Dialog open={Boolean(selectedSession)} onOpenChange={(open) => !open && setSelectedSession(null)}>
                <DialogContent className="max-w-3xl">
                    {selectedSession && (
                        <>
                            <DialogHeader>
                                <DialogTitle>Payment Session Review</DialogTitle>
                                <DialogDescription>
                                    Inspect the payment callback data before deciding whether this should become an order.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Customer</p>
                                    <p className="mt-2 font-semibold">{selectedSession.customer_name}</p>
                                    <p className="text-sm text-muted-foreground">{selectedSession.customer_email || "No email"}</p>
                                    <p className="text-sm text-muted-foreground">{selectedSession.customer_phone_number || "No phone"}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Payment Snapshot</p>
                                    <p className="mt-2 font-semibold">{formatMoney(selectedSession.total_amount)}</p>
                                    <p className="text-sm text-muted-foreground">Method: {selectedSession.payment_method}</p>
                                    <p className="text-sm text-muted-foreground break-all">
                                        Gateway Ref: {selectedSession.gateway_reference || "Pending"}
                                    </p>
                                    <p className="text-sm text-muted-foreground break-all">
                                        Tracker: {selectedSession.gateway_tracker || "Pending"}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Delivery Address</p>
                                <p className="mt-2 whitespace-pre-wrap text-sm">{selectedSession.shipping_address}</p>
                            </div>

                            <div className="rounded-xl border border-border/60 bg-background/60 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Items</p>
                                    <p className="text-xs text-muted-foreground">{selectedItems.length} line item(s)</p>
                                </div>
                                <div className="mt-3 space-y-3">
                                    {selectedItems.map((item: any, index: number) => (
                                        <div key={`${item.product_id}-${index}`} className="rounded-lg border border-border/60 px-3 py-3 text-sm">
                                            <p className="font-medium">{item.product_name}</p>
                                            <p className="text-muted-foreground">
                                                Qty {item.quantity} x {formatMoney(item.price)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                                <div className="flex gap-3">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <p>
                                        Approve only when the payment gateway details look valid and you are comfortable creating the order. If stock was the blocker before,
                                        fix stock first and then approve this session.
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
};

export default PaymentReviews;
