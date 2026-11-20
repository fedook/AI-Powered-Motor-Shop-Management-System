export const APP_NAME = "Motor Shop Management System";
export const API_PREFIX = "/api";
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const ROLES = ["admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const PAYMENT_METHODS = ["cash", "gcash", "bank_transfer", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PRODUCT_SORTS = [
  "name_asc",
  "name_desc",
  "price_asc",
  "price_desc",
  "stock_asc",
  "stock_desc",
  "created_desc",
] as const;

export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  REGISTER: "REGISTER",
  PROFILE_UPDATE: "PROFILE_UPDATE",
  PASSWORD_CHANGE: "PASSWORD_CHANGE",
  USER_CREATE: "USER_CREATE",
  USER_UPDATE: "USER_UPDATE",
  USER_DELETE: "USER_DELETE",
  PRODUCT_CREATE: "PRODUCT_CREATE",
  PRODUCT_UPDATE: "PRODUCT_UPDATE",
  PRODUCT_DELETE: "PRODUCT_DELETE",
  CATEGORY_CREATE: "CATEGORY_CREATE",
  CATEGORY_UPDATE: "CATEGORY_UPDATE",
  CATEGORY_DELETE: "CATEGORY_DELETE",
  CUSTOMER_CREATE: "CUSTOMER_CREATE",
  CUSTOMER_UPDATE: "CUSTOMER_UPDATE",
  CUSTOMER_DELETE: "CUSTOMER_DELETE",
  CUSTOMER_VIEW: "CUSTOMER_VIEW",
  SALE_CREATE: "SALE_CREATE",
  SALE_CANCEL: "SALE_CANCEL",
  INVENTORY_MOVEMENT: "INVENTORY_MOVEMENT",
  BA_RECOMMENDATION_STATUS: "BA_RECOMMENDATION_STATUS",
  AI_QUERY: "AI_QUERY",
  AI_INSIGHTS: "AI_INSIGHTS",
  AI_POLICY_BLOCK: "AI_POLICY_BLOCK",
  AUTHORIZATION_DENIED: "AUTHORIZATION_DENIED",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Central permission catalogue. Every protected route maps to exactly one
 * permission and every role maps to an explicit allow-list. Adding a route
 * without adding it here is a review failure, not an implicit allow.
 */
export const PERMISSIONS = [
  "analytics:dashboard",
  "analytics:datasets",
  "analytics:sales",
  "analytics:products",
  "analytics:descriptive",
  "analytics:predictive",
  "analytics:prescriptive",
  "analytics:workflow",
  "products:read",
  "products:write",
  "categories:read",
  "categories:write",
  "inventory:read",
  "inventory:write",
  "customers:read",
  "customers:write",
  "customers:delete",
  "sales:read",
  "sales:create",
  "sales:cancel",
  "users:manage",
  "audit:read",
  "ai:chat",
  "ai:insights",
  "ai:status",
  "ai:conversations",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ADMIN_ONLY_PERMISSIONS: readonly Permission[] = [
  "analytics:sales",
  "analytics:products",
  "analytics:descriptive",
  "analytics:predictive",
  "analytics:prescriptive",
  "analytics:workflow",
  "products:write",
  "categories:write",
  "inventory:write",
  "customers:delete",
  "sales:cancel",
  "users:manage",
  "audit:read",
  "ai:insights",
];

const STAFF_PERMISSIONS: readonly Permission[] = [
  "analytics:dashboard",
  "analytics:datasets",
  "products:read",
  "categories:read",
  "inventory:read",
  "customers:read",
  "customers:write",
  "sales:read",
  "sales:create",
  "ai:chat",
  "ai:status",
  "ai:conversations",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  staff: STAFF_PERMISSIONS,
};
