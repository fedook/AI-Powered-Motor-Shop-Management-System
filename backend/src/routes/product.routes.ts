import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdParamSchema,
  updateProductSchema,
} from "../validators/product.validator";
import * as productController from "../controllers/product.controller";

export const productRouter = Router();

productRouter.use(requireAuth);

productRouter.get(
  "/",
  requirePermission("products:read"),
  validate({ query: listProductsQuerySchema }),
  productController.list,
);
productRouter.get(
  "/:id",
  requirePermission("products:read"),
  validate({ params: productIdParamSchema }),
  productController.getById,
);
productRouter.post(
  "/",
  requirePermission("products:write"),
  validate({ body: createProductSchema }),
  productController.create,
);
productRouter.put(
  "/:id",
  requirePermission("products:write"),
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  productController.update,
);
productRouter.delete(
  "/:id",
  requirePermission("products:write"),
  validate({ params: productIdParamSchema }),
  productController.remove,
);
