import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOrders, getImageUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Loader from "@/components/Loader";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Clock3, Package } from "lucide-react";
import { getOrderStatusMeta, getOrderProgressIndex, ORDER_FLOW } from "@/lib/orderStatus";
import { toast } from "sonner";

const Orders = () => {
    const { user } = useAuth();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadOrders = async () => {
            if (!user) {
                return;
            }

            setLoading(true);
            try {
                const data = await fetchOrders();
                if (isMounted) {
                    setOrders(data);
                }
            } catch {
                if (isMounted) {
                    setOrders([]);
                    toast.error("Failed to load orders");
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        loadOrders();

        return () => {
            isMounted = false;
        };
    }, [user]);

    if (loading) return <div className="py-20 flex justify-center"><Loader size={40} /></div>;

    return (
        <div className="container mx-auto px-4 py-8">
            <PageHeader title="My Orders" description="Track your past and current orders." />

            {orders.length === 0 ? (
                <div className="text-center py-20 bg-card rounded-xl border border-border">
                    <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-bold mb-2">No orders found</h3>
                    <p className="text-muted-foreground mb-6">You haven't placed any orders yet.</p>
                    <Link to="/products"><Button>Start Shopping</Button></Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => {
                        const statusMeta = getOrderStatusMeta(order.status);
                        const progressIndex = getOrderProgressIndex(order.status);
                        return (
                        <div key={order.id} className="bg-card border border-border rounded-xl p-6 flex flex-col gap-5 hover:shadow-sm transition-shadow">
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-4 mb-2">
                                        <div className="flex -space-x-3 overflow-hidden">
                                            {order.items.slice(0, 3).map((item: any) => (
                                                <div key={item.id} className="w-12 h-12 rounded-full border-2 border-card bg-muted flex items-center justify-center overflow-hidden">
                                                    <img
                                                        src={getImageUrl(item.product_image) || "/placeholder.png"}
                                                        alt={item.product_name}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            ))}
                                            {order.items.length > 3 && (
                                                <div className="w-12 h-12 rounded-full border-2 border-card bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                                                    +{order.items.length - 3}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-heading font-bold text-lg">Order #{order.id}</h3>
                                            <p className="text-sm text-muted-foreground">
                                                {order.items.length} items • Placed on {new Date(order.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <Badge className={statusMeta.badgeClass}>
                                            {statusMeta.shortLabel}
                                        </Badge>
                                        <span className="font-bold">
                                            PKR {parseInt(order.total_amount).toLocaleString()}
                                        </span>
                                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                                            <Clock3 className="h-4 w-4" />
                                            Updated {new Date(order.updated_at || order.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                <Link to={`/orders/${order.id}`}>
                                    <Button variant="outline">
                                        View Details <ArrowRight className="ml-2 w-4 h-4" />
                                    </Button>
                                </Link>
                            </div>

                            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                                {order.status === "CANCELLED" ? (
                                    <div className="space-y-2">
                                        <p className="font-semibold text-destructive">Order cancelled</p>
                                        <p className="text-sm text-muted-foreground">{statusMeta.helper}</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-semibold">{statusMeta.label}</p>
                                            <p className="text-xs uppercase tracking-wider text-muted-foreground">
                                                Step {progressIndex + 1} of {ORDER_FLOW.length}
                                            </p>
                                        </div>
                                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${statusMeta.progressClass}`}
                                                style={{ width: `${((progressIndex + 1) / ORDER_FLOW.length) * 100}%` }}
                                            />
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            {ORDER_FLOW.map((step, index) => (
                                                <div key={step} className="text-xs">
                                                    <p className={index <= progressIndex ? "font-semibold text-foreground" : "text-muted-foreground"}>
                                                        {getOrderStatusMeta(step).shortLabel}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="mt-3 text-sm text-muted-foreground">{statusMeta.helper}</p>
                                    </>
                                )}
                            </div>
                        </div>
                    )})}
                </div>
            )
            }
        </div >
    );
};

export default Orders;
