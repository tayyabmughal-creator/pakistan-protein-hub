import { LayoutDashboard, Package, ListTree, ShoppingCart, Users, LogOut, ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const AdminSidebar = () => {
    const location = useLocation();

    const menuItems = [
        { title: "Dashboard", icon: LayoutDashboard, path: "/admin" },
        { title: "Products", icon: Package, path: "/admin/products" },
        { title: "Categories", icon: ListTree, path: "/admin/categories" },
        { title: "Orders", icon: ShoppingCart, path: "/admin/orders" },
        { title: "Users", icon: Users, path: "/admin/users" },
    ];

    return (
        <aside className="w-64 h-screen bg-card-gradient border-r border-border sticky top-0 flex flex-col p-6 overflow-y-auto">
            <div className="mb-10 pl-2">
                <h2 className="text-2xl font-heading font-bold gradient-text">PPH ADMIN</h2>
                <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Management Portal</p>
            </div>

            <nav className="flex-1 space-y-2">
                {menuItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={cn(
                                "group flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300",
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
                <button
                    onClick={() => {
                        localStorage.removeItem("token");
                        localStorage.removeItem("user");
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
