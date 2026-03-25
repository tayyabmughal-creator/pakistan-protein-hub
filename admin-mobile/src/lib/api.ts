import axios from "axios";

import { API_BASE_URL, API_ROOT_URL } from "./config";
import apiClient from "./apiClient";
import { toAppError } from "./errors";
import {
  AdminOrder,
  AdminUser,
  AdminUserDetail,
  CatalogSummary,
  Category,
  DashboardData,
  HomePageSettings,
  LoginResponse,
  PaymentReview,
  PickedImageAsset,
  Product,
  Promotion,
} from "../types/api";

const formDataConfig = {
  headers: {
    "Content-Type": "multipart/form-data",
  },
};

export const getImageUrl = (path?: string | null) => {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_ROOT_URL}${cleanPath.startsWith("/media/") ? cleanPath : `/media${cleanPath}`}`;
};

export const loginAdmin = async (email: string, password: string) => {
  try {
    const response = await axios.post<LoginResponse>(
      `${API_BASE_URL}/users/login/`,
      {
        email,
        password,
      },
      {
        timeout: 20_000,
        headers: {
          "Content-Type": "application/json",
          "X-Client-App": "paknutrition-admin-mobile",
        },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      throw new Error("Email or password is incorrect.");
    }

    throw toAppError(error, "Could not sign in right now.");
  }
};

export const logoutUser = async (refresh: string) => {
  await apiClient.post("/users/logout/", { refresh });
};

export const fetchAdminDashboard = async () => {
  const response = await apiClient.get<DashboardData>("/admin/dashboard/");
  return response.data;
};

export const fetchAdminOrders = async () => {
  const response = await apiClient.get<AdminOrder[]>("/admin/orders/");
  return response.data;
};

export const fetchAdminOrderById = async (id: string | number) => {
  const response = await apiClient.get<AdminOrder>(`/admin/orders/${id}/`);
  return response.data;
};

export const updateAdminOrder = async (
  id: string | number,
  data: Partial<Pick<AdminOrder, "status" | "payment_status">>,
) => {
  const response = await apiClient.patch<AdminOrder>(`/admin/orders/${id}/`, data);
  return response.data;
};

export const fetchAdminProducts = async () => {
  const response = await apiClient.get<Product[]>("/admin/products/");
  return response.data;
};

export const fetchAdminProductById = async (id: string | number) => {
  const response = await apiClient.get<Product>(`/admin/products/${id}/`);
  return response.data;
};

export const createAdminProduct = async (formData: FormData) => {
  const response = await apiClient.post<Product>("/admin/products/", formData, formDataConfig);
  return response.data;
};

export const updateAdminProduct = async (id: string | number, formData: FormData) => {
  const response = await apiClient.patch<Product>(`/admin/products/${id}/`, formData, formDataConfig);
  return response.data;
};

export const deleteAdminProduct = async (id: string | number) => {
  await apiClient.delete(`/admin/products/${id}/`);
};

export const fetchAdminCategories = async () => {
  const response = await apiClient.get<Category[]>("/admin/categories/");
  return response.data;
};

export const fetchAdminCategoryById = async (id: string | number) => {
  const response = await apiClient.get<Category>(`/admin/categories/${id}/`);
  return response.data;
};

export const createAdminCategory = async (formData: FormData) => {
  const response = await apiClient.post<Category>("/admin/categories/", formData, formDataConfig);
  return response.data;
};

export const updateAdminCategory = async (id: string | number, formData: FormData) => {
  const response = await apiClient.put<Category>(`/admin/categories/${id}/`, formData, formDataConfig);
  return response.data;
};

export const deleteAdminCategory = async (id: string | number) => {
  await apiClient.delete(`/admin/categories/${id}/`);
};

export const fetchAdminPromotions = async () => {
  const response = await apiClient.get<Promotion[]>("/admin/promotions/");
  return response.data;
};

export const fetchAdminPromotionById = async (id: string | number) => {
  const response = await apiClient.get<Promotion>(`/admin/promotions/${id}/`);
  return response.data;
};

export const createAdminPromotion = async (data: Partial<Promotion>) => {
  const response = await apiClient.post<Promotion>("/admin/promotions/", data);
  return response.data;
};

export const updateAdminPromotion = async (id: string | number, data: Partial<Promotion>) => {
  const response = await apiClient.patch<Promotion>(`/admin/promotions/${id}/`, data);
  return response.data;
};

export const deleteAdminPromotion = async (id: string | number) => {
  await apiClient.delete(`/admin/promotions/${id}/`);
};

export const fetchAdminUsers = async () => {
  const response = await apiClient.get<AdminUser[]>("/admin/users/");
  return response.data;
};

export const fetchAdminUserById = async (id: string | number) => {
  const response = await apiClient.get<AdminUserDetail>(`/admin/users/${id}/`);
  return response.data;
};

export const updateAdminUser = async (
  id: string | number,
  data: Partial<Pick<AdminUser, "name" | "phone_number" | "is_staff" | "is_active">>,
) => {
  const response = await apiClient.patch<AdminUserDetail>(`/admin/users/${id}/`, data);
  return response.data;
};

export const fetchAdminCatalogSummary = async () => {
  const response = await apiClient.get<CatalogSummary>("/admin/catalog-summary/");
  return response.data;
};

export const fetchAdminHomePageSettings = async () => {
  const response = await apiClient.get<HomePageSettings>("/admin/homepage-settings/");
  return response.data;
};

export const updateAdminHomePageSettings = async (data: Partial<HomePageSettings>) => {
  const response = await apiClient.put<HomePageSettings>("/admin/homepage-settings/", data);
  return response.data;
};

export const fetchAdminPaymentReviews = async (status = "REVIEW") => {
  const response = await apiClient.get<PaymentReview[]>(`/admin/payment-sessions/?status=${encodeURIComponent(status)}`);
  return response.data;
};

export const resolveAdminPaymentReview = async (publicId: string, action: "approve" | "fail") => {
  const response = await apiClient.post<PaymentReview>(`/admin/payment-sessions/${publicId}/action/`, { action });
  return response.data;
};

export const downloadAdminReport = async (reportKey: "orders" | "customers" | "inventory") => {
  const response = await apiClient.get<string>(`/admin/reports/${reportKey}/`, {
    responseType: "text",
    transformResponse: [(data) => data],
  });
  const contentDisposition = response.headers["content-disposition"] as string | undefined;
  const matchedFileName = contentDisposition?.match(/filename="?([^"]+)"?$/)?.[1] || `${reportKey}-report.csv`;
  return {
    data: typeof response.data === "string" ? response.data : String(response.data),
    fileName: matchedFileName,
  };
};

export const registerAdminDevice = async (data: {
  installation_id: string;
  expo_push_token: string;
  device_name?: string;
  platform: "ios" | "android" | "unknown";
  app_version?: string;
}) => {
  const response = await apiClient.post("/admin/mobile/devices/register/", data);
  return response.data;
};

export const deactivateAdminDevice = async (data: { installation_id?: string; expo_push_token?: string }) => {
  const response = await apiClient.post("/admin/mobile/devices/deactivate/", data);
  return response.data;
};

export const appendImageToFormData = (formData: FormData, fieldName: string, image?: PickedImageAsset | null) => {
  if (!image) return;
  formData.append(fieldName, {
    uri: image.uri,
    name: image.name,
    type: image.type,
  } as unknown as Blob);
};
