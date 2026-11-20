import type { Request, Response } from "express";
import type { z } from "zod";
import { asyncHandler } from "../utils/async-handler";
import { sendSuccess } from "../utils/http";
import * as productService from "../services/product.service";
import type {
  createCategorySchema,
  createProductSchema,
  listProductsQuerySchema,
  updateCategorySchema,
  updateProductSchema,
} from "../validators/product.validator";

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as z.infer<typeof listProductsQuerySchema>;
  const result = await productService.listProducts({ ...query, role: req.user!.role });
  sendSuccess(res, result.data, result.meta);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const product = await productService.getProduct(req.params.id!, req.user!.role);
  sendSuccess(res, product);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof createProductSchema>;
  const product = await productService.createProduct(input, req.user!.id, req);
  sendSuccess(res, product, undefined, 201);
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof updateProductSchema>;
  const product = await productService.updateProduct(req.params.id!, input, req.user!.id, req);
  sendSuccess(res, product);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await productService.deleteProduct(req.params.id!, req.user!.id, req);
  sendSuccess(res, { message: "Product deleted." });
});

export const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  const categories = await productService.listCategories();
  sendSuccess(res, categories);
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof createCategorySchema>;
  const category = await productService.createCategory(input, req.user!.id, req);
  sendSuccess(res, category, undefined, 201);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof updateCategorySchema>;
  const category = await productService.updateCategory(
    req.params.id!,
    input,
    req.user!.id,
    req,
  );
  sendSuccess(res, category);
});

export const removeCategory = asyncHandler(async (req: Request, res: Response) => {
  await productService.deleteCategory(req.params.id!, req.user!.id, req);
  sendSuccess(res, { message: "Category deleted." });
});
