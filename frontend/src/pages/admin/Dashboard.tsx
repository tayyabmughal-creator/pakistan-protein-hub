import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ShoppingCart, Users, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAdminProducts, fetchAdminOrders, fetchAdminUsers } from "@/lib/api";

const Dashboard = () => {
    const [stats, setStats] = useState({
        products: 0,
        orders: 0,
        users: 0,
        revenue: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadStats = async () => {
            try {
                const [products, orders, users] = await Promise.all([
                    fetchAdminProducts(),
                    fetchAdminOrders(),
                    fetchAdminUsers()
                ]);

                setStats({
                    products: products.length,
                    orders: orders.length,
                    users: users.length,
                    revenue: orders.reduce((acc: number, order: any) => acc + parseFloat(order.total_amount), 0)
                });
            } catch (error) {
                console.error("Failed to load dashboard stats", error);
            } finally {
                setLoading(false);
            }
        };

        loadStats();
    }, []);

    const statCards = [
        { title: "Total Products", value: stats.products, icon: Package, color: "text-blue-400" },
        { title: "Total Orders", value: stats.orders, icon: ShoppingCart, color: "text-primary shadow-glow" },
        { title: "Total Users", value: stats.users, icon: Users, color: "text-indigo-400" },
        { title: "Total Revenue", value: `Rs. ${stats.revenue.toLocaleString()}`, icon: TrendingUp, color: "text-amber-400" },
    ];

    return (
        <AdminLayout title="Dashboard">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statCards.map((card, idx) => (
                    <Card key={idx} className="bg-card-gradient border-border overflow-hidden group">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                            <card.icon className={`w-5 h-5 ${card.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold font-heading">
                                {loading ? "..." : card.value}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">+12% from last month</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card className="bg-card-gradient border-border">
                    <CardHeader>
                        <CardTitle className="font-heading">Recent Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground italic">Order list visualization coming soon...</p>
                    </CardContent>
                </Card>
                <Card className="bg-card-gradient border-border">
                    <CardHeader>
                        <CardTitle className="font-heading">Top Products</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground italic">Product performance chart coming soon...</p>
                    </CardContent>
                </Card>
            </div>
        </AdminLayout>
    );
};

export default Dashboard;
