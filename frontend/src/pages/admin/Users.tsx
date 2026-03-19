import { useEffect, useMemo, useState } from "react";
import {
    Clock3,
    Eye,
    Mail,
    MapPinned,
    Search,
    ShieldCheck,
    ShoppingBag,
    Sparkles,
    UserCheck,
    UserRound,
    UserX,
    Wallet,
} from "lucide-react";

import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAdminUserById, fetchAdminUsers, updateAdminUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CustomerSegment = "all" | "buyers" | "staff" | "inactive";

const formatMoney = (value: string | number | null | undefined) => {
    return new Intl.NumberFormat("en-PK", {
        style: "currency",
        currency: "PKR",
        minimumFractionDigits: 0,
    }).format(Number(value || 0));
};

const formatDateTime = (value?: string | null) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleString();
};

const formatDate = (value?: string | null) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleDateString();
};

const getInitials = (name?: string | null, email?: string | null) => {
    const source = name?.trim() || email?.trim() || "U";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
};

const statusBadgeClasses = {
    active: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    inactive: "bg-destructive/10 text-destructive border-destructive/20",
};

const accountBadgeClasses = {
    Customer: "bg-secondary text-secondary-foreground border-border",
    Staff: "bg-primary/15 text-primary border-primary/25",
    Superuser: "bg-amber-500/15 text-amber-300 border-amber-500/25",
};

