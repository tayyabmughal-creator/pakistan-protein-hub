import apiClient from "./apiClient";

const BASE_URL = "http://127.0.0.1:8000/api";

export const fetchProducts = async () => {
    const response = await apiClient.get("/products/");
    return response.data;
};

export const fetchCategories = async () => {
    const response = await apiClient.get("/categories/");
    return response.data;
};

export const getImageUrl = (path: string | null) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;

    // If path starts with /media, use it as is.
    let cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (!cleanPath.startsWith("/media/")) {
        cleanPath = `/media${cleanPath}`;
    }

    const rootUrl = BASE_URL.replace("/api", "");
    return `${rootUrl}${cleanPath}`;
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
