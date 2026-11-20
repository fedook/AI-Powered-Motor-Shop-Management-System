export type Role = "admin" | "staff";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
  productCount?: number;
}

export interface Product {
  id: string;
  categoryId: string;
  category?: { id: string; name: string };
  name: string;
  sku: string;
  description?: string | null;
  purchasePrice?: number;
  sellingPrice: number;
  stockQuantity: number;
  minimumStock: number;
  isLowStock?: boolean;
  imageUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Customer {
  id: string;
  fullName: string;
  email?: string | null;
  contactNumber?: string | null;
  address?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Staff receive the basic profile only; financial history is withheld. */
  restrictedFinancials?: boolean;
  stats?: {
    purchaseCount: number;
    totalSpent: number;
    lastPurchaseAt: string | null;
  };
  recentPurchases?: Array<{
    id: string;
    transactionNumber: string;
    totalAmount: number;
    status: string;
    paymentMethod: string;
    createdAt: string;
  }>;
}

export interface SaleItem {
  id?: string;
  productId: string;
  productName?: string;
  sku?: string;
  quantity: number;
  unitPrice?: number;
  costPrice?: number;
  subtotal?: number;
}

export interface Sale {
  id: string;
  transactionNumber: string;
  customerId?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  customerContact?: string | null;
  cashierId?: string;
  cashierName?: string;
  subtotal: number;
  discount: number;
  totalAmount: number;
  paymentMethod: "cash" | "gcash" | "bank_transfer" | "other";
  amountPaid: number;
  changeAmount: number;
  status: "completed" | "cancelled";
  createdAt: string;
  itemCount?: number;
  items?: SaleItem[];
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancellationReason?: string | null;
  replayed?: boolean;
}

export interface InventoryRow {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  purchasePrice?: number;
  sellingPrice: number;
  stockQuantity: number;
  minimumStock: number;
  retailValue?: number;
  isLowStock?: boolean;
  stockStatus?: "in_stock" | "low_stock" | "out_of_stock";
  updatedAt?: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  userId?: string | null;
  userName?: string | null;
  movementType: "stock_in" | "stock_out" | "adjustment" | "sale" | "sale_cancellation";
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  requestId?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

export interface DashboardData {
  role?: Role;
  stats: {
    totalProducts: number;
    totalCustomers: number;
    /** Administrator-only business-wide totals. */
    totalSales?: number;
    totalRevenue?: number;
    revenueToday?: number;
    lowStockCount: number;
    outOfStockCount: number;
    cancelledSales: number;
    /** Staff-only personal counters. */
    mySalesTotal?: number;
    mySalesToday?: number;
  };
  inventory: {
    skuCount: number;
    unitsOnHand: number;
    /** Administrator-only inventory valuation. */
    retailValue?: number;
    costValue?: number;
    lowStockCount: number;
    outOfStockCount: number;
  };
  recentTransactions: Array<{
    id: string;
    transactionNumber: string;
    customerName: string;
    cashierName: string;
    totalAmount: number;
    paymentMethod: string;
    status: string;
    createdAt: string;
  }>;
  bestSellers: Array<{
    id: string;
    name: string;
    sku: string;
    unitsSold: number;
    /** Administrator-only revenue figure. */
    revenue?: number;
  }>;
  monthlySales: Array<{ month: string; label: string; revenue: number; sales: number }>;
  lowStockProducts: Array<{
    id: string;
    name: string;
    sku: string;
    stockQuantity: number;
    minimumStock: number;
    categoryName: string;
  }>;
  categoryMix: Array<{
    category: string;
    units: number;
    /** Administrator-only retail valuation. */
    retailValue?: number;
  }>;
}

export interface SalesAnalytics {
  range: { from: string; to: string };
  groupBy: "day" | "week" | "month";
  summary: {
    transactions: number;
    revenue: number;
    discounts: number;
    averageSale: number;
    unitsSold: number;
    previousRevenue: number;
    revenueChangePercent: number;
  };
  series: Array<{ bucket: string; revenue: number; sales: number }>;
  paymentMix: Array<{ method: string; sales: number; revenue: number }>;
  topProducts: Array<{ id: string; name: string; sku: string; unitsSold: number; revenue: number }>;
  statusMix: Array<{ status: string; total: number }>;
  profit?: number;
}

export interface ProductAnalytics {
  range: { from: string; to: string };
  summary: {
    unitsSold: number;
    revenue: number;
    costOfGoodsSold?: number;
    grossProfit?: number;
  };
  topSellers: Array<{
    id: string;
    name: string;
    sku: string;
    category: string;
    unitsSold: number;
    revenue: number;
    stockQuantity: number;
  }>;
  leastSellers: Array<{
    id: string;
    name: string;
    sku: string;
    category: string;
    unitsSold: number;
    revenue: number;
    stockQuantity: number;
  }>;
  slowMoving: Array<{
    id: string;
    name: string;
    sku: string;
    category: string;
    stockQuantity: number;
    retailValue: number;
    lastSoldAt: string | null;
  }>;
  lowStock: Array<{
    id: string;
    name: string;
    sku: string;
    category: string;
    stockQuantity: number;
    minimumStock: number;
    sellingPrice: number;
  }>;
  categoryValuation: Array<{
    category: string;
    skuCount: number;
    units: number;
    retailValue: number;
    costValue?: number;
  }>;
}

export type AiMetricTone = "neutral" | "info" | "positive" | "warning" | "critical";

export interface AiResponseMetric {
  key: string;
  label: string;
  value: number;
  format: "currency" | "number";
  tone: AiMetricTone;
  status: string;
}

export interface AiResponseMetrics {
  scope: "last30days";
  from?: string;
  to?: string;
  generatedAt: string;
  items: AiResponseMetric[];
}

export interface AiChatResponse {
  answer?: string;
  insights?: string;
  recommendations?: string[];
  facts?: Record<string, unknown>;
  alerts?: Array<{ severity: string; area: string; message: string; figures?: Record<string, unknown> }>;
  metrics?: AiResponseMetrics;
  dataAsOf?: string;
  conversationId?: string;
  mode?: "general" | "business";
  dataScope?: "business" | "operational" | "general" | "policy";
  ai: {
    available: boolean;
    model?: string;
    generatedAt?: string;
    readOnly?: boolean;
    reason?: string;
    provider?: string;
    configured?: boolean;
    mode?: "general" | "business";
  };
}

export interface AiConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface AiStoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface AiConversationDetail extends AiConversationSummary {
  messages: AiStoredMessage[];
}

export interface AiStatus {
  provider?: string;
  configured: boolean;
  providerReachable?: boolean | null;
  model?: string;
  checkedAt: string;
  note?: string;
  errorCode?: string;
}

/* ---------------------------- Business Analytics ---------------------------- */

export interface DatasetVerification {
  generatedAt: string;
  minimumRequired: number;
  datasets: Array<{
    name: string;
    table: string;
    count: number;
    distinct: number;
    meetsMinimum: boolean;
    status: "PASS" | "FAIL";
  }>;
  integrity: {
    completedSales: number;
    cancelledSales: number;
    firstSaleAt: string | null;
    lastSaleAt: string | null;
  };
  note: string;
}

export interface BaSeriesPoint {
  bucket: string;
  revenue: number;
  sales: number;
  units: number;
}

export interface BaProductRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  unitsSold: number;
  revenue: number;
  costOfGoodsSold?: number;
  stockQuantity: number;
  minimumStock?: number;
  activeDays?: number;
  lastSoldAt?: string | null;
  recent30DayUnits?: number;
  prior30DayUnits?: number;
  rank?: number;
}

export interface DescriptiveAnalytics {
  generatedAt: string;
  range: { from: string; to: string };
  historicalDays: number;
  sales: {
    totalSalesRevenue: number;
    totalTransactions: number;
    totalUnitsSold: number;
    grossSales: number;
    discounts: number;
    averageOrderValue: number;
    previousPeriodRevenue: number;
    revenueGrowthPercent: number;
    salesTrend: "increasing" | "decreasing" | "stable";
    cancelledTransactions: number;
    series: {
      daily: BaSeriesPoint[];
      weekly: BaSeriesPoint[];
      monthly: BaSeriesPoint[];
      yearly: BaSeriesPoint[];
    };
    paymentMix: Array<{ method: string; transactions: number; revenue: number }>;
  };
  products: {
    totalProducts: number;
    bestSelling: BaProductRow[];
    leastSelling: BaProductRow[];
    highestRevenue: BaProductRow[];
    lowestRevenue: BaProductRow[];
    rankings: BaProductRow[];
  };
  customers: {
    totalCustomers: number;
    purchasingCustomers: number;
    averageCustomerSpending: number;
    averagePurchasingCustomerSpending: number;
    frequencyBuckets: Array<{ label: string; customers: number }>;
    topCustomers: Array<{
      id: string;
      name: string;
      purchases: number;
      totalSpent: number;
      averageSpend: number;
      lastPurchaseAt: string | null;
    }>;
  };
  inventory: {
    skuCount: number;
    unitsOnHand: number;
    lowStockCount: number;
    outOfStockCount: number;
    lowStock: BaProductRow[];
    outOfStock: BaProductRow[];
    fastMoving: BaProductRow[];
    slowMoving: BaProductRow[];
    movementSummary: Array<{ movement_type: string; total: number; units: number; last_at: string | null }>;
    movementHistory: Array<{
      id: string;
      product_name: string;
      sku: string;
      movement_type: string;
      quantity: number;
      previous_quantity: number;
      new_quantity: number;
      reason: string;
      created_at: string;
      createdAt: string;
    }>;
  };
  financial: {
    netRevenue: number;
    grossSales: number;
    discounts: number;
    costOfGoodsSold: number;
    grossProfit: number;
    grossProfitMarginPercent: number;
    averageTransactionValue: number;
    basis: string;
  };
}

export interface SalesForecastPeriod {
  horizonDays: number;
  supported: boolean;
  method: string;
  methodDescription: string;
  historicalPeriod: { from: string; to: string };
  historicalDays: number;
  activeDays: number;
  sufficientData: boolean;
  reason?: string;
  expectedRevenue: number;
  expectedTransactions: number;
  limitations: string[];
}

export interface ProductForecastRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  historicalQuantity: number;
  historicalRevenue?: number;
  predictedQuantity: number | null;
  expectedDemandTrend: "increasing" | "decreasing" | "stable" | "unknown";
  averageDailyDemand?: number | null;
  daysUntilDepletion?: number | null;
  stockoutRisk?: "critical" | "high" | "medium" | "low" | "unknown";
  suggestedReorderQuantity?: number;
  currentStock?: number;
  minimumStock?: number;
  purchasePrice?: number;
  sufficientData: boolean;
  reason?: string;
}

