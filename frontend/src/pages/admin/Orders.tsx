import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useMemo, useState } from "react";
import { fetchAdminOrders, updateOrderStatus } from "@/lib/api";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ORDER_FLOW, ORDER_STATUS_META, getAllowedNextStatuses, getOrderProgressIndex, getOrderStatusMeta, isStatusRollback, requiresStatusConfirmation } from "@/lib/orderStatus";
import { cn } from "@/lib/utils";

const AdminOrders = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [pendingStatusChange, setPendingStatusChange] = useState<{ id: number; customerName: string; currentStatus: string; nextStatus: string } | null>(null);

    const loadOrders = async () => {
        try {
            const data = await fetchAdminOrders();
            setOrders(data);
        } catch (error) {
            toast.error("Failed to load orders");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOrders();
    }, []);

    const handleStatusChange = async (id: number, status: string) => {
        try {
            const updatedOrder = await updateOrderStatus(id, status);
            setOrders((prev) => prev.map((order) => (order.id === id ? { ...order, ...updatedOrder } : order)));
            setSelectedOrder((prev) => (prev?.id === id ? { ...prev, ...updatedOrder } : prev));
            toast.success("Order status updated");
        } catch (error) {
            toast.error("Failed to update status");
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
        const counts: Record<string, number> = { ALL: orders.length };
        Object.keys(ORDER_STATUS_META).forEach((status) => {
            counts[status] = orders.filter((order) => order.status === status).length;
        });
        return counts;
    }, [orders]);

    const filteredOrders = useMemo(() => {
        if (statusFilter === "ALL") return orders;
        return orders.filter((order) => order.status === statusFilter);
    }, [orders, statusFilter]);

    const selectedOrderItemTotal = useMemo(() => {
        if (!selectedOrder?.items?.length) return 0;
        return selectedOrder.items.reduce((total: number, item: any) => total + Number(item.price) * Number(item.quantity), 0);
    }, [selectedOrder]);

    const selectedOrderProgress = useMemo(() => {
        if (!selectedOrder) return -1;
        return getOrderProgressIndex(selectedOrder.status);
    }, [selectedOrder]);

    const escapeHtml = (value: string | number | null | undefined) => {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

    const buildReferenceBarcodeSvg = (value: string) => {
        const height = 68;
        const gap = 1;
        let x = 12;

        const bars = Array.from(value).flatMap((char, charIndex) => {
            const binary = char.charCodeAt(0).toString(2).padStart(8, "0");
            return binary.split("").flatMap((bit, bitIndex) => {
                const width = bit === "1" ? 3 : 1.5;
                const rect = `<rect x="${x}" y="8" width="${width}" height="${height}" fill="#111827" />`;
                x += width + gap;
                if (bitIndex === 7 && charIndex < value.length - 1) {
                    x += 2;
                }
                return rect;
            });
        }).join("");

        const totalWidth = x + 12;
        return `
            <svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="102" viewBox="0 0 ${totalWidth} 102" role="img" aria-label="Order barcode">
                <rect width="${totalWidth}" height="102" fill="#ffffff" />
                ${bars}
                <text x="${totalWidth / 2}" y="95" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" letter-spacing="2" fill="#111827">${escapeHtml(value)}</text>
            </svg>
        `;
    };

    const handlePrintOrder = (order: any) => {
        const printWindow = window.open("", "_blank", "width=900,height=700");
        if (!printWindow) {
            toast.error("Pop-up blocked. Allow pop-ups to print the order slip.");
            return;
        }

        const orderItemTotal = order.items?.length
            ? order.items.reduce((total: number, item: any) => total + Number(item.price) * Number(item.quantity), 0)
            : 0;
        const printedAt = formatDate(new Date().toISOString());
        const codAmount = order.payment_method === "COD" ? formatMoney(order.total_amount) : "N/A";
        const orderReference = `PKN-${String(order.id).padStart(6, "0")}`;
        const barcodeSvg = buildReferenceBarcodeSvg(orderReference);

        const itemRows = order.items?.length
            ? order.items.map((item: any) => `
                <tr>
                    <td>#${escapeHtml(item.id)}</td>
                    <td>${escapeHtml(item.product || "Deleted")}</td>
                    <td>${escapeHtml(item.product_name)}</td>
                    <td>${escapeHtml(item.quantity)}</td>
                    <td>${escapeHtml(formatMoney(item.price))}</td>
                    <td>${escapeHtml(formatMoney(Number(item.price) * Number(item.quantity)))}</td>
                </tr>
            `).join("")
            : `<tr><td colspan="6">No ordered products found.</td></tr>`;

        const printMarkup = `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8" />
                    <title>PakNutrition Order #${escapeHtml(order.id)}</title>
                    <style>
                        * { box-sizing: border-box; }
                        body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
                        h1, h2, h3, p { margin: 0; }
                        .sheet { border: 2px solid #111827; padding: 24px; }
                        .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 24px; padding-bottom: 18px; border-bottom: 2px solid #111827; }
                        .brand-wrap { max-width: 50%; }
                        .brand { font-size: 28px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
                        .tag { display: inline-block; margin-top: 8px; padding: 6px 10px; border: 1px solid #111827; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
                        .meta { text-align: right; }
                        .meta h2 { font-size: 24px; margin-bottom: 8px; }
                        .muted { color: #6b7280; font-size: 12px; line-height: 1.5; }
                        .summary { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 16px; margin-bottom: 20px; }
                        .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; min-height: 150px; }
                        .card h3 { font-size: 14px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
                        .card p { margin: 6px 0; font-size: 14px; line-height: 1.5; }
                        .address-card { background: #f8fafc; border: 2px dashed #111827; }
                        .address-line { white-space: pre-wrap; font-size: 15px; line-height: 1.7; }
                        .pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
                        .pill { border: 1px solid #111827; border-radius: 999px; padding: 6px 10px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
                        .section-title { margin: 18px 0 10px; font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; }
                        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
                        th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 13px; vertical-align: top; }
                        th { background: #f3f4f6; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
                        .totals { margin-top: 18px; width: 340px; margin-left: auto; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px 16px; }
                        .totals p { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
                        .totals p strong { font-size: 16px; }
                        .barcode-panel { display: grid; grid-template-columns: 1.2fr 1fr; gap: 18px; margin-top: 20px; align-items: stretch; }
                        .barcode-card, .courier-card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; }
                        .barcode-card h3, .courier-card h3 { font-size: 14px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
                        .barcode-wrap { border: 1px dashed #94a3b8; border-radius: 10px; padding: 10px; background: #ffffff; display: flex; justify-content: center; align-items: center; min-height: 120px; }
                        .reference-line { margin-top: 10px; font-size: 12px; color: #6b7280; }
                        .courier-card p { margin: 10px 0; font-size: 13px; }
                        .placeholder-line { border-bottom: 1px dashed #6b7280; display: inline-block; min-width: 150px; height: 18px; vertical-align: bottom; margin-left: 8px; }
                        .footer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 22px; }
                        .checklist, .signature { border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px 16px; min-height: 140px; }
                        .checklist h3, .signature h3 { font-size: 14px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
                        .check-item { margin: 10px 0; font-size: 13px; }
                        .box { display: inline-block; width: 14px; height: 14px; border: 1px solid #111827; margin-right: 8px; vertical-align: middle; }
                        .signature-line { border-top: 1px solid #111827; margin-top: 56px; padding-top: 8px; font-size: 12px; color: #6b7280; }
                        @page { margin: 14mm; }
                        @media print {
                            body { margin: 0; }
                            .sheet { border: none; padding: 0; }
                        }
                    </style>
                </head>
                <body>
                    <div class="sheet">
                        <div class="header">
                            <div class="brand-wrap">
                                <div class="brand">PakNutrition</div>
                                <div class="tag">Parcel Dispatch Slip</div>
                                <div class="muted" style="margin-top: 12px;">
                                    Merchant copy for packing and courier handoff.<br />
                                    Keep this sheet with the parcel until dispatch is complete.
                                </div>
                            </div>
                            <div class="meta">
                                <h2>Order #${escapeHtml(order.id)}</h2>
                                <div class="muted">Order Date: ${escapeHtml(formatDate(order.created_at))}</div>
                                <div class="muted">Printed At: ${escapeHtml(printedAt)}</div>
                            </div>
                        </div>

                        <div class="summary">
                            <div class="card address-card">
                                <h3>Recipient & Delivery Address</h3>
                                <p><strong>Name:</strong> ${escapeHtml(order.customer_name)}</p>
                                <p><strong>Phone:</strong> ${escapeHtml(order.customer_phone_number || "N/A")}</p>
                                <p><strong>Email:</strong> ${escapeHtml(order.customer_email || "N/A")}</p>
                                <p class="address-line"><strong>Address:</strong>\n${escapeHtml(order.shipping_address || "No address recorded.")}</p>
                            </div>
                            <div class="card">
                                <h3>Order Meta</h3>
                                <p><strong>Status:</strong> ${escapeHtml(order.status)}</p>
                                <p><strong>Customer Type:</strong> ${escapeHtml(order.customer_type)}</p>
                                <p><strong>Items Count:</strong> ${escapeHtml(order.items_count || order.items?.length || 0)}</p>
                                <p><strong>Promo Code:</strong> ${escapeHtml(order.applied_promo_code || "None")}</p>
                                <div class="pill-row">
                                    <span class="pill">${escapeHtml(order.payment_method)}</span>
                                    <span class="pill">${escapeHtml(order.payment_status)}</span>
                                </div>
                            </div>
                            <div class="card">
                                <h3>Parcel Collection</h3>
                                <p><strong>Collect on Delivery:</strong> ${escapeHtml(codAmount)}</p>
                                <p><strong>Stored Subtotal:</strong> ${escapeHtml(formatMoney(order.subtotal_amount))}</p>
                                <p><strong>Discount:</strong> ${escapeHtml(formatMoney(order.discount_amount))}</p>
                                <p><strong>Grand Total:</strong> ${escapeHtml(formatMoney(order.total_amount))}</p>
                                <div class="pill-row">
                                    <span class="pill">Order #${escapeHtml(order.id)}</span>
                                    <span class="pill">PakNutrition</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div class="section-title">Ordered Products</div>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Line</th>
                                        <th>Product ID</th>
                                        <th>Product</th>
                                        <th>Qty</th>
                                        <th>Unit Price</th>
                                        <th>Line Total</th>
                                    </tr>
                                </thead>
                                <tbody>${itemRows}</tbody>
                            </table>
                        </div>

                        <div class="totals">
                            <p><span>Items Subtotal</span><span>${escapeHtml(formatMoney(orderItemTotal))}</span></p>
                            <p><span>Stored Subtotal</span><span>${escapeHtml(formatMoney(order.subtotal_amount))}</span></p>
                            <p><span>Discount</span><span>${escapeHtml(formatMoney(order.discount_amount))}</span></p>
                            <p><strong>Total</strong><strong>${escapeHtml(formatMoney(order.total_amount))}</strong></p>
                        </div>

                        <div class="barcode-panel">
                            <div class="barcode-card">
                                <h3>Order Reference Barcode</h3>
                                <div class="barcode-wrap">
                                    ${barcodeSvg}
                                </div>
                                <div class="reference-line">Reference Code: ${escapeHtml(orderReference)}</div>
                            </div>
                            <div class="courier-card">
                                <h3>Courier Handoff</h3>
                                <p><strong>Courier Service:</strong><span class="placeholder-line"></span></p>
                                <p><strong>Tracking Number:</strong><span class="placeholder-line"></span></p>
                                <p><strong>Parcel Weight:</strong><span class="placeholder-line"></span></p>
                                <p><strong>Package Count:</strong><span class="placeholder-line"></span></p>
                                <p><strong>Dispatch Notes:</strong><span class="placeholder-line" style="min-width: 180px;"></span></p>
                            </div>
                        </div>

                        <div class="footer-grid">
                            <div class="checklist">
                                <h3>Packing Checklist</h3>
                                <div class="check-item"><span class="box"></span> Products matched with this order sheet</div>
                                <div class="check-item"><span class="box"></span> Quantity verified</div>
                                <div class="check-item"><span class="box"></span> Parcel packed and sealed</div>
                                <div class="check-item"><span class="box"></span> Shipping label attached</div>
                                <div class="check-item"><span class="box"></span> COD amount confirmed</div>
                            </div>
                            <div class="signature">
                                <h3>Dispatch Sign-off</h3>
                                <p class="muted">Use this section for warehouse or courier handoff confirmation.</p>
                                <div class="signature-line">Packed By / Signature</div>
                                <div class="signature-line">Dispatch Time / Courier Handover</div>
                            </div>
                        </div>
                    </div>
                </body>
            </html>
        `;

        printWindow.document.open();
        printWindow.document.write(printMarkup);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    };

    const handleStatusSelect = (order: any, status: string) => {
        if (status === order.status) return;
        if (requiresStatusConfirmation(order.status, status)) {
            setPendingStatusChange({
                id: order.id,
                customerName: order.customer_name || `Order #${order.id}`,
                currentStatus: order.status,
                nextStatus: status,
            });
            return;
        }
        handleStatusChange(order.id, status);
    };

    return (
        <AdminLayout title="Orders">
            <div className="mb-6 rounded-xl border border-border bg-card-gradient p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="font-heading text-xl font-semibold">Order Workflow</h2>
                        <p className="text-sm text-muted-foreground">Filter the queue and move orders through the correct fulfillment stages.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {["ALL", ...Object.keys(ORDER_STATUS_META)].map((status) => {
                            const meta = status === "ALL" ? null : getOrderStatusMeta(status);
                            return (
                                <button
                                    key={status}
                                    type="button"
                                    onClick={() => setStatusFilter(status)}
                                    className={cn(
                                        "rounded-full border px-4 py-2 text-sm transition-colors",
                                        statusFilter === status
                                            ? "border-primary/30 bg-primary text-primary-foreground"
                                            : "border-border bg-background/60 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                                    )}
                                >
                                    {status === "ALL" ? "All Orders" : meta?.shortLabel}
                                    <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">
                                        {statusCounts[status] || 0}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="rounded-xl border border-border bg-card-gradient px-4 py-10 text-center md:hidden">
                    Loading orders...
                </div>
            ) : filteredOrders.length === 0 ? (
                <div className="rounded-xl border border-border bg-card-gradient px-4 py-10 text-center md:hidden">
                    No orders found.
                </div>
            ) : (
                <div className="space-y-4 md:hidden">
                    {filteredOrders.map((order) => (
                        <div key={order.id} className="rounded-2xl border border-border bg-card-gradient p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Order #{order.id}</p>
                                    <p className="mt-1 font-semibold">{order.customer_name || `User #${order.user}`}</p>
                                    <p className="text-sm text-muted-foreground break-all">{order.customer_email || "No email"}</p>
                                    <p className="mt-1 text-[11px] uppercase tracking-wider text-primary">{order.customer_type}</p>
                                </div>
                                <Badge className={getOrderStatusMeta(order.status).badgeClass}>
                                    {getOrderStatusMeta(order.status).shortLabel}
                                </Badge>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-xl border border-border/60 px-3 py-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Items</p>
                                    <p className="mt-1 font-semibold">{order.items_count || 0} item(s)</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {order.items?.[0]?.product_name || "No line items"}
                                        {order.items?.length > 1 ? ` +${order.items.length - 1} more` : ""}
                                    </p>
                                </div>
                                <div className="rounded-xl border border-border/60 px-3 py-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                                    <p className="mt-1 font-semibold">{formatMoney(order.total_amount)}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 px-3 py-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Created</p>
                                    <p className="mt-1 font-semibold">{new Date(order.created_at).toLocaleDateString()}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 px-3 py-3">
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Updated</p>
                                    <p className="mt-1 font-semibold">{new Date(order.updated_at || order.created_at).toLocaleDateString()}</p>
                                </div>
                            </div>

                            <div className="mt-4 space-y-3">
                                <Select value={order.status} onValueChange={(val) => handleStatusSelect(order, val)}>
                                    <SelectTrigger className="h-10 w-full text-sm">
                                        <SelectValue placeholder="Move status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {getAllowedNextStatuses(order.status).map((status) => (
                                            <SelectItem key={status} value={status}>
                                                {getOrderStatusMeta(status).shortLabel}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" className="w-full rounded-xl" onClick={() => setSelectedOrder(order)}>
                                    View Details
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="hidden overflow-hidden rounded-xl border border-border bg-card-gradient md:block">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent border-border">
                            <TableHead>Order ID</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Items</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-10">Loading orders...</TableCell></TableRow>
                        ) : filteredOrders.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-10">No orders found.</TableCell></TableRow>
                        ) : (
                            filteredOrders.map((order) => (
                                <TableRow key={order.id} className="border-border hover:bg-secondary/30">
                                    <TableCell className="font-bold">#{order.id}</TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            <p className="font-medium">{order.customer_name || `User #${order.user}`}</p>
                                            <p className="text-xs text-muted-foreground">{order.customer_email || "No email"}</p>
                                            <p className="text-[11px] uppercase tracking-wider text-primary">{order.customer_type}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="space-y-1">
                                            <p className="font-medium">{order.items_count || 0} item(s)</p>
                                            <p className="text-xs text-muted-foreground">
                                                {order.items?.[0]?.product_name || "No line items"}
                                                {order.items?.length > 1 ? ` +${order.items.length - 1} more` : ""}
                                            </p>
                                        </div>
                                    </TableCell>
                                    <TableCell>{formatMoney(order.total_amount)}</TableCell>
                                    <TableCell>
                                        <div className="space-y-2">
                                            <Badge className={getOrderStatusMeta(order.status).badgeClass}>
                                                {getOrderStatusMeta(order.status).shortLabel}
                                            </Badge>
                                            <Select
                                                value={order.status}
                                                onValueChange={(val) => handleStatusSelect(order, val)}
                                            >
                                                <SelectTrigger className="w-40 h-8 text-xs">
                                                    <SelectValue placeholder="Move status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {getAllowedNextStatuses(order.status).map((status) => (
                                                        <SelectItem key={status} value={status}>
                                                            {getOrderStatusMeta(status).shortLabel}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        <p>{new Date(order.created_at).toLocaleDateString()}</p>
                                        <p>Updated {new Date(order.updated_at || order.created_at).toLocaleDateString()}</p>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}>
                                            View Details
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
                <DialogContent className="w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto border-border bg-card sm:max-w-5xl">
                    {selectedOrder && (
                        <>
                            <DialogHeader>
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <DialogTitle>Order #{selectedOrder.id}</DialogTitle>
                                        <DialogDescription>
                                            Full order breakdown for {selectedOrder.customer_name} ({selectedOrder.customer_type})
                                        </DialogDescription>
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <Badge className={getOrderStatusMeta(selectedOrder.status).badgeClass}>
                                                {getOrderStatusMeta(selectedOrder.status).shortLabel}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                Updated {formatDate(selectedOrder.updated_at || selectedOrder.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                    <Button type="button" variant="outline" className="gap-2 self-start sm:self-auto" onClick={() => handlePrintOrder(selectedOrder)}>
                                        <Printer className="h-4 w-4" />
                                        Print Slip
                                    </Button>
                                </div>
                            </DialogHeader>

                            {selectedOrder.status !== "CANCELLED" ? (
                                <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-4">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <h3 className="font-semibold">Fulfillment Progress</h3>
                                        <span className="text-xs uppercase tracking-wider text-muted-foreground">
                                            Step {selectedOrderProgress + 1} of {ORDER_FLOW.length}
                                        </span>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${getOrderStatusMeta(selectedOrder.status).progressClass}`}
                                            style={{ width: `${((selectedOrderProgress + 1) / ORDER_FLOW.length) * 100}%` }}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                        {ORDER_FLOW.map((status, index) => (
                                            <div key={status} className="rounded-lg border border-border/50 px-3 py-2">
                                                <p className={cn("text-sm", index <= selectedOrderProgress ? "font-semibold text-foreground" : "text-muted-foreground")}>
                                                    {getOrderStatusMeta(status).shortLabel}
                                                </p>
                                                <p className="mt-1 text-[11px] text-muted-foreground">{getOrderStatusMeta(status).helper}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                                    <h3 className="font-semibold text-destructive">Order Cancelled</h3>
                                    <p className="mt-2 text-sm text-muted-foreground">{getOrderStatusMeta("CANCELLED").helper}</p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3">
                                    <h3 className="font-semibold">Customer</h3>
                                    <div className="space-y-1 text-sm">
                                        <p><span className="text-muted-foreground">Name:</span> {selectedOrder.customer_name}</p>
                                        <p><span className="text-muted-foreground">Email:</span> {selectedOrder.customer_email || "N/A"}</p>
                                        <p><span className="text-muted-foreground">Phone:</span> {selectedOrder.customer_phone_number || "N/A"}</p>
                                        <p><span className="text-muted-foreground">Type:</span> {selectedOrder.customer_type}</p>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3">
                                    <h3 className="font-semibold">Order Meta</h3>
                                    <div className="space-y-1 text-sm">
                                        <p><span className="text-muted-foreground">Status:</span> {getOrderStatusMeta(selectedOrder.status).shortLabel}</p>
                                        <p><span className="text-muted-foreground">Payment:</span> {selectedOrder.payment_method}</p>
                                        <p><span className="text-muted-foreground">Provider:</span> {selectedOrder.payment_provider || "N/A"}</p>
                                        <p><span className="text-muted-foreground">Payment Status:</span> {selectedOrder.payment_status}</p>
                                        <p><span className="text-muted-foreground">Reference:</span> {selectedOrder.payment_reference || "N/A"}</p>
                                        <p><span className="text-muted-foreground">Tracker:</span> {selectedOrder.payment_tracker || "N/A"}</p>
                                        <p><span className="text-muted-foreground">Payment Note:</span> {selectedOrder.payment_note || "N/A"}</p>
                                        <p><span className="text-muted-foreground">Created:</span> {formatDate(selectedOrder.created_at)}</p>
                                        <p><span className="text-muted-foreground">Last Updated:</span> {formatDate(selectedOrder.updated_at || selectedOrder.created_at)}</p>
                                        <p><span className="text-muted-foreground">Promo Code:</span> {selectedOrder.applied_promo_code || "None"}</p>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-border/60 bg-background/40 p-4 space-y-3">
                                    <h3 className="font-semibold">Amounts</h3>
                                    <div className="space-y-1 text-sm">
                                        <p><span className="text-muted-foreground">Items Subtotal:</span> {formatMoney(selectedOrderItemTotal)}</p>
                                        <p><span className="text-muted-foreground">Stored Subtotal:</span> {formatMoney(selectedOrder.subtotal_amount)}</p>
                                        <p><span className="text-muted-foreground">Discount:</span> {formatMoney(selectedOrder.discount_amount)}</p>
                                        <p className="font-semibold"><span className="text-muted-foreground font-normal">Total:</span> {formatMoney(selectedOrder.total_amount)}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                                <h3 className="font-semibold mb-3">Shipping Address</h3>
                                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{selectedOrder.shipping_address || "No address recorded."}</p>
                            </div>

                            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                                <h3 className="font-semibold mb-4">Ordered Products</h3>
                                {selectedOrder.items?.length ? (
                                    <>
                                        <div className="space-y-3 md:hidden">
                                            {selectedOrder.items.map((item: any) => (
                                                <div key={item.id} className="rounded-xl border border-border/50 p-3">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-medium">{item.product_name}</p>
                                                            <p className="mt-1 text-xs text-muted-foreground">Line #{item.id} · Product ID {item.product || "Deleted"}</p>
                                                            {item.product_image && (
                                                                <p className="mt-1 truncate text-xs text-muted-foreground">{item.product_image}</p>
                                                            )}
                                                        </div>
                                                        <p className="shrink-0 font-semibold">{item.quantity}x</p>
                                                    </div>
                                                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                                        <div className="rounded-lg border border-border/40 px-3 py-2">
                                                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Unit Price</p>
                                                            <p className="mt-1 font-semibold">{formatMoney(item.price)}</p>
                                                        </div>
                                                        <div className="rounded-lg border border-border/40 px-3 py-2">
                                                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Line Total</p>
                                                            <p className="mt-1 font-semibold">{formatMoney(Number(item.price) * Number(item.quantity))}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="hidden md:block">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="border-border hover:bg-transparent">
                                                        <TableHead>Line</TableHead>
                                                        <TableHead>Product ID</TableHead>
                                                        <TableHead>Product</TableHead>
                                                        <TableHead>Unit Price</TableHead>
                                                        <TableHead>Qty</TableHead>
                                                        <TableHead className="text-right">Line Total</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {selectedOrder.items.map((item: any) => (
                                                        <TableRow key={item.id} className="border-border">
                                                            <TableCell>#{item.id}</TableCell>
                                                            <TableCell>{item.product || "Deleted"}</TableCell>
                                                            <TableCell>
                                                                <div className="space-y-1">
                                                                    <p className="font-medium">{item.product_name}</p>
                                                                    {item.product_image && (
                                                                        <p className="text-xs text-muted-foreground truncate">{item.product_image}</p>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>{formatMoney(item.price)}</TableCell>
                                                            <TableCell>{item.quantity}</TableCell>
                                                            <TableCell className="text-right">{formatMoney(Number(item.price) * Number(item.quantity))}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </>
                                ) : (
                                    <p className="py-2 text-center text-sm text-muted-foreground">No ordered products found.</p>
                                )}
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!pendingStatusChange} onOpenChange={(open) => !open && setPendingStatusChange(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {pendingStatusChange?.nextStatus === "CANCELLED"
                                ? "Cancel this order?"
                                : pendingStatusChange?.nextStatus === "DELIVERED"
                                    ? "Mark this order as delivered?"
                                    : isStatusRollback(pendingStatusChange?.currentStatus || "", pendingStatusChange?.nextStatus || "")
                                        ? "Move this order back?"
                                        : "Confirm status change"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingStatusChange?.nextStatus === "CANCELLED"
                                ? `This will move ${pendingStatusChange?.customerName ? `${pendingStatusChange.customerName}'s` : "the"} order into the cancelled state. Use this only if fulfillment should stop.`
                                : pendingStatusChange?.nextStatus === "DELIVERED"
                                    ? `This confirms ${pendingStatusChange?.customerName ? `${pendingStatusChange.customerName}'s` : "the"} parcel has been delivered successfully.`
                                    : isStatusRollback(pendingStatusChange?.currentStatus || "", pendingStatusChange?.nextStatus || "")
                                        ? `This will move the order from ${getOrderStatusMeta(pendingStatusChange?.currentStatus || "PENDING").shortLabel.toLowerCase()} back to ${getOrderStatusMeta(pendingStatusChange?.nextStatus || "PENDING").shortLabel.toLowerCase()}. Use this when staff updated the workflow too far.`
                                        : "Apply this status change?"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Current Status</AlertDialogCancel>
                        <AlertDialogAction
                            className={cn(
                                pendingStatusChange?.nextStatus === "CANCELLED"
                                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    : ""
                            )}
                            onClick={() => {
                                if (pendingStatusChange) {
                                    handleStatusChange(pendingStatusChange.id, pendingStatusChange.nextStatus);
                                }
                                setPendingStatusChange(null);
                            }}
                        >
                            {pendingStatusChange?.nextStatus === "CANCELLED"
                                ? "Confirm Cancellation"
                                : pendingStatusChange?.nextStatus === "DELIVERED"
                                    ? "Confirm Delivery"
                                    : isStatusRollback(pendingStatusChange?.currentStatus || "", pendingStatusChange?.nextStatus || "")
                                        ? "Move Back"
                                        : "Confirm"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </AdminLayout>
    );
};

export default AdminOrders;
