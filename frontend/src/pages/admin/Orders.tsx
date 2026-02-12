import AdminLayout from "@/components/admin/AdminLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useState } from "react";
import { fetchAdminOrders, updateOrderStatus } from "@/lib/api";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AdminOrders = () => {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadOrders = async () => {
        try {
            const data = await fetchAdminOrders();
            setOrders(data);
        } catch (error) {
            toast.error("Failed to load orders");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOrders();
    }, []);

    const handleStatusChange = async (id: number, status: string) => {
        try {
            await updateOrderStatus(id, status);
            toast.success("Order status updated");
            loadOrders();
        } catch (error) {
            toast.error("Failed to update status");
        }
    };

    return (
        <AdminLayout title="Orders">
            <div className="bg-card-gradient border border-border rounded-xl overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent border-border">
                            <TableHead>Order ID</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Total</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-10">Loading orders...</TableCell></TableRow>
                        ) : orders.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-10">No orders found.</TableCell></TableRow>
                        ) : (
                            orders.map((order) => (
                                <TableRow key={order.id} className="border-border hover:bg-secondary/30">
                                    <TableCell className="font-bold">#{order.id}</TableCell>
                                    <TableCell>{order.shipping_address?.full_name || "User #" + order.user}</TableCell>
                                    <TableCell>Rs. {parseFloat(order.total_amount).toLocaleString()}</TableCell>
                                    <TableCell>
                                        <Select
                                            defaultValue={order.status}
                                            onValueChange={(val) => handleStatusChange(order.id, val)}
                                        >
                                            <SelectTrigger className="w-32 h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="PENDING">Pending</SelectItem>
                                                <SelectItem value="PROCESSING">Processing</SelectItem>
                                                <SelectItem value="SHIPPED">Shipped</SelectItem>
                                                <SelectItem value="DELIVERED">Delivered</SelectItem>
                                                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {new Date(order.created_at).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <p className="text-xs text-muted-foreground italic">View details coming soon</p>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </AdminLayout>
    );
};

export default AdminOrders;
