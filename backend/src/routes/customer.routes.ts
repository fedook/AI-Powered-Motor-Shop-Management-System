import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  createCustomerSchema,
  customerIdParamSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "../validators/customer.validator";
import * as customerController from "../controllers/customer.controller";

export const customerRouter = Router();

customerRouter.use(requireAuth);

customerRouter.get(
  "/",
  requirePermission("customers:read"),
  validate({ query: listCustomersQuerySchema }),
  customerController.list,
);
customerRouter.get(
  "/:id",
  requirePermission("customers:read"),
  validate({ params: customerIdParamSchema }),
  customerController.getById,
);
customerRouter.post(
  "/",
  requirePermission("customers:write"),
  validate({ body: createCustomerSchema }),
  customerController.create,
);
customerRouter.put(
  "/:id",
  requirePermission("customers:write"),
  validate({ params: customerIdParamSchema, body: updateCustomerSchema }),
  customerController.update,
);
customerRouter.delete(
  "/:id",
  requirePermission("customers:delete"),
  validate({ params: customerIdParamSchema }),
  customerController.remove,
);
