import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchOrderById, cancelOrder, getImageUrl } from "@/lib/api";
import Loader from "@/components/Loader";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertCircle, CheckCircle, Package, Truck, XCircle } from "lucide-react";

const OrderDetails = () => {
    const { id } = useParams<{ id: string }>();
    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);

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
    const getStepIndex = (status: string) => {
        const orderStatuses = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"];
        return orderStatuses.indexOf(status);
    };

    const currentStep = getStepIndex(order.status);
    const isCancelled = order.status === "CANCELLED";

    return (
        <div className="container mx-auto px-4 py-8">
            <PageHeader title={`Order #${order.id}`} description={`Placed on ${new Date(order.created_at).toLocaleDateString()}`} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* Status Timeline */}
                    <div className="bg-card border border-border rounded-xl p-6">
                        <h3 className="font-heading font-bold text-lg mb-6">Order Status</h3>
                        {isCancelled ? (
                            <div className="flex items-center gap-3 text-destructive bg-destructive/10 p-4 rounded-lg">
                                <XCircle className="w-6 h-6" />
                                <span className="font-bold">This order has been cancelled.</span>
                            </div>
                        ) : (
                            <div className="relative">
                                {/* Timeline Background */}
                                <div className="absolute top-1/2 left-0 w-full h-1 bg-secondary -z-10 -translate-y-1/2 rounded-full" />
                                {/* Timeline Progress */}
                                <div
                                    className="absolute top-1/2 left-0 h-1 bg-primary -z-10 -translate-y-1/2 rounded-full transition-all duration-500"
                                    style={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
                                />

                                <div className="flex justify-between w-full">
                                    {steps.map((step, idx) => {
                                        const Icon = step.icon;
                                        const isActive = idx <= currentStep;
                                        return (
                                            <div key={step.status} className="flex flex-col items-center gap-2 bg-background px-2 z-10">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${isActive ? "bg-primary border-primary text-primary-foreground shadow-glow" : "bg-card border-muted text-muted-foreground"
                                                    }`}>
                                                    <Icon className="w-4 h-4" />
                                                </div>
                                                <span className={`text-xs font-bold uppercase tracking-wider ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                                                    {step.label}
                                                </span>
                                            </div>
                                        );
                                    })}
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
                        <div className="space-y-1">
                            <p className="font-bold text-lg">{order.address?.full_name}</p>
                            <p className="text-muted-foreground">{order.address?.street}</p>
                            <p className="text-muted-foreground">{order.address?.area}, {order.address?.city}</p>
                            <p className="text-muted-foreground mt-2 flex items-center gap-2">
                                <span className="bg-secondary px-2 py-0.5 rounded text-xs font-bold">Mobile</span>
                                {order.address?.phone_number}
                            </p>
                        </div>
                    </div>

                    {/* Order Summary */}
                    <div className="bg-card border border-border rounded-xl p-6">
                        <h3 className="font-heading font-bold text-lg mb-4">Payment Summary</h3>
                        <div className="space-y-3 mb-6">
                            <div className="flex justify-between text-muted-foreground">
                                <span>Subtotal</span>
                                <span className="text-foreground font-medium">PKR {Number(order.total_amount).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Shipping Fee</span>
                                <span className="text-foreground font-medium text-green-600">Free</span>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                                <span>Payment Method</span>
                                <span className="text-foreground font-medium">{order.payment_method}</span>
                            </div>
                            <div className="h-px bg-border my-2" />
                            <div className="flex justify-between text-xl font-bold font-heading">
                                <span>Total</span>
                                <span className="text-primary">PKR {Number(order.total_amount).toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        {/* Actions */}
                        {(order.status === "PENDING" || order.status === "CONFIRMED") ? (
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
                        ) : (order.status === "SHIPPED" || order.status === "DELIVERED") ? (
                            <div className="bg-muted p-4 rounded-xl text-center">
                                <p className="text-sm font-bold text-muted-foreground mb-1">Cannot Cancel Order</p>
                                <p className="text-xs text-muted-foreground">
                                    Order has already been processed. <br />
                                    Contact Admin: <span className="text-primary font-bold">0300 1234567</span>
                                </p>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderDetails;
