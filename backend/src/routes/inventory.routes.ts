import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  createMovementSchema,
  listInventoryQuerySchema,
  listMovementsQuerySchema,
} from "../validators/inventory.validator";
import * as inventoryController from "../controllers/inventory.controller";

export const inventoryRouter = Router();

inventoryRouter.use(requireAuth);

inventoryRouter.get(
  "/",
  requirePermission("inventory:read"),
  validate({ query: listInventoryQuerySchema }),
  inventoryController.list,
);
inventoryRouter.get(
  "/summary",
  requirePermission("inventory:read"),
  inventoryController.summary,
);
inventoryRouter.get(
  "/movements",
  requirePermission("inventory:read"),
  validate({ query: listMovementsQuerySchema }),
  inventoryController.movements,
);
inventoryRouter.post(
  "/movements",
  requirePermission("inventory:write"),
  validate({ body: createMovementSchema }),
  inventoryController.createMovement,
);
