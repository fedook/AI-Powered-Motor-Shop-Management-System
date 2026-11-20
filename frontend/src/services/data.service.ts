import { api } from "./api";
import type {
  ApiSuccess,
  AuditLog,
  BusinessWorkflow,
  Category,
  DatasetVerification,
  DescriptiveAnalytics,
  PredictiveAnalytics,
  PrescriptiveAnalytics,
  Customer,
  DashboardData,
  InventoryMovement,
  InventoryRow,
  PaginationMeta,
  Product,
  ProductAnalytics,
  Sale,
  SalesAnalytics,
  User,
} from "../types";

export interface ListResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ProductListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  lowStock?: boolean;
  sort?: string;
}

export async function getDashboard(): Promise<DashboardData> {
  const res = await api.get<ApiSuccess<DashboardData>>("/analytics/dashboard");
  return res.data.data;
}

export async function getSalesAnalytics(params: {
  from?: string;
  to?: string;
  days?: number;
  groupBy?: "day" | "week" | "month";
}): Promise<SalesAnalytics> {
  const res = await api.get<ApiSuccess<SalesAnalytics>>("/analytics/sales", { params });
  return res.data.data;
}

export async function getProductAnalytics(params: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<ProductAnalytics> {
  const res = await api.get<ApiSuccess<ProductAnalytics>>("/analytics/products", { params });
  return res.data.data;
}

export interface BaFilters {
  from?: string;
  to?: string;
  days?: number;
  groupBy?: "day" | "week" | "month" | "year";
  productId?: string;
  categoryId?: string;
  horizon?: 7 | 30 | 90;
}

export async function getDatasetCounts(): Promise<DatasetVerification> {
  const res = await api.get<ApiSuccess<DatasetVerification>>("/analytics/datasets");
  return res.data.data;
}

export async function getDescriptiveAnalytics(params: BaFilters): Promise<DescriptiveAnalytics> {
  const res = await api.get<ApiSuccess<DescriptiveAnalytics>>("/analytics/descriptive", { params });
  return res.data.data;
}

export async function getPredictiveAnalytics(params: BaFilters): Promise<PredictiveAnalytics> {
  const res = await api.get<ApiSuccess<PredictiveAnalytics>>("/analytics/predictive", { params });
  return res.data.data;
}

export async function getPrescriptiveAnalytics(params: BaFilters): Promise<PrescriptiveAnalytics> {
  const res = await api.get<ApiSuccess<PrescriptiveAnalytics>>("/analytics/prescriptive", { params });
  return res.data.data;
}

export async function getBusinessWorkflow(params: BaFilters): Promise<BusinessWorkflow> {
  const res = await api.get<ApiSuccess<BusinessWorkflow>>("/analytics/workflow", { params });
  return res.data.data;
}

export async function updateRecommendationStatus(
  key: string,
  status: "pending" | "accepted" | "rejected" | "completed",
  note?: string,
): Promise<{ key: string; status: string; message: string }> {
  const res = await api.patch<ApiSuccess<{ key: string; status: string; message: string }>>(
    `/analytics/recommendations/${encodeURIComponent(key)}/status`,
    { status, note },
  );
  return res.data.data;
}

export async function listProducts(params: ProductListParams): Promise<ListResponse<Product>> {
  const res = await api.get<ApiSuccess<Product[]>>("/products", {
    params: { ...params, lowStock: params.lowStock ? "true" : undefined },
  });
  return { data: res.data.data, meta: res.data.meta! };
}

export async function getProduct(id: string): Promise<Product> {
  const res = await api.get<ApiSuccess<Product>>(`/products/${id}`);
  return res.data.data;
}

export async function createProduct(input: Record<string, unknown>): Promise<Product> {
  const res = await api.post<ApiSuccess<Product>>("/products", input);
  return res.data.data;
}

export async function updateProduct(id: string, input: Record<string, unknown>): Promise<Product> {
  const res = await api.put<ApiSuccess<Product>>(`/products/${id}`, input);
  return res.data.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`/products/${id}`);
}

export async function listCategories(): Promise<Category[]> {
  const res = await api.get<ApiSuccess<Category[]>>("/categories");
  return res.data.data;
}

export async function createCategory(input: { name: string; description?: string | null }): Promise<Category> {
  const res = await api.post<ApiSuccess<Category>>("/categories", input);
  return res.data.data;
}

