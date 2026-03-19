const GUEST_ORDER_STORAGE_KEY = "guest-order-confirmation";

export const saveGuestOrderConfirmation = (order: any) => {
    localStorage.setItem(GUEST_ORDER_STORAGE_KEY, JSON.stringify(order));
};

export const getGuestOrderConfirmation = () => {
    const storedOrder = localStorage.getItem(GUEST_ORDER_STORAGE_KEY);
    if (!storedOrder) {
        return null;
    }

    try {
        return JSON.parse(storedOrder);
    } catch (error) {
        console.error("Failed to parse saved guest order confirmation", error);
        localStorage.removeItem(GUEST_ORDER_STORAGE_KEY);
        return null;
    }
};

export const clearGuestOrderConfirmation = () => {
    localStorage.removeItem(GUEST_ORDER_STORAGE_KEY);
};
