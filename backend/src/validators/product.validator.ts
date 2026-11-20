import { z } from "zod";
import { uuidSchema } from "./common";

const priceSchema = z.coerce
  .number()
  .min(0, "Price cannot be negative.")
  .max(99_999_999, "Price is too large.");

const imageUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine(
    (value) => value === "" || /^https?:\/\/.+/i.test(value),
    "Image URL must start with http:// or https://",
  )
  .optional()
  .transform((value) => (value ? value : null));

export const createProductSchema = z.object({
  categoryId: uuidSchema,
  name: z.string().trim().min(2, "Product name must be at least 2 characters.").max(200),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9][A-Z0-9_-]{1,49}$/,
      "SKU must be 2-50 characters using letters, numbers, dashes or underscores.",
    ),
  description: z.string().trim().max(5000).optional().nullable(),
  purchasePrice: priceSchema,
  sellingPrice: priceSchema,
  stockQuantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
  minimumStock: z.coerce.number().int().min(0).max(1_000_000).default(5),
  imageUrl: imageUrlSchema,
});

// Stock is intentionally excluded: all stock changes must go through the
// inventory module so an inventory movement record is always created.
export const updateProductSchema = z
  .object({
    categoryId: uuidSchema.optional(),
    name: z.string().trim().min(2).max(200).optional(),
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{1,49}$/)
      .optional(),
    description: z.string().trim().max(5000).optional().nullable(),
    purchasePrice: priceSchema.optional(),
    sellingPrice: priceSchema.optional(),
    minimumStock: z.coerce.number().int().min(0).max(1_000_000).optional(),
    imageUrl: imageUrlSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().trim().max(120).optional(),
  categoryId: uuidSchema.optional(),
  lowStock: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
  sort: z
    .enum(["name_asc", "name_desc", "price_asc", "price_desc", "stock_asc", "stock_desc", "created_desc"])
    .optional()
    .default("created_desc"),
});

export const productIdParamSchema = z.object({ id: uuidSchema });

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, "Category name must be at least 2 characters.").max(100),
  description: z.string().trim().max(1000).optional().nullable(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(1000).optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  });
