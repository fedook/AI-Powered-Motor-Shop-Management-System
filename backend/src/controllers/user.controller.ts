import type { Request, Response } from "express";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/http";
import * as userService from "../services/user.service";
import type { z } from "zod";
import type {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from "../validators/user.validator";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof listUsersQuerySchema>;
  const result = await userService.listUsers(query);
  sendSuccess(res, result.data, result.meta);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof createUserSchema>;
  const user = await userService.createUser(input, req.user!.id, req);
  sendSuccess(res, user, undefined, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof updateUserSchema>;
  const user = await userService.updateUser(req.params.id!, input, req.user!.id, req);
  sendSuccess(res, user);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await userService.deleteUser(req.params.id!, req.user!.id, req);
  sendSuccess(res, { message: "User deleted." });
});
