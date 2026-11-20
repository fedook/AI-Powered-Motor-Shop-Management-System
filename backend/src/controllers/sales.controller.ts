import type { Request, Response } from "express";
import type { z } from "zod";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/http";
import * as salesService from "../services/sales.service";
import type {
  createSaleSchema,
  listSalesQuerySchema,
} from "../validators/sale.validator";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof listSalesQuerySchema>;
  const result = await salesService.listSales({
    ...query,
    role: req.user!.role,
    actorId: req.user!.id,
  });
  sendSuccess(res, result.data, result.meta);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const sale = await salesService.getSaleById(req.params.id!, {
    id: req.user!.id,
    role: req.user!.role,
  });
  sendSuccess(res, sale);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as z.infer<typeof createSaleSchema>;
  const headerKey = req.headers["idempotency-key"];
  const idempotencyKey =
    body.idempotencyKey ??
    (typeof headerKey === "string" && headerKey.trim().length >= 8 ? headerKey.trim() : undefined);

  const sale = await salesService.createSale(
    { ...body, idempotencyKey },
    { id: req.user!.id, role: req.user!.role },
    req,
  );
  sendSuccess(res, sale, undefined, 201);
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { reason: string };
  const sale = await salesService.cancelSale(
    req.params.id!,
    body.reason,
    { id: req.user!.id, role: "admin" },
    req,
  );
  sendSuccess(res, sale);
});
