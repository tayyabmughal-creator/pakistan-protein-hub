const BASE_URL = "http://127.0.0.1:8000/api";

export const fetchProducts = async () => {
    const response = await fetch(`${BASE_URL}/products/`);
    if (!response.ok) throw new Error("Failed to fetch products");
    return response.json();
};

export const fetchCategories = async () => {
    const response = await fetch(`${BASE_URL}/categories/`);
    if (!response.ok) throw new Error("Failed to fetch categories");
    return response.json();
};

export const getImageUrl = (path: string | null) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return `http://127.0.0.1:8000${path}`;
};
