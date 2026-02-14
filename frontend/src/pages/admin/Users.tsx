import AdminLayout from "@/components/admin/AdminLayout";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useState } from "react";
import { fetchAdminUsers } from "@/lib/api";
import { toast } from "sonner";

const AdminUsers = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadUsers = async () => {
            try {
                const data = await fetchAdminUsers();
                setUsers(data);
            } catch (error) {
                toast.error("Failed to load users");
            } finally {
                setLoading(false);
            }
        };
        loadUsers();
    }, []);

    return (
        <AdminLayout title="Users">
            <div className="bg-card-gradient border border-border rounded-xl overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent border-border">
                            <TableHead>ID</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Joined</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-10">Loading users...</TableCell></TableRow>
                        ) : users.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center py-10">No users found.</TableCell></TableRow>
                        ) : (
                            users.map((user) => (
                                <TableRow key={user.id} className="border-border hover:bg-secondary/30">
                                    <TableCell>{user.id}</TableCell>
                                    <TableCell className="font-medium">{user.email}</TableCell>
                                    <TableCell>
                                        {user.is_staff ? (
                                            <span className="px-2 py-1 bg-primary/20 text-primary rounded text-xs font-bold uppercase">Staff</span>
                                        ) : (
                                            <span className="px-2 py-1 bg-secondary text-muted-foreground rounded text-xs font-bold uppercase">Customer</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                        {new Date(user.date_joined).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <p className="text-xs text-muted-foreground italic">Edit role coming soon</p>
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

export default AdminUsers;
