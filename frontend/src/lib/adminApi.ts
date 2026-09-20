/**
 * Admin API client for the v2 endpoints.
 *
 * Kept apart from lib/api.ts because these are capability-gated, paginated and
 * command-driven, whereas the older client is mostly plain CRUD. Separating
 * them means the legacy screens can keep working untouched while these move
 * over.
 */

import apiClient from "./apiClient";
import type {
  AdminBrand,
  AdminCategoryRow,
  AdminGoal,
  AdminMedia,
  AdminOrderDetail,
  AdminOrderRow,
  AdminProductDetail,
  AdminProductRow,
  AdminReturn,
  AdminVariant,
  InventoryBalance,
  OrderQueues,
  Paginated,
  StockMovement,
} from "./types";

type Params = Record<string, string | number | undefined>;

function clean(params?: Params) {
  if (!params) return undefined;
  // Drop empty values so the URL carries only filters that are actually set.
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ""),
  );
}

// -- inventory --------------------------------------------------------------

export const fetchInventory = async (params?: Params) => {
  const response = await apiClient.get<Paginated<InventoryBalance>>("/admin/inventory/", {
    params: clean(params),
  });
  return response.data;
};

export const fetchStockMovements = async (params?: Params) => {
  const response = await apiClient.get<Paginated<StockMovement>>(
    "/admin/inventory/movements/",
    { params: clean(params) },
  );
  return response.data;
};

export const receiveStock = async (payload: {
  variant: number;
  quantity: number;
  reason?: string;
  reference?: string;
}) => {
  const response = await apiClient.post<InventoryBalance>("/admin/inventory/receive/", payload);
  return response.data;
};

export const adjustStock = async (payload: {
  variant: number;
  delta: number;
  movement_type: "DAMAGE" | "MANUAL_ADJUSTMENT" | "RETURN";
  reason: string;
}) => {
  const response = await apiClient.post<InventoryBalance>("/admin/inventory/adjust/", payload);
  return response.data;
};

export const countStock = async (payload: {
  variant: number;
  counted: number;
  reason?: string;
}) => {
  const response = await apiClient.post<InventoryBalance>("/admin/inventory/count/", payload);
  return response.data;
};

// -- orders -----------------------------------------------------------------

export const fetchAdminOrdersV2 = async (params?: Params) => {
  const response = await apiClient.get<Paginated<AdminOrderRow>>("/admin/v2/orders/", {
    params: clean(params),
  });
  return response.data;
};

export const fetchOrderQueues = async () => {
  const response = await apiClient.get<OrderQueues>("/admin/v2/orders/queues/");
  return response.data;
};

export const fetchAdminOrderDetail = async (id: number) => {
  const response = await apiClient.get<AdminOrderDetail>(`/admin/v2/orders/${id}/`);
  return response.data;
};

export const transitionOrder = async (
  id: number,
  payload: {
    status: string;
    reason?: string;
    courier_name?: string;
    tracking_number?: string;
  },
) => {
  const response = await apiClient.post<AdminOrderDetail>(
    `/admin/v2/orders/${id}/transition/`,
    payload,
  );
  return response.data;
};

export const addOrderNote = async (id: number, note: string) => {
  const response = await apiClient.post<AdminOrderDetail>(`/admin/v2/orders/${id}/note/`, {
    note,
  });
  return response.data;
};

// -- returns ----------------------------------------------------------------

export const fetchReturns = async (params?: Params) => {
  const response = await apiClient.get<Paginated<AdminReturn>>("/admin/v2/returns/", {
    params: clean(params),
  });
  return response.data;
};

export const createReturn = async (
  orderId: number,
  payload: {
    lines: { order_item_id: number; quantity: number }[];
    reason: string;
    customer_note?: string;
  },
) => {
  const response = await apiClient.post<AdminReturn>(
    `/admin/v2/orders/${orderId}/returns/`,
    payload,
  );
  return response.data;
};

export const decideReturn = async (
  id: number,
  payload: { action: "approve" | "reject"; reason?: string },
) => {
  const response = await apiClient.post<AdminReturn>(
    `/admin/v2/returns/${id}/decision/`,
    payload,
  );
  return response.data;
};

export const receiveReturn = async (id: number, restock: Record<string, boolean>) => {
  const response = await apiClient.post<AdminReturn>(`/admin/v2/returns/${id}/receive/`, {
    restock,
  });
  return response.data;
};

export const refundReturn = async (
  id: number,
  payload: { amount: string; note?: string },
) => {
  const response = await apiClient.post<AdminReturn>(
    `/admin/v2/returns/${id}/refund/`,
    payload,
  );
  return response.data;
};

// -- catalogue --------------------------------------------------------------

export const fetchAdminProducts = async (params?: Params) => {
  const response = await apiClient.get<Paginated<AdminProductRow>>(
    "/admin/v2/catalog/products/",
    { params: clean(params) },
  );
  return response.data;
};

export const fetchAdminProduct = async (id: number) => {
  const response = await apiClient.get<AdminProductDetail>(
    `/admin/v2/catalog/products/${id}/`,
  );
  return response.data;
};

export const updateAdminProduct = async (
  id: number,
  payload: Partial<AdminProductDetail>,
) => {
  const response = await apiClient.patch<AdminProductDetail>(
    `/admin/v2/catalog/products/${id}/`,
    payload,
  );
  return response.data;
};

/** Publishing is a command: the API checks completeness and may refuse. */
export const setProductPublished = async (id: number, publish: boolean) => {
  const response = await apiClient.post<AdminProductDetail>(
    `/admin/v2/catalog/products/${id}/publish/`,
    { publish },
  );
  return response.data;
};

export const createVariant = async (payload: Partial<AdminVariant>) => {
  const response = await apiClient.post<AdminVariant>(
    "/admin/v2/catalog/variants/",
    payload,
  );
  return response.data;
};

export const updateVariant = async (id: number, payload: Partial<AdminVariant>) => {
  const response = await apiClient.patch<AdminVariant>(
    `/admin/v2/catalog/variants/${id}/`,
    payload,
  );
  return response.data;
};

export const deleteVariant = async (id: number) => {
  await apiClient.delete(`/admin/v2/catalog/variants/${id}/`);
};

export const updateMedia = async (id: number, payload: Partial<AdminMedia>) => {
  const response = await apiClient.patch<AdminMedia>(
    `/admin/v2/catalog/media/${id}/`,
    payload,
  );
  return response.data;
};

export const deleteMedia = async (id: number) => {
  await apiClient.delete(`/admin/v2/catalog/media/${id}/`);
};

export const fetchAdminBrands = async () => {
  const response = await apiClient.get<AdminBrand[]>("/admin/v2/catalog/brands/");
  return response.data;
};

export const createBrand = async (payload: Partial<AdminBrand>) => {
  const response = await apiClient.post<AdminBrand>("/admin/v2/catalog/brands/", payload);
  return response.data;
};

export const fetchAdminGoals = async () => {
  const response = await apiClient.get<AdminGoal[]>("/admin/v2/catalog/goals/");
  return response.data;
};

export const fetchAdminCategoriesV2 = async () => {
  const response = await apiClient.get<AdminCategoryRow[]>(
    "/admin/v2/catalog/categories/",
  );
  return response.data;
};
