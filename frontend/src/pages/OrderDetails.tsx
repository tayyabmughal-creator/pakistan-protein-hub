import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchHomePageSettings, fetchOrderById, cancelOrder, getImageUrl } from "@/lib/api";
import Loader from "@/components/Loader";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle, Package, Truck, XCircle } from "lucide-react";
import { getOrderProgressIndex, getOrderStatusMeta, ORDER_FLOW } from "@/lib/orderStatus";

const OrderDetails = () => {
    const { id } = useParams<{ id: string }>();
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);
    const { data: settings } = useQuery({
        queryKey: ["homepage-settings"],
        queryFn: fetchHomePageSettings,
    });

    const loadOrder = async () => {
        try {
            setLoading(true);
            if (id) {
                const data = await fetchOrderById(parseInt(id));
                setOrder(data);
            }
        } catch (error) {
            toast.error("Failed to load order");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOrder();
    }, [id]);

    const handleCancel = async () => {
        // eslint-disable-next-line
        if (!confirm("Are you sure you want to cancel this order?")) return;
        try {
            setCancelling(true);
            await cancelOrder(order.id);
            toast.success("Order cancelled");
            loadOrder();
        } catch (error) {
            toast.error("Failed to cancel order");
        } finally {
            setCancelling(false);
        }
    };

    if (loading) return <div className="py-20 flex justify-center"><Loader size={40} /></div>;
    if (!order) return <div className="text-center py-20">Order not found</div>;

    const steps = [
        { status: "PENDING", label: "Pending Verification", icon: Package },
        { status: "CONFIRMED", label: "Confirmed by Store", icon: CheckCircle },
        { status: "SHIPPED", label: "Shipped", icon: Truck },
        { status: "DELIVERED", label: "Delivered", icon: CheckCircle },
    ];

    // Simple logic to determine active step index.
    // If order is cancelled, show special state.
    const currentStep = getOrderProgressIndex(order.status);
    const isCancelled = order.status === "CANCELLED";
    const statusMeta = getOrderStatusMeta(order.status);
    const shippingLines = order.shipping_address ? String(order.shipping_address).split("\n").filter(Boolean) : [];
    const discountAmount = Number(order.discount_amount || 0);
    const shippingFee = Number(order.shipping_fee || 0);
    const supportPhone = settings?.support_phone?.trim() || "";
    const supportEmail = settings?.support_email?.trim() || "";
    const supportLabel = supportPhone && supportEmail ? `${supportPhone} or ${supportEmail}` : supportPhone || supportEmail || "via the contact page";
    const canCancelOrder = (order.status === "PENDING" || order.status === "CONFIRMED") && order.payment_status !== "PAID";
    const showPaidOrderNotice = (order.status === "PENDING" || order.status === "CONFIRMED") && order.payment_status === "PAID";
    const showProcessedOrderNotice = order.status === "SHIPPED" || order.status === "DELIVERED";
    const progressPercent = ((currentStep + 1) / steps.length) * 100;
    const currentStepLabel = steps[currentStep]?.label || statusMeta.shortLabel;

    return (
        <div className="container mx-auto px-4 py-8">
            <PageHeader title={`Order #${order.id}`} description={`Placed on ${new Date(order.created_at).toLocaleDateString()}`} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* Status Timeline */}
                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h3 className="font-heading font-bold text-lg">Order Status</h3>
                                <p className="mt-2 text-sm text-muted-foreground">{statusMeta.helper}</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge className={statusMeta.badgeClass}>{statusMeta.shortLabel}</Badge>
                                <span className="text-xs text-muted-foreground">
                                    Updated {new Date(order.updated_at || order.created_at).toLocaleString()}
                                </span>
                            </div>
                        </div>
                        <div className="my-6 h-px bg-border" />
                        {isCancelled ? (
                            <div className="flex items-start gap-3 text-destructive bg-destructive/10 p-4 rounded-lg">
                                <XCircle className="w-6 h-6" />
                                <div>
                                    <p className="font-bold">This order has been cancelled.</p>
                                    <p className="mt-1 text-sm text-muted-foreground">{statusMeta.helper}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="rounded-2xl border border-primary/15 bg-primary/[0.06] p-5">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="max-w-2xl">
                                            <p className="text-xs uppercase tracking-[0.22em] text-primary">Current Progress</p>
                                            <h4 className="mt-2 font-heading text-2xl font-bold text-foreground">{currentStepLabel}</h4>
                                            <p className="mt-2 text-sm text-muted-foreground">{statusMeta.helper}</p>
                                        </div>
                                        <div className="rounded-xl border border-primary/15 bg-background/80 px-4 py-3 lg:min-w-[190px]">
                                            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Stage</p>
                                            <p className="mt-1 text-lg font-semibold text-foreground">Step {currentStep + 1} of {steps.length}</p>
                                            <p className="text-xs text-muted-foreground">{Math.round(progressPercent)}% complete</p>
                                        </div>
                                    </div>
                                    <div className="mt-5">
                                        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                                            <span>Fulfillment Progress</span>
                                            <span>{Math.round(progressPercent)}%</span>
                                        </div>
                                        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-primary/10">
                                            <div
                                                className="h-full rounded-full bg-primary transition-all duration-500"
                                                style={{ width: `${progressPercent}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    {steps.map((step, idx) => {
                                        const Icon = step.icon;
                                        const isCompleted = idx < currentStep;
                                        const isCurrent = idx === currentStep;
                                        return (
                                            <div
                                                key={step.status}
                                                className={`rounded-2xl border p-4 transition-all ${
                                                    isCurrent
                                                        ? "border-primary/40 bg-primary/[0.08] shadow-glow"
                                                        : isCompleted
                                                            ? "border-emerald-500/20 bg-emerald-500/[0.06]"
                                                            : "border-border/60 bg-background/40"
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div
                                                        className={`flex h-11 w-11 items-center justify-center rounded-2xl border transition-colors ${
                                                            isCurrent
                                                                ? "border-primary bg-primary text-primary-foreground"
                                                                : isCompleted
                                                                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600"
                                                                    : "border-border bg-background text-muted-foreground"
                                                        }`}
                                                    >
                                                        <Icon className="h-5 w-5" />
                                                    </div>
                                                    <span
                                                        className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                                                            isCurrent
                                                                ? "bg-primary text-primary-foreground"
                                                                : isCompleted
                                                                    ? "bg-emerald-500/15 text-emerald-600"
                                                                    : "bg-secondary text-muted-foreground"
                                                        }`}
                                                    >
                                                        {isCurrent ? "Current" : isCompleted ? "Done" : `Step ${idx + 1}`}
                                                    </span>
                                                </div>
                                                <p className="mt-4 text-sm font-semibold text-foreground">{step.label}</p>
                                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                    {isCurrent
                                                        ? "This stage is active right now."
                                                        : isCompleted
                                                            ? "This stage has already been completed."
                                                            : "This step will unlock next in the delivery flow."}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                                        <p className="text-xs uppercase tracking-wider text-muted-foreground">What This Means</p>
                                        <p className="mt-2 text-sm">{statusMeta.helper}</p>
                                    </div>
                                    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Support</p>
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            If this status looks incorrect or the parcel is delayed, contact support with your order number.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Order Items */}
                    <div className="bg-card border border-border rounded-xl p-6">
                        <h3 className="font-heading font-bold text-lg mb-4">Items in Order</h3>
                        <div className="space-y-6">
                            {order.items.map((item: any) => (
                                <div key={item.id} className="flex gap-4 items-center border-b border-border pb-6 last:border-0 last:pb-0">
                                    <div className="w-20 h-20 bg-white rounded-lg border border-border overflow-hidden flex-shrink-0">
                                        <img
                                            src={getImageUrl(item.product_image) || "/placeholder.png"}
                                            alt={item.product_name}
                                            className="w-full h-full object-contain p-2"
                                        />
                                    </div>
                                    <div className="flex-grow">
                                        <h4 className="font-heading font-bold text-lg mb-1">{item.product_name}</h4>
                                        <p className="text-sm text-muted-foreground">Quantity: {item.quantity}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-heading font-bold text-lg">
                                            PKR {Number(item.price).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    {/* Shipping Address */}
                    <div className="bg-card border border-border rounded-xl p-6">
                        <h3 className="font-heading font-bold text-lg mb-4 flex items-center gap-2">
                            <Truck className="w-5 h-5 text-primary" /> Shipping Info
                        </h3>
                        <div className="space-y-2">
                            <p className="font-bold text-lg">{order.customer_name || "Customer"}</p>
                            {shippingLines.length ? (
                                shippingLines.map((line: string, index: number) => (
                                    <p key={`${line}-${index}`} className="text-muted-foreground">{line}</p>
                                ))
                            ) : (
                                <p className="text-muted-foreground">No shipping address recorded.</p>
                            )}
                            <p className="text-muted-foreground mt-2 flex items-center gap-2">
                                <span className="bg-secondary px-2 py-0.5 rounded text-xs font-bold">Mobile</span>
                                {order.customer_phone_number || "N/A"}
                            </p>
                        </div>
                    </div>

                    {/* Order Summary */}
                    <div className="bg-card border border-border rounded-xl p-6">
                        <h3 className="font-heading font-bold text-lg mb-4">Payment Summary</h3>
                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-muted-foreground">
                                <span>Subtotal</span>
                                <span className="text-foreground font-medium">PKR {Number(order.subtotal_amount).toLocaleString()}</span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="flex justify-between text-green-600 gap-4">
                                    <span>Promo Discount {order.applied_promo_code ? `(${order.applied_promo_code})` : ""}</span>
                                    <span>-PKR {discountAmount.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-muted-foreground">
                                <span>Shipping Fee</span>
                                <span className="text-foreground font-medium">{shippingFee === 0 ? "Free" : `PKR ${shippingFee.toLocaleString()}`}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Payment Method</span>
                                <span className="text-foreground font-medium">{String(order.payment_method).replace(/_/g, " ")}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Payment Status</span>
                                <span className="text-foreground font-medium">{order.payment_status}</span>
                            </div>
                            {order.payment_reference && (
                                <div className="flex justify-between text-muted-foreground gap-4">
                                    <span>Payment Reference</span>
                                    <span className="text-right text-foreground font-medium break-all">{order.payment_reference}</span>
                                </div>
                            )}
                            {order.payment_note && (
                                <div className="space-y-1 text-muted-foreground">
                                    <span className="block">Payment Note</span>
                                    <p className="text-foreground whitespace-pre-wrap">{order.payment_note}</p>
                                </div>
                            )}
                            <div className="h-px bg-border my-2" />
                            <div className="flex justify-between text-xl font-bold font-heading">
                                <span>Total</span>
                                <span className="text-primary">PKR {Number(order.total_amount).toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        {canCancelOrder ? (
                            <Button
                                variant="destructive"
                                className="w-full font-bold"
                                onClick={handleCancel}
                                disabled={cancelling}
                            >
                                {cancelling ? (
                                    <>
                                        <Loader size={16} className="mr-2" /> Cancelling...
                                    </>
                                ) : (
                                    "Cancel Order"
                                )}
                            </Button>
                        ) : showPaidOrderNotice ? (
                            <div className="bg-muted p-4 rounded-xl text-center">
                                <p className="text-sm font-bold text-muted-foreground mb-1">Paid order support required</p>
                                <p className="text-xs text-muted-foreground">
                                    Online payments are verified before any cancellation request can be handled. <br />
                                    Contact support: <span className="text-primary font-bold">{supportLabel}</span>
                                </p>
                            </div>
                        ) : showProcessedOrderNotice ? (
                            <div className="bg-muted p-4 rounded-xl text-center">
                                <p className="text-sm font-bold text-muted-foreground mb-1">Cannot Cancel Order</p>
                                <p className="text-xs text-muted-foreground">
                                    Order has already been processed. <br />
                                    Contact support: <span className="text-primary font-bold">{supportLabel}</span>
                                </p>
                            </div>
                        ) : null}
                        <div className="mt-4 pt-4 border-t border-border">
                            <Link to="/">
                                <Button className="w-full font-bold bg-green-600 hover:bg-green-700 text-white">
                                    Shop More
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderDetails;
