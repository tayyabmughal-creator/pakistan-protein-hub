import { ReactNode, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AdminSidebar from "./AdminSidebar";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface AdminLayoutProps {
    children: ReactNode;
    title: string;
}

const AdminLayout = ({ children, title }: AdminLayoutProps) => {
    const navigate = useNavigate();
    const { user, loading } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!loading) {
            if (!user) {
                toast.error("Please login to access admin panel");
                navigate("/");
            } else if (!user.is_staff) {
                toast.error("Access Denied: Admin privileges required");
                navigate("/");
            }
        }
    }, [user, loading, navigate]);

    if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

    if (!user || !user.is_staff) return null;

    const displayName = user.name?.trim() || user.email?.split("@")[0] || "Admin";

    return (
        <div className="min-h-screen bg-background md:flex">
            <AdminSidebar />
            <main className="min-w-0 flex-1">
                <div className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur md:hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                                <SheetTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-10 w-10 shrink-0 rounded-xl border-border"
                                    >
                                        <Menu className="h-5 w-5" />
                                        <span className="sr-only">Open admin navigation</span>
                                    </Button>
                                </SheetTrigger>
                                <SheetContent
                                    side="left"
                                    className="w-[min(20rem,calc(100vw-1rem))] border-border bg-card p-0"
                                >
                                    <AdminSidebar mobile onNavigate={() => setSidebarOpen(false)} />
                                </SheetContent>
                            </Sheet>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">{title}</p>
                                <p className="truncate text-xs text-muted-foreground">PakNutrition Admin</p>
                            </div>
                        </div>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/20">
                            <span className="font-heading font-bold text-primary">{displayName.charAt(0).toUpperCase()}</span>
                        </div>
                    </div>
                </div>

                <div className="px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-8">
                    <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-start md:justify-between">
                        <div>
                            <h1 className="text-2xl font-heading font-bold text-foreground sm:text-3xl">{title}</h1>
                            <p className="text-sm text-muted-foreground sm:text-base">Manage your store's {title.toLowerCase()} here.</p>
                        </div>
                        <div className="flex items-center gap-3 self-start rounded-2xl border border-border/70 bg-card-gradient px-3 py-3 sm:gap-4 sm:px-4">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{displayName}</p>
                                <p className="text-xs text-muted-foreground">Store Manager</p>
                            </div>
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/20">
                                <span className="text-primary font-bold font-heading">{displayName.charAt(0).toUpperCase()}</span>
                            </div>
                        </div>
                    </header>

                    <section className="animate-in fade-in duration-500">
                        {children}
                    </section>
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
