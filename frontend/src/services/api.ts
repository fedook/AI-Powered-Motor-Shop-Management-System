import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";
import type { ApiErrorPayload } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:7000/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 25000,
  headers: {
    Accept: "application/json",
  },
});

let csrfToken: string | null = null;
let csrfRefresh: Promise<string | null> | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export class ApiRequestError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
  requestId?: string;

  constructor(message: string, options?: Partial<ApiRequestError>) {
    super(message);
    this.name = "ApiRequestError";
    Object.assign(this, options);
  }
}

function toApiError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorPayload>;
    const payload = axiosError.response?.data;
    if (!axiosError.response) {
      return new ApiRequestError(
        "Unable to reach the server. Check that the backend is running and try again.",
        { code: "NETWORK_ERROR" },
      );
    }
    return new ApiRequestError(payload?.error?.message || axiosError.message || "Request failed.", {
      status: axiosError.response.status,
      code: payload?.error?.code,
      details: payload?.error?.details,
      requestId: payload?.requestId,
    });
  }
  if (error instanceof Error) return new ApiRequestError(error.message);
  return new ApiRequestError("Unexpected error.");
}

const MUTATING = new Set(["post", "put", "patch", "delete"]);

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const method = (config.method || "get").toLowerCase();
  if (MUTATING.has(method) && csrfToken) {
    config.headers.set("X-CSRF-Token", csrfToken);
  }
  return config;
});

async function refreshCsrf(): Promise<string | null> {
  if (csrfRefresh) return csrfRefresh;
  csrfRefresh = api
    .get<{ success: true; data: { csrfToken: string } }>("/auth/csrf")
    .then((res) => {
      csrfToken = res.data.data.csrfToken;
      return csrfToken;
    })
    .catch(() => null)
    .finally(() => {
      csrfRefresh = null;
    });
  return csrfRefresh;
}

type RetryableConfig = AxiosRequestConfig & { _retry?: boolean; _csrfRetry?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorPayload>) => {
    const config = (error.config || {}) as RetryableConfig;
    const code = error.response?.data?.error?.code;
    const status = error.response?.status;
    const method = (config.method || "get").toLowerCase();

    // If a cookie-authenticated mutating request failed CSRF validation, refresh once.
    if (
      status === 403 &&
      code === "CSRF_VALIDATION_FAILED" &&
      MUTATING.has(method) &&
      !config._csrfRetry
    ) {
      config._csrfRetry = true;
      const token = await refreshCsrf();
      if (token) {
        config.headers = { ...(config.headers || {}), "X-CSRF-Token": token };
        return api.request(config);
      }
    }

    return Promise.reject(toApiError(error));
  },
);

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await api.request<T>(config);
  return response.data;
}
