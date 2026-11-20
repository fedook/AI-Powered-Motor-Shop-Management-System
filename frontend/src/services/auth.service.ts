import { api } from "./api";
import type { ApiSuccess, User } from "../types";

export interface AuthPayload {
  user: User;
  csrfToken: string;
}

export async function login(email: string, password: string): Promise<AuthPayload> {
  const res = await api.post<ApiSuccess<AuthPayload>>("/auth/login", { email, password });
  return res.data.data;
}

export async function register(name: string, email: string, password: string): Promise<AuthPayload> {
  const res = await api.post<ApiSuccess<AuthPayload>>("/auth/register", { name, email, password });
  return res.data.data;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function me(): Promise<{ user: User; csrfToken?: string }> {
  // /auth/me returns user; fetch csrf separately to enable state-changing calls after refresh.
  const [meRes, csrfRes] = await Promise.all([
    api.get<ApiSuccess<{ user: User }>>("/auth/me"),
    api.get<ApiSuccess<{ csrfToken: string }>>("/auth/csrf").catch(() => null),
  ]);
  return { user: meRes.data.data.user, csrfToken: csrfRes?.data.data.csrfToken };
}

export async function updateProfile(input: { name?: string; email?: string }): Promise<User> {
  const res = await api.put<ApiSuccess<{ user: User }>>("/auth/profile", input);
  return res.data.data.user;
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<AuthPayload & { message?: string }> {
  const res = await api.put<ApiSuccess<AuthPayload & { message?: string }>>("/auth/password", input);
  return res.data.data;
}