const AdminUsers = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [segment, setSegment] = useState<CustomerSegment>("all");
    const [selectedUser, setSelectedUser] = useState<any | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [savingField, setSavingField] = useState<"is_active" | "is_staff" | null>(null);

    const loadUsers = async () => {
        try {
            const data = await fetchAdminUsers();
            setUsers(data);
        } catch {
            toast.error("Failed to load customers");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const summary = useMemo(() => {
        const totalUsers = users.length;
        const activeUsers = users.filter((user) => user.is_active).length;
        const staffUsers = users.filter((user) => user.is_staff).length;
        const buyingUsers = users.filter((user) => Number(user.order_count || 0) > 0).length;
        const totalRevenue = users.reduce((sum, user) => sum + Number(user.total_spent || 0), 0);

        return { totalUsers, activeUsers, staffUsers, buyingUsers, totalRevenue };
    }, [users]);

    const filteredUsers = useMemo(() => {
        const query = search.trim().toLowerCase();
        return users.filter((user) => {
            const matchesSegment = (
                segment === "all" ||
                (segment === "buyers" && Number(user.order_count || 0) > 0) ||
                (segment === "staff" && !!user.is_staff) ||
                (segment === "inactive" && !user.is_active)
            );

            if (!matchesSegment) return false;
            if (!query) return true;

            return [user.name, user.email, user.phone_number, user.account_type]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(query));
        });
    }, [search, segment, users]);

    const segmentOptions = [
        { key: "all" as const, label: "All Accounts", count: summary.totalUsers },
        { key: "buyers" as const, label: "Paying Customers", count: summary.buyingUsers },
        { key: "staff" as const, label: "Staff Access", count: summary.staffUsers },
        { key: "inactive" as const, label: "Disabled", count: summary.totalUsers - summary.activeUsers },
    ];

    const statCards = [
        {
            label: "Customers & Staff",
            value: summary.totalUsers,
            note: `${summary.buyingUsers} with at least one order`,
            icon: UserRound,
            tint: "from-primary/15 via-primary/5 to-transparent",
        },
        {
            label: "Active Accounts",
            value: summary.activeUsers,
            note: `${summary.totalUsers - summary.activeUsers} disabled right now`,
            icon: UserCheck,
            tint: "from-emerald-500/15 via-emerald-500/5 to-transparent",
        },
        {
            label: "Admin / Staff",
            value: summary.staffUsers,
            note: "Operational access to the admin panel",
            icon: ShieldCheck,
            tint: "from-amber-500/15 via-amber-500/5 to-transparent",
        },
        {
            label: "Customer Revenue",
            value: formatMoney(summary.totalRevenue),
            note: "Registered-customer lifetime spend",
            icon: Wallet,
            tint: "from-sky-500/15 via-sky-500/5 to-transparent",
        },
    ];

    const openUserDetails = async (user: any) => {
        setSelectedUser(user);
        setDetailLoading(true);
        try {
            const data = await fetchAdminUserById(user.id);
            setSelectedUser(data);
        } catch {
            toast.error("Failed to load customer details");
        } finally {
            setDetailLoading(false);
        }
    };

    const handleToggle = async (field: "is_active" | "is_staff", value: boolean) => {
        if (!selectedUser) return;

        setSavingField(field);
        try {
            const updated = await updateAdminUser(selectedUser.id, { [field]: value });
            setSelectedUser(updated);
            setUsers((prev) => prev.map((user) => (user.id === updated.id ? { ...user, ...updated } : user)));
            toast.success(field === "is_active" ? "Account status updated" : "Admin access updated");
        } catch (error: any) {
            const fieldError = error?.response?.data?.[field]?.[0];
            const detail = error?.response?.data?.detail || fieldError || "Failed to update customer";
            toast.error(detail);
        } finally {
            setSavingField(null);
        }
    };

    return (
        <AdminLayout title="Customers">
            <section className="rounded-2xl border border-border bg-card-gradient p-6">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-2xl">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
                            Customer Operations
                        </div>
                        <h2 className="font-heading text-3xl font-bold tracking-tight">Customers, spend, and service context in one view</h2>
                        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                            Review account health, recent buying activity, saved delivery addresses, and admin access without jumping across modules.
                        </p>
                    </div>

                    <div className="w-full max-w-md">
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search by name, email, phone"
                                className="h-11 rounded-xl border-border/70 bg-background/60 pl-9"
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {statCards.map((card) => (
                        <div
                            key={card.label}
                            className={cn(
                                "rounded-2xl border border-border/70 bg-gradient-to-br p-5",
                                card.tint,
                            )}
                        >
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{card.label}</p>
                                    <p className="mt-3 font-heading text-3xl font-bold">{card.value}</p>
                                </div>
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border/60 bg-background/70">
                                    <card.icon className="h-5 w-5 text-primary" />
                                </div>
                            </div>
                            <p className="mt-3 text-sm text-muted-foreground">{card.note}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-2">
                        {segmentOptions.map((option) => (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => setSegment(option.key)}
                                className={cn(
                                    "rounded-full border px-4 py-2 text-sm transition-colors",
                                    segment === option.key
                                        ? "border-primary/30 bg-primary text-primary-foreground"
                                        : "border-border bg-background/60 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                                )}
                            >
                                {option.label}
                                <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">
                                    {option.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    <p className="text-sm text-muted-foreground">
                        Showing <span className="font-semibold text-foreground">{filteredUsers.length}</span> of {users.length} accounts
                    </p>
                </div>
            </section>

            {loading ? (
                <div className="mt-6 rounded-2xl border border-border bg-card-gradient px-4 py-12 text-center lg:hidden">
                    Loading customers...
                </div>
            ) : filteredUsers.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-border bg-card-gradient px-4 py-14 text-center lg:hidden">
                    <div className="mx-auto max-w-md">
                        <p className="font-medium">No customers match this view.</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                            {search ? "Try a different search term or switch the active segment." : "No customer accounts are available in this segment yet."}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="mt-6 space-y-4 lg:hidden">
                    {filteredUsers.map((user) => (
                        <div key={user.id} className="rounded-2xl border border-border bg-card-gradient p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/70 text-sm font-semibold">
                                    {getInitials(user.name, user.email)}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium">{user.name || "Unnamed user"}</p>
                                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                        <Mail className="h-3.5 w-3.5 shrink-0" />
                                        <span className="truncate">{user.email}</span>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Badge className={accountBadgeClasses[user.account_type as keyof typeof accountBadgeClasses] || accountBadgeClasses.Customer}>
                                            {user.account_type}
                                        </Badge>
                                        <Badge className={user.is_active ? statusBadgeClasses.active : statusBadgeClasses.inactive}>
                                            {user.is_active ? "Active" : "Disabled"}
                                        </Badge>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-border/60 px-3 py-3 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <ShoppingBag className="h-4 w-4 text-primary" />
                                        <span>{user.order_count || 0} order(s)</span>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <MapPinned className="h-4 w-4 text-primary" />
                                        <span>{user.address_count || 0} saved address(es)</span>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2">
                                        <Clock3 className="h-4 w-4 text-primary" />
                                        <span>Last order: {user.last_order_at ? formatDate(user.last_order_at) : "None yet"}</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-border/60 px-3 py-3">
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Spend</p>
                                        <p className="mt-1 font-semibold">{formatMoney(user.total_spent)}</p>
                                    </div>
                                    <div className="rounded-xl border border-border/60 px-3 py-3">
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Joined</p>
                                        <p className="mt-1 font-semibold">{formatDate(user.date_joined)}</p>
                                    </div>
                                    <div className="col-span-2 rounded-xl border border-border/60 px-3 py-3">
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Activity</p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {user.last_login ? `Last login: ${formatDate(user.last_login)}` : "Last login: Never"}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <Button variant="outline" onClick={() => openUserDetails(user)} className="mt-4 w-full gap-2 rounded-xl">
                                <Eye className="h-4 w-4" />
                                View Details
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-6 hidden overflow-hidden rounded-2xl border border-border bg-card-gradient lg:block">
                <Table>
                    <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                            <TableHead>Customer</TableHead>
                            <TableHead>Signals</TableHead>
                            <TableHead>Spend</TableHead>
                            <TableHead>Joined</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="py-12 text-center">Loading customers...</TableCell>
                            </TableRow>
                        ) : filteredUsers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="py-14 text-center">
                                    <div className="mx-auto max-w-md">
                                        <p className="font-medium">No customers match this view.</p>
                                        <p className="mt-2 text-sm text-muted-foreground">
                                            {search ? "Try a different search term or switch the active segment." : "No customer accounts are available in this segment yet."}
                                        </p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredUsers.map((user) => (
                                <TableRow key={user.id} className="border-border hover:bg-secondary/30">
                                    <TableCell>
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/70 text-sm font-semibold">
                                                {getInitials(user.name, user.email)}
                                            </div>
                                            <div className="min-w-0 space-y-2">
                                                <div>
                                                    <p className="font-medium">{user.name || "Unnamed user"}</p>
                                                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Mail className="h-3.5 w-3.5" />
                                                        <span className="truncate">{user.email}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    <Badge className={accountBadgeClasses[user.account_type as keyof typeof accountBadgeClasses] || accountBadgeClasses.Customer}>
                                                        {user.account_type}
                                                    </Badge>
                                                    <Badge className={user.is_active ? statusBadgeClasses.active : statusBadgeClasses.inactive}>
                                                        {user.is_active ? "Active" : "Disabled"}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="grid gap-2 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                <ShoppingBag className="h-4 w-4 text-primary" />
                                                <span>{user.order_count || 0} order(s)</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <MapPinned className="h-4 w-4 text-primary" />
                                                <span>{user.address_count || 0} saved address(es)</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Clock3 className="h-4 w-4 text-primary" />
                                                <span>Last order: {user.last_order_at ? formatDate(user.last_order_at) : "None yet"}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <p className="font-semibold">{formatMoney(user.total_spent)}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {Number(user.order_count || 0) > 0 ? "Buying customer" : "No completed history yet"}
                                        </p>
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        <p>{formatDate(user.date_joined)}</p>
                                        <p className="mt-1 text-xs">Last login: {user.last_login ? formatDate(user.last_login) : "Never"}</p>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="outline" size="sm" onClick={() => openUserDetails(user)} className="gap-2 rounded-xl">
                                            <Eye className="h-4 w-4" />
                                            View Details
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
                <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl max-h-[90vh] overflow-hidden border-border bg-card p-0">
                    {selectedUser && (
                        <div className="flex max-h-[90vh] flex-col">
                            <DialogHeader className="border-b border-border/60 bg-card-gradient px-4 py-4 sm:px-5">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/70 text-sm font-semibold">
                                            {getInitials(selectedUser.name, selectedUser.email)}
                                        </div>
                                        <div className="min-w-0">
                                            <DialogTitle className="truncate text-lg sm:text-xl">{selectedUser.name || selectedUser.email}</DialogTitle>
                                            <DialogDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs break-all">
                                                <span className="break-all">{selectedUser.email}</span>
                                                {selectedUser.phone_number && <span>• {selectedUser.phone_number}</span>}
                                            </DialogDescription>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <Badge className={accountBadgeClasses[selectedUser.account_type as keyof typeof accountBadgeClasses] || accountBadgeClasses.Customer}>
                                                    {selectedUser.account_type}
                                                </Badge>
                                                <Badge className={selectedUser.is_active ? statusBadgeClasses.active : statusBadgeClasses.inactive}>
                                                    {selectedUser.is_active ? "Active" : "Disabled"}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-2 sm:min-w-[280px] sm:grid-cols-3">
                                        <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-2">
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Spend</p>
                                            <p className="mt-1 text-sm font-semibold">{formatMoney(selectedUser.total_spent)}</p>
                                        </div>
                                        <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-2">
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Orders</p>
                                            <p className="mt-1 text-sm font-semibold">{selectedUser.order_count || 0}</p>
                                        </div>
                                        <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-2">
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Addresses</p>
                                            <p className="mt-1 text-sm font-semibold">{selectedUser.address_count || 0}</p>
                                        </div>
                                    </div>
                                </div>
                            </DialogHeader>

                            {detailLoading ? (
                                <div className="px-5 py-16 text-center text-muted-foreground">Loading customer details...</div>
                            ) : (
                                <div className="overflow-y-auto px-4 py-4 sm:px-5">
                                    <Tabs defaultValue="overview" className="space-y-4">
                                        <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl bg-secondary/60 p-1">
                                            <TabsTrigger value="overview" className="rounded-lg text-xs sm:text-sm">Overview</TabsTrigger>
                                            <TabsTrigger value="addresses" className="rounded-lg text-xs sm:text-sm">Addresses</TabsTrigger>
                                            <TabsTrigger value="orders" className="rounded-lg text-xs sm:text-sm">Orders</TabsTrigger>
                                        </TabsList>

                                        <TabsContent value="overview" className="space-y-4">
                                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                                                <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                                                    <h3 className="font-semibold">Profile Snapshot</h3>
                                                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                        <div className="rounded-xl border border-border/50 px-3 py-3">
                                                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Email</p>
                                                            <p className="mt-1 break-all text-sm font-medium">{selectedUser.email}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-border/50 px-3 py-3">
                                                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Phone</p>
                                                            <p className="mt-1 text-sm font-medium">{selectedUser.phone_number || "N/A"}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-border/50 px-3 py-3">
                                                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Joined</p>
                                                            <p className="mt-1 text-sm font-medium">{formatDateTime(selectedUser.date_joined)}</p>
                                                        </div>
                                                        <div className="rounded-xl border border-border/50 px-3 py-3">
                                                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Last Login</p>
                                                            <p className="mt-1 text-sm font-medium">{formatDateTime(selectedUser.last_login)}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                                                    <h3 className="font-semibold">Account Controls</h3>
                                                    <div className="mt-3 space-y-3">
                                                        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-3">
                                                            <div>
                                                                <p className="text-sm font-medium">Active Account</p>
                                                                <p className="text-xs text-muted-foreground">Disable login without removing history.</p>
                                                            </div>
                                                            <Switch
                                                                checked={!!selectedUser.is_active}
                                                                disabled={savingField !== null}
                                                                onCheckedChange={(checked) => handleToggle("is_active", checked)}
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 px-3 py-3">
                                                            <div>
                                                                <p className="text-sm font-medium">Admin Access</p>
                                                                <p className="text-xs text-muted-foreground">Grant panel access for staff work.</p>
                                                            </div>
                                                            <Switch
                                                                checked={!!selectedUser.is_staff}
                                                                disabled={savingField !== null || !!selectedUser.is_superuser}
                                                                onCheckedChange={(checked) => handleToggle("is_staff", checked)}
                                                            />
                                                        </div>
                                                        <div className="rounded-xl border border-border/50 bg-secondary/20 px-3 py-3 text-xs text-muted-foreground">
                                                            {selectedUser.is_superuser
                                                                ? "Superuser access is fixed here to avoid accidental lockout."
                                                                : "Dispatch actions stay in the Orders module."}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="addresses" className="space-y-4">
                                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                                                <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                                                    <div className="mb-3 flex items-center gap-2">
                                                        <UserCheck className="h-4 w-4 text-primary" />
                                                        <h3 className="font-semibold">Saved Addresses</h3>
                                                    </div>
                                                    {selectedUser.addresses?.length ? (
                                                        <div className="space-y-3">
                                                            {selectedUser.addresses.map((address: any) => (
                                                                <div key={address.id} className="rounded-xl border border-border/50 p-3">
                                                                    <div className="mb-2 flex items-center justify-between gap-3">
                                                                        <div>
                                                                            <p className="text-sm font-medium">{address.full_name}</p>
                                                                            <p className="text-xs text-muted-foreground">{address.phone_number}</p>
                                                                        </div>
                                                                        {address.is_default && <Badge className="bg-primary/15 text-primary border-primary/25">Default</Badge>}
                                                                    </div>
                                                                    <p className="text-sm text-muted-foreground">{address.city}, {address.area}</p>
                                                                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{address.street}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
                                                    )}
                                                </div>

                                                <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                                                    <div className="mb-3 flex items-center gap-2">
                                                        <MapPinned className="h-4 w-4 text-primary" />
                                                        <h3 className="font-semibold">Default Address</h3>
                                                    </div>
                                                    {selectedUser.default_address ? (
                                                        <div className="space-y-2 text-sm">
                                                            <p className="font-medium">{selectedUser.default_address.full_name}</p>
                                                            <p className="text-muted-foreground">{selectedUser.default_address.phone_number}</p>
                                                            <p className="text-muted-foreground">
                                                                {selectedUser.default_address.city}, {selectedUser.default_address.area}
                                                            </p>
                                                            <p className="whitespace-pre-wrap text-muted-foreground">{selectedUser.default_address.street}</p>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-start gap-3 text-sm text-muted-foreground">
                                                            <UserX className="mt-0.5 h-4 w-4 shrink-0" />
                                                            <p>This customer has not set a default address.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </TabsContent>

                                        <TabsContent value="orders" className="space-y-4">
                                            <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                                                <h3 className="mb-3 font-semibold">Recent Orders</h3>
                                                {selectedUser.recent_orders?.length ? (
                                                    <div className="space-y-3">
                                                        {selectedUser.recent_orders.map((order: any) => (
                                                            <div key={order.id} className="rounded-xl border border-border/50 p-3">
                                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                                    <div className="space-y-1">
                                                                        <p className="text-sm font-semibold">Order #{order.id}</p>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            {order.applied_promo_code ? `Promo: ${order.applied_promo_code}` : "No promo applied"}
                                                                        </p>
                                                                    </div>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        <Badge className="bg-secondary text-secondary-foreground border-border">{order.status}</Badge>
                                                                        <Badge className="bg-primary/15 text-primary border-primary/25">{order.payment_method}</Badge>
                                                                    </div>
                                                                </div>
                                                                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                                                    <div>
                                                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Items</p>
                                                                        <p className="mt-1 text-sm font-medium">{order.items_count || 0}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                                                                        <p className="mt-1 text-sm font-medium">{formatMoney(order.total_amount)}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Payment</p>
                                                                        <p className="mt-1 text-sm font-medium">{order.payment_status}</p>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Date</p>
                                                                        <p className="mt-1 text-sm font-medium">{formatDate(order.created_at)}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground">No registered orders found for this customer.</p>
                                                )}
                                            </div>
                                        </TabsContent>
                                    </Tabs>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
};

export default AdminUsers;