export interface PredictiveAnalytics {
  generatedAt: string;
  range: { from: string; to: string };
  methodology: {
    sales: string;
    product: string;
    inventory: string;
    estimatesOnly: boolean;
  };
  historicalPeriod: { from: string; to: string };
  historicalDays: number;
  activeSellingDays: number;
  horizonDays: number;
  sales: {
    sufficientData: boolean;
    reason?: string;
    method: string;
    expectedRevenue: number;
    expectedTransactions: number;
    forecast: Array<{ date: string; predictedRevenue: number; predictedTransactions: number }>;
    forecastPeriods: SalesForecastPeriod[];
  };
  productDemand: {
    historicalAndPredicted: Array<{
      id: string;
      name: string;
      sku: string;
      historicalQuantity: number;
      predictedQuantity: number | null;
      expectedDemandTrend: ProductForecastRow["expectedDemandTrend"];
      sufficientData: boolean;
    }>;
    ranking: ProductForecastRow[];
  };
  inventoryRisk: ProductForecastRow[];
  limitations: string[];
}

export interface BaRecommendation {
  key: string;
  type: "restock" | "excess_inventory" | "declining_demand" | "sales_focus" | "business_improvement" | "purchasing_plan";
  title: string;
  relatedTo: string;
  productId: string | null;
  supportingHistoricalData: string;
  predictedResult: string;
  recommendedAction: string;
  reason: string;
  priority: "critical" | "high" | "medium" | "low";
  generatedAt: string;
  status: "pending" | "accepted" | "rejected" | "completed";
  decisionNote?: string | null;
  decidedAt?: string | null;
}

