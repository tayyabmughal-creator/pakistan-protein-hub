export type OrderStatus = "PENDING" | "CONFIRMED" | "SHIPPED" | "DELIVERED" | "CANCELLED";

type OrderStatusMeta = {
    label: string;
    shortLabel: string;
    helper: string;
    badgeClass: string;
    progressClass: string;
};

export const ORDER_FLOW: OrderStatus[] = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED"];

export const ORDER_STATUS_META: Record<OrderStatus, OrderStatusMeta> = {
    PENDING: {
        label: "Pending Verification",
        shortLabel: "Pending",
        helper: "We received the order and the store is reviewing stock, address, and payment mode.",
        badgeClass: "bg-amber-500/10 text-amber-300 border-amber-500/20",
        progressClass: "bg-amber-500",
    },
    CONFIRMED: {
        label: "Confirmed by Store",
        shortLabel: "Confirmed",
        helper: "The order is accepted and is moving into packing and dispatch preparation.",
        badgeClass: "bg-sky-500/10 text-sky-300 border-sky-500/20",
        progressClass: "bg-sky-500",
    },
    SHIPPED: {
        label: "Shipped",
        shortLabel: "Shipped",
        helper: "The parcel has left the store and is on the way to the customer.",
        badgeClass: "bg-violet-500/10 text-violet-300 border-violet-500/20",
        progressClass: "bg-violet-500",
    },
    DELIVERED: {
        label: "Delivered",
        shortLabel: "Delivered",
        helper: "The order has been delivered successfully and the fulfillment cycle is complete.",
        badgeClass: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
        progressClass: "bg-emerald-500",
    },
    CANCELLED: {
        label: "Cancelled",
        shortLabel: "Cancelled",
        helper: "This order has been cancelled and will not move through the dispatch flow.",
        badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
        progressClass: "bg-destructive",
    },
};

export const getOrderStatusMeta = (status: string) => {
    return ORDER_STATUS_META[(status as OrderStatus) || "PENDING"] || ORDER_STATUS_META.PENDING;
};

export const getOrderProgressIndex = (status: string) => {
    if (status === "CANCELLED") return -1;
    return ORDER_FLOW.indexOf(status as OrderStatus);
};

export const getAllowedNextStatuses = (status: string): OrderStatus[] => {
    switch (status) {
        case "PENDING":
            return ["PENDING", "CONFIRMED", "CANCELLED"];
        case "CONFIRMED":
            return ["PENDING", "CONFIRMED", "SHIPPED", "CANCELLED"];
        case "SHIPPED":
            return ["CONFIRMED", "SHIPPED", "DELIVERED"];
        case "DELIVERED":
            return ["SHIPPED", "DELIVERED"];
        case "CANCELLED":
            return ["PENDING", "CANCELLED"];
        default:
            return ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];
    }
};

export const isStatusRollback = (currentStatus: string, nextStatus: string) => {
    const currentIndex = getOrderProgressIndex(currentStatus);
    const nextIndex = getOrderProgressIndex(nextStatus);

    if (currentStatus === "CANCELLED" && nextStatus === "PENDING") {
        return true;
    }

    if (currentIndex === -1 || nextIndex === -1) {
        return false;
    }

    return nextIndex < currentIndex;
};

export const requiresStatusConfirmation = (currentStatus: string, nextStatus: string) => {
    if (nextStatus === currentStatus) return false;
    if (nextStatus === "CANCELLED") return true;
    if (nextStatus === "DELIVERED") return true;
    if (currentStatus === "CANCELLED" && nextStatus === "PENDING") return true;
    return isStatusRollback(currentStatus, nextStatus);
};