export async function updateCategory(
  id: string,
  input: { name?: string; description?: string | null },
): Promise<Category> {
  const res = await api.put<ApiSuccess<Category>>(`/categories/${id}`, input);
  return res.data.data;
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/categories/${id}`);
}

export async function listCustomers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<ListResponse<Customer>> {
  const res = await api.get<ApiSuccess<Customer[]>>("/customers", { params });
  return { data: res.data.data, meta: res.data.meta! };
}

export async function getCustomer(id: string): Promise<Customer> {
  const res = await api.get<ApiSuccess<Customer>>(`/customers/${id}`);
  return res.data.data;
}

export async function createCustomer(input: {
  fullName: string;
  email?: string | null;
  contactNumber?: string | null;
  address?: string | null;
}): Promise<Customer> {
  const res = await api.post<ApiSuccess<Customer>>("/customers", input);
  return res.data.data;
}

export async function updateCustomer(
  id: string,
  input: { fullName?: string; email?: string | null; contactNumber?: string | null; address?: string | null },
): Promise<Customer> {
  const res = await api.put<ApiSuccess<Customer>>(`/customers/${id}`, input);
  return res.data.data;
}

export async function deleteCustomer(id: string): Promise<void> {
  await api.delete(`/customers/${id}`);
}

export async function listInventory(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  lowStock?: boolean;
}): Promise<ListResponse<InventoryRow> & { summary?: Record<string, number> }> {
  const res = await api.get<ApiSuccess<InventoryRow[]>>("/inventory", {
    params: { ...params, lowStock: params.lowStock ? "true" : undefined },
  });
  return { data: res.data.data, meta: res.data.meta!, summary: res.data.meta?.summary as Record<string, number> | undefined };
}

export async function listInventoryMovements(params: {
  page?: number;
  pageSize?: number;
  productId?: string;
  movementType?: string;
  from?: string;
  to?: string;
}): Promise<ListResponse<InventoryMovement>> {
  const res = await api.get<ApiSuccess<InventoryMovement[]>>("/inventory/movements", { params });
  return { data: res.data.data, meta: res.data.meta! };
}

export async function createInventoryMovement(input: {
  productId: string;
  movementType: "stock_in" | "stock_out" | "adjustment";
  quantity?: number;
  newQuantity?: number;
  reason: string;
}): Promise<unknown> {
  const res = await api.post<ApiSuccess<unknown>>("/inventory/movements", input);
  return res.data.data;
}

export async function listSales(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  paymentMethod?: string;
  cashierId?: string;
  from?: string;
  to?: string;
}): Promise<ListResponse<Sale>> {
  const res = await api.get<ApiSuccess<Sale[]>>("/sales", { params });
  return { data: res.data.data, meta: res.data.meta! };
}

export async function getSale(id: string): Promise<Sale> {
  const res = await api.get<ApiSuccess<Sale>>(`/sales/${id}`);
  return res.data.data;
}

export async function createSale(input: {
  customerId?: string | null;
  items: Array<{ productId: string; quantity: number }>;
  discount?: number;
  paymentMethod: "cash" | "gcash" | "bank_transfer" | "other";
  amountPaid: number;
  idempotencyKey?: string;
}): Promise<Sale> {
  const res = await api.post<ApiSuccess<Sale>>("/sales", input, {
    headers: input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : undefined,
  });
  return res.data.data;
}

export async function cancelSale(id: string, reason: string): Promise<Sale> {
  const res = await api.post<ApiSuccess<Sale>>(`/sales/${id}/cancel`, { reason });
  return res.data.data;
}

export async function listUsers(params: {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
}): Promise<ListResponse<User>> {
  const res = await api.get<ApiSuccess<User[]>>("/users", { params });
  return { data: res.data.data, meta: res.data.meta! };
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: "admin" | "staff";
}): Promise<User> {
  const res = await api.post<ApiSuccess<User>>("/users", input);
  return res.data.data;
}

export async function updateUser(
  id: string,
  input: { name?: string; email?: string; role?: "admin" | "staff" },
): Promise<User> {
  const res = await api.put<ApiSuccess<User>>(`/users/${id}`, input);
  return res.data.data;
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`/users/${id}`);
}

export async function listAuditLogs(params: {
  page?: number;
  pageSize?: number;
  action?: string;
  entityType?: string;
  userId?: string;
  from?: string;
  to?: string;
}): Promise<ListResponse<AuditLog>> {
  const res = await api.get<ApiSuccess<AuditLog[]>>("/audit-logs", { params });
  return { data: res.data.data, meta: res.data.meta! };
}

export async function aiChat(input: {
  message: string;
  conversationId?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const res = await api.post<ApiSuccess<import("../types").AiChatResponse>>("/ai/chat", input, { timeout: 45000 });
  return res.data.data;
}

export async function aiInsights(input: {
  focus?: "general" | "sales" | "inventory" | "profitability";
  conversationId?: string;
}) {
  const res = await api.post<ApiSuccess<import("../types").AiChatResponse>>("/ai/business-insights", input, { timeout: 45000 });
  return res.data.data;
}

export async function listAiConversations(): Promise<import("../types").AiConversationSummary[]> {
  const res = await api.get<ApiSuccess<import("../types").AiConversationSummary[]>>("/ai/conversations");
  return res.data.data;
}

export async function createAiConversation(title?: string): Promise<import("../types").AiConversationSummary> {
  const res = await api.post<ApiSuccess<import("../types").AiConversationSummary>>(
    "/ai/conversations",
    title ? { title } : {},
  );
  return res.data.data;
}

export async function getAiConversation(id: string): Promise<import("../types").AiConversationDetail> {
  const res = await api.get<ApiSuccess<import("../types").AiConversationDetail>>(
    `/ai/conversations/${id}`,
  );
  return res.data.data;
}

export async function deleteAiConversation(id: string): Promise<void> {
  await api.delete(`/ai/conversations/${id}`);
}

export async function getHealth(): Promise<Record<string, unknown>> {
  const res = await api.get("/health");
  return res.data;
}

export async function getAiStatus(options?: { refresh?: boolean }): Promise<import("../types").AiStatus> {
  const res = await api.get<ApiSuccess<import("../types").AiStatus>>("/ai/status", {
    timeout: 20000,
    params: options?.refresh ? { refresh: "1" } : undefined,
  });
  return res.data.data;
}