export interface PrescriptiveAnalytics {
  generatedAt: string;
  range: { from: string; to: string };
  horizonDays: number;
  recommendations: BaRecommendation[];
  purchasingSummary: { suggestedUnits: number; estimatedCost: number; basis: string };
  requiresHumanApproval: boolean;
  basis: { descriptiveRange: { from: string; to: string }; forecastPeriod: string; note: string };
}

export interface WorkflowStep {
  id: string;
  step: number;
  stage: "descriptive" | "predictive" | "prescriptive";
  title: string;
  question: string;
  finding: Record<string, unknown> | null;
  inputFromPreviousStep?: string;
  outputToNextStep?: string;
  note?: string | null;
}

export interface BusinessWorkflow {
  generatedAt: string;
  range: { from: string; to: string };
  sufficientData: boolean;
  message?: string;
  forecastPeriodDays?: number;
  focusProduct?: { id: string; name: string; sku: string; category: string; currentStock: number };
  availableProducts: Array<{
    id: string;
    name: string;
    sku: string;
    predictedQuantity: number | null;
    stockoutRisk?: string;
  }>;
  chain?: WorkflowStep[];
  contextSummary?: {
    totalRevenue: number;
    totalTransactions: number;
    totalProducts: number;
    totalCustomers: number;
    historicalSnapshotRows: { sales: number; productRows: number };
  };
}
