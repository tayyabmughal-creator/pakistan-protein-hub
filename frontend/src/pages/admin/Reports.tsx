import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { downloadAdminReport } from "@/lib/api";
import { toast } from "sonner";

const reportCards = [
  {
    key: "orders" as const,
    title: "Orders Report",
    description: "Download every order with status, payment method, totals, and created date.",
  },
  {
    key: "customers" as const,
    title: "Customers Report",
    description: "Download your customer list with joined date, contact info, and order count.",
  },
  {
    key: "inventory" as const,
    title: "Inventory Report",
    description: "Download the current product catalog with stock, category, and live selling price.",
  },
];

const Reports = () => {
  const handleDownload = async (key: "orders" | "customers" | "inventory") => {
    try {
      await downloadAdminReport(key);
      toast.success("Report download started");
    } catch {
      toast.error("Failed to download report");
    }
  };

  return (
    <AdminLayout title="Reports">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {reportCards.map((report) => (
          <Card key={report.key} className="bg-card-gradient border-border">
            <CardHeader>
              <CardTitle className="font-heading">{report.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{report.description}</p>
              <Button onClick={() => handleDownload(report.key)} className="w-full">
                Download CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
};

export default Reports;
