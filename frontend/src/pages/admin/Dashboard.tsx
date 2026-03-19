import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ShoppingCart, TrendingUp, UserRound } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAdminDashboard } from "@/lib/api";
import { useIsMobile } from "@/hooks/use-mobile";

const statusColors: Record<string, string> = {
  PENDING: "#f59e0b",
  CONFIRMED: "#22c55e",
  SHIPPED: "#38bdf8",
  DELIVERED: "#84cc16",
  CANCELLED: "#ef4444",
};

const Dashboard = () => {
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    const load = async () => {
      try {
        setDashboard(await fetchAdminDashboard());
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const overview = dashboard?.overview ?? {};
  const statCards = [
    { title: "Total Revenue", value: `Rs. ${Number(overview.total_revenue || 0).toLocaleString()}`, icon: TrendingUp, color: "text-amber-400" },
    { title: "Monthly Revenue", value: `Rs. ${Number(overview.monthly_revenue || 0).toLocaleString()}`, icon: TrendingUp, color: "text-primary" },
    { title: "Total Orders", value: overview.total_orders || 0, icon: ShoppingCart, color: "text-blue-400" },
    { title: "Customers", value: overview.total_customers || 0, icon: UserRound, color: "text-indigo-400" },
  ];
  const pieInnerRadius = isMobile ? 42 : 65;
  const pieOuterRadius = isMobile ? 72 : 100;

  return (
    <AdminLayout title="Dashboard">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 sm:gap-6">
        {statCards.map((card) => (
          <Card key={card.title} className="bg-card-gradient border-border overflow-hidden group">
            <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-heading break-words">{loading ? "..." : card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">Live store data</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboard?.revenue_trend || []} margin={{ left: isMobile ? 0 : 8, right: isMobile ? 0 : 8 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#84cc16" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#84cc16" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="month" stroke="#a3a3a3" tick={{ fontSize: isMobile ? 10 : 12 }} />
                  <YAxis hide={isMobile} stroke="#a3a3a3" tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="revenue" stroke="#84cc16" fill="url(#revenueGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Order Status Mix</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dashboard?.order_status_breakdown || []}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={pieInnerRadius}
                    outerRadius={pieOuterRadius}
                    paddingAngle={4}
                  >
                    {(dashboard?.order_status_breakdown || []).map((entry: any) => (
                      <Cell key={entry.status} fill={statusColors[entry.status] || "#8884d8"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(dashboard?.recent_orders || []).map((order: any) => (
              <div key={order.id} className="flex flex-col gap-3 rounded-xl border border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">#{order.id} · {order.customer_name}</p>
                  <p className="text-xs text-muted-foreground">{order.customer_type} customer</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-semibold">Rs. {Number(order.total_amount).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{order.status}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard?.top_products || []} layout="vertical" margin={{ left: isMobile ? 0 : 20, right: isMobile ? 8 : 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis type="number" stroke="#a3a3a3" tick={{ fontSize: isMobile ? 10 : 12 }} />
                  <YAxis type="category" dataKey="name" stroke="#a3a3a3" width={isMobile ? 72 : 120} tick={{ fontSize: isMobile ? 10 : 12 }} />
                  <Tooltip />
                  <Bar dataKey="units_sold" fill="#22c55e" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Inventory Watch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(dashboard?.low_stock_products || []).length > 0 ? (
              dashboard.low_stock_products.map((product: any) => (
                <div key={product.id} className="flex flex-col gap-3 rounded-xl border border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.brand}</p>
                  </div>
                  <div className="flex items-center gap-2 text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-semibold">{product.stock} left</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No low-stock products right now.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Ops Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Pending Orders</p>
              <p className="mt-2 text-2xl font-bold">{overview.pending_orders || 0}</p>
            </div>
            <div className="rounded-xl border border-border/60 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Guest Orders</p>
              <p className="mt-2 text-2xl font-bold">{overview.guest_orders || 0}</p>
            </div>
            <div className="rounded-xl border border-border/60 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Active Products</p>
              <p className="mt-2 text-2xl font-bold">{overview.active_products || 0}</p>
            </div>
            <div className="rounded-xl border border-border/60 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Avg Order Value</p>
              <p className="mt-2 text-2xl font-bold">Rs. {Number(overview.avg_order_value || 0).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default Dashboard;
