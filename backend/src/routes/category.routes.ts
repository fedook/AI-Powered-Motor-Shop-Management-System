import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  createCategorySchema,
  productIdParamSchema,
  updateCategorySchema,
} from "../validators/product.validator";
import * as productController from "../controllers/product.controller";

export const categoryRouter = Router();

categoryRouter.use(requireAuth);

categoryRouter.get("/", requirePermission("categories:read"), productController.listCategories);
categoryRouter.post(
  "/",
  requirePermission("categories:write"),
  validate({ body: createCategorySchema }),
  productController.createCategory,
);
categoryRouter.put(
  "/:id",
  requirePermission("categories:write"),
  validate({ params: productIdParamSchema, body: updateCategorySchema }),
  productController.updateCategory,
);
categoryRouter.delete(
  "/:id",
  requirePermission("categories:write"),
  validate({ params: productIdParamSchema }),
  productController.removeCategory,
);
