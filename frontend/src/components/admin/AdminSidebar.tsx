import { LayoutDashboard, Package, ListTree, ShoppingCart, Users, BarChart3, FileDown, Settings2, LogOut, ChevronRight, Store, BadgePercent, CreditCard } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface AdminSidebarProps {
    mobile?: boolean;
    onNavigate?: () => void;
}

const menuItems = [
    { title: "Dashboard", icon: LayoutDashboard, path: "/admin" },
    { title: "Analytics", icon: BarChart3, path: "/admin/analytics" },
    { title: "Customers", icon: Users, path: "/admin/customers" },
    { title: "Products", icon: Package, path: "/admin/products" },
    { title: "Categories", icon: ListTree, path: "/admin/categories" },
    { title: "Deals", icon: BadgePercent, path: "/admin/promotions" },
    { title: "Orders", icon: ShoppingCart, path: "/admin/orders" },
    { title: "Payments", icon: CreditCard, path: "/admin/payments" },
    { title: "Homepage", icon: Settings2, path: "/admin/homepage" },
    { title: "Reports", icon: FileDown, path: "/admin/reports" },
];

const AdminSidebar = ({ mobile = false, onNavigate }: AdminSidebarProps) => {
    const location = useLocation();

    return (
        <aside
            className={cn(
                "flex flex-col bg-card-gradient",
                mobile
                    ? "h-full px-4 py-5"
                    : "hidden h-screen w-72 shrink-0 border-r border-border px-6 py-6 md:sticky md:top-0 md:flex md:overflow-y-auto"
            )}
        >
            <div className={cn("pl-2", mobile ? "mb-8" : "mb-10")}>
                <h2 className="text-2xl font-heading font-bold gradient-text">PakNutrition Admin</h2>
                <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                    {mobile ? "Store Control Center" : "Management Portal"}
                </p>
            </div>

            <nav className="flex-1 space-y-2" aria-label="Admin navigation">
                {menuItems.map((item) => {
                    const isActive = location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path));
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            onClick={onNavigate}
                            aria-current={isActive ? "page" : undefined}
                            className={cn(
                                "group flex items-center justify-between rounded-xl px-4 py-3 transition-all duration-300",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-glow"
                                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <item.icon className={cn("w-5 h-5", isActive ? "text-primary-foreground" : "text-primary")} />
                                <span className="font-medium">{item.title}</span>
                            </div>
                            {isActive && <ChevronRight className="w-4 h-4 animate-in fade-in slide-in-from-left-2" />}
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto pt-6 border-t border-border">
                <Link
                    to="/"
                    onClick={onNavigate}
                    className="mb-3 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                >
                    <Store className="w-5 h-5 text-primary" />
                    <span className="font-medium">View Store</span>
                </Link>
                <button
                    onClick={() => {
                        localStorage.removeItem("token");
                        localStorage.removeItem("user");
                        onNavigate?.();
                        window.location.href = "/";
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    <span className="font-medium">Logout</span>
                </button>
            </div>
        </aside>
    );
};

export default AdminSidebar;
