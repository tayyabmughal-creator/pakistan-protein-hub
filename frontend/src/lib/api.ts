import apiClient from "./apiClient";

const BASE_URL = "http://127.0.0.1:8000/api";

export const fetchProducts = async (filters?: { category_slug?: string | null; search?: string | null }) => {
    const params = new URLSearchParams();
    if (filters?.category_slug) {
        params.append("category_slug", filters.category_slug);
    }
    if (filters?.search) {
        params.append("search", filters.search);
    }
    const response = await apiClient.get(`/products/?${params.toString()}`);
    return response.data;
};

export const fetchProductBySlug = async (slug: string) => {
    const response = await apiClient.get(`/products/${slug}/`);
    return response.data;
};

export const fetchCategories = async () => {
    const response = await apiClient.get("/categories/");
    return response.data;
};

export const getImageUrl = (path: string | null) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;

    // Support local assets (Vite imports)
    if (path.startsWith("/src") || path.startsWith("/assets") || path.includes("assets")) {
        return path;
    }

    // DEBUG LOGGING
    console.log("getImageUrl Input:", path);

    // If path starts with /media, use it as is.
    let cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (!cleanPath.startsWith("/media/")) {
        cleanPath = `/media${cleanPath}`;
    }

    const rootUrl = BASE_URL.replace("/api", "");
    // Remove trailing slash from rootUrl to avoid double slashes
    const normalizedRoot = rootUrl.endsWith("/") ? rootUrl.slice(0, -1) : rootUrl;
    return `${normalizedRoot}${cleanPath}`;
};

// --- Cart ---
export const fetchCart = async () => {
    const response = await apiClient.get("/cart/");
    return response.data;
};

export const addToCart = async (productId: number, quantity: number) => {
    const response = await apiClient.post("/cart/items/", { product_id: productId, quantity });
    return response.data;
};

export const updateCartItem = async (itemId: number, quantity: number) => {
    const response = await apiClient.put(`/cart/items/${itemId}/`, { quantity });
    return response.data;
};

export const removeCartItem = async (itemId: number) => {
    const response = await apiClient.delete(`/cart/items/${itemId}/`);
    return response.data;
};

export const syncCart = async (items: { product_id: number; quantity: number }[]) => {
    const response = await apiClient.post("/cart/sync/", { items });
    return response.data;
};

// --- Users / Addresses ---
export const fetchAddresses = async () => {
    const response = await apiClient.get("/users/addresses");
    return response.data;
};

export const createAddress = async (data: any) => {
    const response = await apiClient.post("/users/addresses", data);
    return response.data;
};

export const deleteAddress = async (id: number) => {
    await apiClient.delete(`/users/addresses/${id}`);
    return id;
};

// --- Orders ---
export const createOrder = async (data: { address_id: number; payment_method: string }) => {
    const response = await apiClient.post("/orders/", data);
    return response.data;
};

export const fetchOrders = async () => {
    const response = await apiClient.get("/orders/");
    return response.data;
};

export const fetchOrderById = async (id: number) => {
    const response = await apiClient.get(`/orders/${id}/`);
    return response.data;
};

export const cancelOrder = async (id: number) => {
    const response = await apiClient.post(`/orders/${id}/cancel/`);
    return response.data;
};

// Admin APIs

// --- Products ---
export const fetchAdminProducts = async () => {
    const response = await apiClient.get("/admin/products/");
    return response.data;
};

export const createProduct = async (formData: FormData) => {
    const response = await apiClient.post("/admin/products/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
};

export const updateProduct = async (id: number, formData: FormData) => {
    const response = await apiClient.put(`/admin/products/${id}/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
};

export const deleteProduct = async (id: number) => {
    try {
        await apiClient.delete(`/admin/products/${id}/`);
        return null;
    } catch (error: any) {
        throw error.response?.data || error;
    }
};

// --- Categories ---
export const fetchAdminCategories = async () => {
    const response = await apiClient.get("/admin/categories/");
    return response.data;
};

export const createCategory = async (data: any) => {
    const isFormData = data instanceof FormData;
    const config = isFormData ? { headers: { "Content-Type": "multipart/form-data" } } : {};

    const response = await apiClient.post("/admin/categories/", data, config);
    return response.data;
};

export const updateCategory = async (id: number, data: any) => {
    const isFormData = data instanceof FormData;
    const config = isFormData ? { headers: { "Content-Type": "multipart/form-data" } } : {};

    const response = await apiClient.put(`/admin/categories/${id}/`, data, config);
    return response.data;
};

export const deleteCategory = async (id: number) => {
    try {
        await apiClient.delete(`/admin/categories/${id}/`);
        return null;
    } catch (error: any) {
        throw error.response?.data || error;
    }
};

// --- Orders ---
export const fetchAdminOrders = async () => {
    const response = await apiClient.get("/admin/orders/");
    return response.data;
};

export const updateOrderStatus = async (id: number, status: string) => {
    const response = await apiClient.patch(`/admin/orders/${id}/`, { status });
    return response.data;
};

// --- Users ---
export const fetchAdminUsers = async () => {
    const response = await apiClient.get("/admin/users/");
    return response.data;
};
