import type { Request, Response } from "express";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/http";
import { clearAuthCookies, issueAuthCookies, refreshCsrfCookie } from "../utils/cookies";
import { AUDIT_ACTIONS } from "../config/constants";
import { recordAudit } from "../services/audit.service";
import * as authService from "../services/auth.service";

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body, req);
  const csrfToken = issueAuthCookies(res, result.token);
  sendSuccess(res, { user: result.user, csrfToken }, undefined, 201);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body, req);
  const csrfToken = issueAuthCookies(res, result.token);
  sendSuccess(res, { user: result.user, csrfToken });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  clearAuthCookies(res);
  if (req.user) {
    await recordAudit({
      userId: req.user.id,
      action: AUDIT_ACTIONS.LOGOUT,
      entityType: "auth",
      entityId: req.user.id,
      request: req,
    });
  }
  sendSuccess(res, { message: "Signed out successfully." });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getProfile(req.user!.id);
  sendSuccess(res, { user });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.updateProfile(req.user!.id, req.body, req);
  sendSuccess(res, { user });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.changePassword(req.user!.id, req.body, req);
  const csrfToken = issueAuthCookies(res, result.token);
  sendSuccess(res, {
    user: result.user,
    csrfToken,
    message: "Password updated. Other sessions have been signed out.",
  });
});

export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  await authService.revokeAllSessions(req.user!.id, req);
  clearAuthCookies(res);
  sendSuccess(res, { message: "All sessions have been signed out." });
});

export const csrf = asyncHandler(async (_req: Request, res: Response) => {
  const csrfToken = refreshCsrfCookie(res);
  sendSuccess(res, { csrfToken });
});
