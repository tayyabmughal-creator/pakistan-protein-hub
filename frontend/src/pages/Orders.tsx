import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchOrders } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Loader from "@/components/Loader";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Package } from "lucide-react";

const Orders = () => {
    const { user } = useAuth();
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            setLoading(true);
            fetchOrders().then((data) => {
                setOrders(data);
                setLoading(false);
            });
        }
    }, [user]);

    if (loading) return <div className="py-20 flex justify-center"><Loader size={40} /></div>;

    const getStatusColor = (status: string) => {
        switch (status) {
            case "PENDING": return "bg-yellow-500/10 text-yellow-600 border-yellow-200";
            case "CONFIRMED": return "bg-blue-500/10 text-blue-600 border-blue-200";
            case "SHIPPED": return "bg-purple-500/10 text-purple-600 border-purple-200";
            case "DELIVERED": return "bg-green-500/10 text-green-600 border-green-200";
            case "CANCELLED": return "bg-red-500/10 text-red-600 border-red-200";
            default: return "bg-gray-100 text-gray-600";
        }
    };

    return (
        <div className="container mx-auto px-4 py-8">
            <PageHeader title="My Orders" description="Track your past and current orders." />

            {orders.length === 0 ? (
                <div className="text-center py-20 bg-card rounded-xl border border-border">
                    <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-xl font-bold mb-2">No orders found</h3>
                    <p className="text-muted-foreground mb-6">You haven't placed any orders yet.</p>
                    <Link to="/home"><Button>Start Shopping</Button></Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => (
                        <div key={order.id} className="bg-card border border-border rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-sm transition-shadow">
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <h3 className="font-heading font-bold text-lg">Order #{order.id}</h3>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getStatusColor(order.status)}`}>
                                        {order.status}
                                    </span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Placed on {new Date(order.created_at).toLocaleDateString()}
                                </p>
                                <p className="font-bold mt-2">
                                    PKR {parseInt(order.total_amount).toLocaleString()}
                                </p>
                            </div>
                            <Link to={`/orders/${order.id}`}>
                                <Button variant="outline">
                                    View Details <ArrowRight className="ml-2 w-4 h-4" />
                                </Button>
                            </Link>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Orders;
