import type { Request, Response } from "express";
import type { z } from "zod";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/http";
import * as inventoryService from "../services/inventory.service";
import type {
  createMovementSchema,
  listInventoryQuerySchema,
  listMovementsQuerySchema,
} from "../validators/inventory.validator";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof listInventoryQuerySchema>;
  const result = await inventoryService.listInventory({ ...query, role: req.user!.role });
  sendSuccess(res, result.data, { ...result.meta, summary: result.summary });
});

export const movements = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof listMovementsQuerySchema>;
  const result = await inventoryService.listMovements(query);
  sendSuccess(res, result.data, result.meta);
});

export const createMovement = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof createMovementSchema>;
  const result = await inventoryService.createMovement(input, req.user!.id, req);
  sendSuccess(res, result, undefined, 201);
});

export const summary = asyncHandler(async (req: Request, res: Response) => {
  const result = await inventoryService.getInventorySummary(req.user!.role);
  sendSuccess(res, result);
});
