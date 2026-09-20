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
import { AlertTriangle, Banknote, Info, ShoppingCart, TrendingUp, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetchAdminDashboard } from "@/lib/api";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DashboardOverview, DashboardSummary, LowStockProduct, OrderStatusCount, RecentOrder, TopBrand, TopSku } from "@/lib/types";

const statusColors: Record<string, string> = {
  PENDING: "#f59e0b",
  CONFIRMED: "#22c55e",
  SHIPPED: "#38bdf8",
  DELIVERED: "#84cc16",
  CANCELLED: "#ef4444",
};

const Dashboard = () => {
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
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

  const overview: Partial<DashboardOverview> = dashboard?.overview ?? {};
  const definitions = dashboard?.metric_definitions ?? {};

  const statCards = [
    {
      title: "Settled revenue",
      value: `Rs. ${Number(overview.total_revenue || 0).toLocaleString()}`,
      icon: TrendingUp,
      color: "text-amber-400",
      // Named "settled", not "total". It is money received, not money invoiced.
      definition: definitions.settled_revenue,
    },
    {
      title: "This month",
      value: `Rs. ${Number(overview.monthly_revenue || 0).toLocaleString()}`,
      icon: TrendingUp,
      color: "text-primary",
      definition: definitions.monthly_settled_revenue,
    },
    {
      title: "COD outstanding",
      value: `Rs. ${Number(overview.pending_cod_value || 0).toLocaleString()}`,
      icon: Banknote,
      color: "text-amber-500",
      definition: definitions.pending_cod_value,
    },
    {
      title: "Customers",
      value: overview.total_customers || 0,
      icon: UserRound,
      color: "text-indigo-400",
      definition: definitions.total_customers,
    },
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
              {/* Every figure carries the definition the backend computed it
                  from. "Revenue" meaning two different things on one screen is
                  the bug this replaces. */}
              {card.definition ? (
                <TooltipProvider>
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Info className="h-3 w-3" />
                        How this is counted
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">{card.definition}</TooltipContent>
                  </UiTooltip>
                </TooltipProvider>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Live store data</p>
              )}
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
                    {(dashboard?.order_status_breakdown || []).map((entry: OrderStatusCount) => (
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
            {(dashboard?.recent_orders || []).map((order: RecentOrder) => (
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
              dashboard.low_stock_products.map((item: LowStockProduct) => (
                <div key={item.sku} className="flex flex-col gap-3 rounded-xl border border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <code>{item.sku}</code>
                      {item.variant && ` · ${item.variant}`} · {item.brand}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Reserved units are why "on hand" alone misleads. */}
                    {item.reserved > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {item.on_hand} on hand · {item.reserved} reserved
                      </span>
                    )}
                    <div className={`flex items-center gap-2 ${item.available <= 0 ? "text-destructive" : "text-amber-400"}`}>
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-semibold">
                        {item.available <= 0 ? "None available" : `${item.available} available`}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nothing is running low.</p>
            )}

            {Number(overview.never_counted_balances) > 0 && (
              <Link
                to="/admin/inventory"
                className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm transition-colors hover:border-amber-500"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                <span>
                  <strong>{overview.never_counted_balances}</strong> stock figure
                  {overview.never_counted_balances === 1 ? " has" : "s have"} never been
                  counted. These came from the old system and are unverified.
                </span>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Best sellers</CardTitle>
            <p className="text-xs text-muted-foreground">
              By SKU, because two flavours of one product are different things to reorder.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {(dashboard?.top_skus || []).length > 0 ? (
              dashboard.top_skus.map((row: TopSku) => (
                <div
                  key={row.sku}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <code>{row.sku}</code>
                      {row.variant && ` · ${row.variant}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{row.units} sold</p>
                    <p className="text-xs text-muted-foreground">
                      Rs. {Number(row.revenue).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing sold yet in the settled population.
              </p>
            )}

            {(dashboard?.top_brands || []).length > 0 && (
              <div className="pt-2">
                <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Top brands
                </p>
                <div className="flex flex-wrap gap-2">
                  {dashboard.top_brands.map((row: TopBrand) => (
                    <span
                      key={row.brand}
                      className="rounded-full border border-border px-3 py-1 text-xs"
                    >
                      {row.brand} · Rs. {Number(row.revenue).toLocaleString()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">
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
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Open Returns</p>
              <p className="mt-2 text-2xl font-bold">{overview.open_returns || 0}</p>
            </div>
            <div className="rounded-xl border border-border/60 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Out of Stock</p>
              <p className="mt-2 text-2xl font-bold">{overview.out_of_stock_products || 0}</p>
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
