import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  cancelSaleSchema,
  createSaleSchema,
  listSalesQuerySchema,
  saleIdParamSchema,
} from "../validators/sale.validator";
import * as salesController from "../controllers/sales.controller";

export const salesRouter = Router();

salesRouter.use(requireAuth);

salesRouter.get(
  "/",
  requirePermission("sales:read"),
  validate({ query: listSalesQuerySchema }),
  salesController.list,
);
salesRouter.get(
  "/:id",
  requirePermission("sales:read"),
  validate({ params: saleIdParamSchema }),
  salesController.getById,
);
salesRouter.post(
  "/",
  requirePermission("sales:create"),
  validate({ body: createSaleSchema }),
  salesController.create,
);
salesRouter.post(
  "/:id/cancel",
  requirePermission("sales:cancel"),
  validate({ params: saleIdParamSchema, body: cancelSaleSchema }),
  salesController.cancel,
);
