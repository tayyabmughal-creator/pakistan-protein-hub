import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock3, RefreshCw, XCircle } from "lucide-react";

import Loader from "@/components/Loader";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { fetchPaymentSession } from "@/lib/api";
import { clearGuestCart } from "@/lib/guestCart";
import { clearAppliedPromoCode } from "@/lib/promoSession";

const getPaymentStateFromSessionStatus = (status?: string | null) => {
    switch (status) {
        case "COMPLETED":
            return "success";
        case "CANCELLED":
            return "cancelled";
        case "FAILED":
            return "failed";
        case "REVIEW":
            return "review";
        default:
            return null;
    }
};

const getPaymentStatusMeta = (state: string) => {
    if (state === "success") {
        return {
            title: "Payment Completed",
            description: "Your payment was completed and your order has been recorded.",
            icon: CheckCircle2,
            iconClass: "text-emerald-600",
        };
    }
    if (state === "cancelled") {
        return {
            title: "Payment Cancelled",
            description: "You cancelled the online payment before it was completed.",
            icon: XCircle,
            iconClass: "text-amber-600",
        };
    }
    if (state === "failed") {
        return {
            title: "Payment Failed",
            description: "The payment could not be verified. You can return to checkout and try again.",
            icon: AlertCircle,
            iconClass: "text-destructive",
        };
    }
    if (state === "review") {
        return {
            title: "Payment Under Review",
            description: "We received the payment callback but could not finalize the order automatically. Please do not pay again right now. Our team will review it shortly.",
            icon: Clock3,
            iconClass: "text-amber-600",
        };
    }
    return {
        title: "Payment Pending",
        description: "We are waiting for the payment gateway to confirm the transaction.",
        icon: Clock3,
        iconClass: "text-primary",
    };
};

const PaymentStatus = () => {
    const [searchParams] = useSearchParams();
    const [sessionData, setSessionData] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    const sessionId = searchParams.get("session");
    const queryState = searchParams.get("state") || "pending";

    useEffect(() => {
        let retryTimer: number | undefined;

        const loadSession = async () => {
            if (!sessionId) {
                setLoading(false);
                return;
            }

            try {
                const data = await fetchPaymentSession(sessionId);
                setSessionData(data);
                if (data.status === "PENDING") {
                    retryTimer = window.setTimeout(loadSession, 4000);
                }
            } finally {
                setLoading(false);
            }
        };

        loadSession();
        return () => {
            if (retryTimer) {
                window.clearTimeout(retryTimer);
            }
        };
    }, [sessionId]);

    useEffect(() => {
        if (sessionData?.status === "COMPLETED" && sessionData?.order) {
            clearAppliedPromoCode();
            if (sessionData.order.customer_type === "Guest") {
                clearGuestCart();
            }
        }
    }, [sessionData]);

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-16 flex justify-center">
                <Loader size={36} />
            </div>
        );
    }

    const effectiveState = getPaymentStateFromSessionStatus(sessionData?.status) || queryState;
    const statusMeta = getPaymentStatusMeta(effectiveState);
    const Icon = statusMeta.icon;
    const order = sessionData?.order;
    const isGuestOrder = order?.customer_type === "Guest";
    const discountAmount = Number(sessionData?.discount_amount || 0);
    const shippingFee = Number(sessionData?.shipping_fee || 0);

    return (
        <div className="container mx-auto px-4 py-8">
            <PageHeader title="Payment Status" description="Review the result of your online payment." />

            <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-8 shadow-sm">
                <div className="flex flex-col items-center text-center">
                    <Icon className={`h-14 w-14 ${statusMeta.iconClass}`} />
                    <h2 className="mt-4 font-heading text-3xl font-bold">{statusMeta.title}</h2>
                    <p className="mt-3 max-w-xl text-muted-foreground">{statusMeta.description}</p>
                </div>

                {sessionData && (
                    <div className="mt-8 grid gap-4 rounded-xl border border-border bg-background p-6 md:grid-cols-2">
                        <div>
                            <p className="text-sm text-muted-foreground">Payment Method</p>
                            <p className="font-medium">{sessionData.payment_method}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Payment Status</p>
                            <p className="font-medium">{sessionData.status}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Subtotal</p>
                            <p className="font-medium">PKR {Number(sessionData.subtotal_amount).toLocaleString()}</p>
                        </div>
                        {discountAmount > 0 && (
                            <div>
                                <p className="text-sm text-muted-foreground">Promo Discount</p>
                                <p className="font-medium text-green-600">-PKR {discountAmount.toLocaleString()}</p>
                            </div>
                        )}
                        <div>
                            <p className="text-sm text-muted-foreground">Shipping</p>
                            <p className="font-medium">{shippingFee === 0 ? "Free" : `PKR ${shippingFee.toLocaleString()}`}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Total</p>
                            <p className="font-bold text-primary">PKR {Number(sessionData.total_amount).toLocaleString()}</p>
                        </div>
                        {sessionData.applied_promo_code && (
                            <div>
                                <p className="text-sm text-muted-foreground">Promo Code</p>
                                <p className="font-medium">{sessionData.applied_promo_code}</p>
                            </div>
                        )}
                        {sessionData.gateway_reference && (
                            <div>
                                <p className="text-sm text-muted-foreground">Gateway Reference</p>
                                <p className="font-medium">{sessionData.gateway_reference}</p>
                            </div>
                        )}
                    </div>
                )}

                {order && (
                    <div className="mt-8 rounded-xl border border-border bg-background p-6">
                        <p className="text-sm uppercase tracking-wider text-muted-foreground">Order Reference</p>
                        <p className="mt-2 font-heading text-4xl font-bold text-primary">#{order.id}</p>
                        <p className="mt-3 text-muted-foreground">
                            {isGuestOrder
                                ? "Save this reference. You can track your order later using your email or phone number."
                                : "Your order is confirmed and available in your account."}
                        </p>
                    </div>
                )}

                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    {order ? (
                        isGuestOrder ? (
                            <Link to="/guest-orders">
                                <Button variant="outline">Track Guest Order</Button>
                            </Link>
                        ) : (
                            <Link to={`/orders/${order.id}`}>
                                <Button variant="outline">View Order</Button>
                            </Link>
                        )
                    ) : (
                        effectiveState === "review" ? (
                            <Link to="/contact">
                                <Button variant="outline">Contact Support</Button>
                            </Link>
                        ) : (
                            <Link to="/checkout">
                                <Button variant="outline">Return to Checkout</Button>
                            </Link>
                        )
                    )}

                    <Link to="/products">
                        <Button>Continue Shopping</Button>
                    </Link>

                    {sessionData?.status === "PENDING" && (
                        <Link to="/checkout">
                            <Button variant="ghost">
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Back to Checkout
                            </Button>
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PaymentStatus;
