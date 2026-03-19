import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAdminCatalogSummary, fetchAdminDashboard } from "@/lib/api";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

const Analytics = () => {
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [catalog, setCatalog] = useState<any | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const loadData = async () => {
      try {
        const [dashboardData, catalogData] = await Promise.all([
          fetchAdminDashboard(),
          fetchAdminCatalogSummary(),
        ]);
        setDashboard(dashboardData);
        setCatalog(catalogData);
      } catch {
        toast.error("Failed to load analytics");
      }
    };

    loadData();
  }, []);

  return (
    <AdminLayout title="Analytics">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Customer Growth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dashboard?.customer_growth || []} margin={{ left: isMobile ? 0 : 8, right: isMobile ? 0 : 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="month" stroke="#a3a3a3" tick={{ fontSize: isMobile ? 10 : 12 }} />
                  <YAxis hide={isMobile} stroke="#a3a3a3" tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="customers" stroke="#38bdf8" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Top Product Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 sm:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dashboard?.top_products || []}
                  layout="vertical"
                  margin={{ left: isMobile ? 0 : 20, right: isMobile ? 8 : 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis type="number" stroke="#a3a3a3" tick={{ fontSize: isMobile ? 10 : 12 }} />
                  <YAxis type="category" dataKey="name" stroke="#a3a3a3" width={isMobile ? 82 : 120} tick={{ fontSize: isMobile ? 10 : 12 }} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#f59e0b" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-8">
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Category Coverage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(catalog?.categories || []).map((category: any) => (
              <div key={category.id} className="flex flex-col gap-2 rounded-xl border border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium">{category.name}</p>
                <p className="text-sm text-muted-foreground">{category.product_count} products</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="font-heading">Most Reviewed Products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(catalog?.reviews || []).length > 0 ? (
              catalog.reviews.map((review: any) => (
                <div key={review.product_name} className="flex flex-col gap-2 rounded-xl border border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-medium">{review.product_name}</p>
                  <p className="text-sm text-muted-foreground">{review.review_count} reviews</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No review activity yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default Analytics;
