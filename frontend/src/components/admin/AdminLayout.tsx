import { ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

interface AdminLayoutProps {
    children: ReactNode;
    title: string;
}

const AdminLayout = ({ children, title }: AdminLayoutProps) => {
    const navigate = useNavigate();
    const { user, loading } = useAuth();

    useEffect(() => {
        if (!loading) {
            if (!user) {
                toast.error("Please login to access admin panel");
                navigate("/");
            } else if (!user.is_staff) {
                toast.error("Access Denied: Admin privileges required");
                navigate("/home");
            }
        }
    }, [user, loading, navigate]);

    if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

    if (!user || !user.is_staff) return null;

    return (
        <div className="flex min-h-screen bg-background">
            <AdminSidebar />
            <main className="flex-1 p-8 overflow-x-hidden">
                <header className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-heading font-bold text-foreground">{title}</h1>
                        <p className="text-muted-foreground">Manage your store's {title.toLowerCase()} here.</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-sm font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">Store Manager</p>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
                            <span className="text-primary font-bold font-heading">{user.name.charAt(0).toUpperCase()}</span>
                        </div>
                    </div>
                </header>

                <section className="animate-in fade-in duration-500">
                    {children}
                </section>
            </main>
        </div>
    );
};

export default AdminLayout;
