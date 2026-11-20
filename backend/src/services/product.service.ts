import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { Request } from "express";
import { db, withTransaction } from "../db";
import {
  categories,
  inventoryMovements,
  products,
  saleItems,
} from "../db/schema";
import { AUDIT_ACTIONS, type Role } from "../config/constants";
import { ApiError } from "../utils/api-error";
import { escapeLike, paginate } from "../utils/pagination";
import { paginationMeta } from "../utils/http";
import { money } from "../utils/money";
import { recordAudit } from "./audit.service";

const productSelection = {
  id: products.id,
  categoryId: products.categoryId,
  name: products.name,
  sku: products.sku,
  description: products.description,
  purchasePrice: products.purchasePrice,
  sellingPrice: products.sellingPrice,
  stockQuantity: products.stockQuantity,
  minimumStock: products.minimumStock,
  imageUrl: products.imageUrl,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
  categoryName: categories.name,
};

type ProductRow = {
  id: string;
  categoryId: string;
  name: string;
  sku: string;
  description: string | null;
  purchasePrice: string;
  sellingPrice: string;
  stockQuantity: number;
  minimumStock: number;
  imageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  categoryName: string;
};

/**
 * Purchase price (cost) is commercially confidential: admins receive it,
 * staff do not. Selling price and stock are needed to process sales.
 */
export function serializeProduct(row: ProductRow, role: Role) {
  return {
    id: row.id,
    categoryId: row.categoryId,
    category: { id: row.categoryId, name: row.categoryName },
    name: row.name,
    sku: row.sku,
    description: row.description,
    ...(role === "admin" ? { purchasePrice: money(row.purchasePrice) } : {}),
    sellingPrice: money(row.sellingPrice),
    stockQuantity: row.stockQuantity,
    minimumStock: row.minimumStock,
    isLowStock: row.stockQuantity <= row.minimumStock,
    imageUrl: row.imageUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listProducts(input: {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  lowStock?: boolean;
  sort?: string;
  role: Role;
}) {
  const { page, pageSize, offset } = paginate(input);
  const conditions: SQL[] = [];

  if (input.search) {
    const term = `%${escapeLike(input.search)}%`;
    const clause = or(ilike(products.name, term), ilike(products.sku, term));
    if (clause) conditions.push(clause);
  }
  if (input.categoryId) conditions.push(eq(products.categoryId, input.categoryId));
  if (input.lowStock) {
    conditions.push(sql`${products.stockQuantity} <= ${products.minimumStock}`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const orderBy = (() => {
    switch (input.sort) {
      case "name_asc":
        return asc(products.name);
      case "name_desc":
        return desc(products.name);
      case "price_asc":
        return asc(products.sellingPrice);
      case "price_desc":
        return desc(products.sellingPrice);
      case "stock_asc":
        return asc(products.stockQuantity);
      case "stock_desc":
        return desc(products.stockQuantity);
      default:
        return desc(products.createdAt);
    }
  })();

  const [rows, totalRows] = await Promise.all([
    db
      .select(productSelection)
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(products).where(whereClause),
  ]);

  return {
    data: rows.map((row) => serializeProduct(row, input.role)),
    meta: paginationMeta(page, pageSize, Number(totalRows[0]?.total ?? 0)),
  };
}

export async function getProduct(id: string, role: Role) {
  const [row] = await db
    .select(productSelection)
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);

  if (!row) throw ApiError.notFound("Product not found.");
  return serializeProduct(row, role);
}

async function assertCategoryExists(categoryId: string) {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!category) throw ApiError.badRequest("The selected category does not exist.");
}

export async function createProduct(
  input: {
    categoryId: string;
    name: string;
    sku: string;
    description?: string | null;
    purchasePrice: number;
    sellingPrice: number;
    stockQuantity: number;
    minimumStock: number;
    imageUrl?: string | null;
  },
  actorId: string,
  request: Request,
) {
  await assertCategoryExists(input.categoryId);

  const productId = await withTransaction(async (tx) => {
    const [created] = await tx
      .insert(products)
      .values({
        categoryId: input.categoryId,
        name: input.name,
        sku: input.sku,
        description: input.description ?? null,
        purchasePrice: input.purchasePrice.toFixed(2),
        sellingPrice: input.sellingPrice.toFixed(2),
        stockQuantity: input.stockQuantity,
        minimumStock: input.minimumStock,
        imageUrl: input.imageUrl ?? null,
      })
      .returning();

    if (!created) throw new ApiError(500, "CREATE_FAILED", "Unable to create product.");

    if (input.stockQuantity > 0) {
      await tx.insert(inventoryMovements).values({
        productId: created.id,
        userId: actorId,
        movementType: "stock_in",
        quantity: input.stockQuantity,
        previousQuantity: 0,
        newQuantity: input.stockQuantity,
        reason: "Opening stock recorded with product creation",
      });
    }

    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.PRODUCT_CREATE,
        entityType: "product",
        entityId: created.id,
        details: {
          name: created.name,
          sku: created.sku,
          openingStock: input.stockQuantity,
        },
        request,
      },
      tx,
    );

    return created.id;
  });

  return getProduct(productId, "admin");
}

export async function updateProduct(
  id: string,
  input: {
    categoryId?: string;
    name?: string;
    sku?: string;
    description?: string | null;
    purchasePrice?: number;
    sellingPrice?: number;
    minimumStock?: number;
    imageUrl?: string | null;
  },
  actorId: string,
  request: Request,
) {
  const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!existing) throw ApiError.notFound("Product not found.");
  if (input.categoryId) await assertCategoryExists(input.categoryId);

  const changes: Partial<typeof products.$inferInsert> = { updatedAt: new Date() };
  if (input.categoryId !== undefined) changes.categoryId = input.categoryId;
  if (input.name !== undefined) changes.name = input.name;
  if (input.sku !== undefined) changes.sku = input.sku;
  if (input.description !== undefined) changes.description = input.description;
  if (input.purchasePrice !== undefined) changes.purchasePrice = input.purchasePrice.toFixed(2);
  if (input.sellingPrice !== undefined) changes.sellingPrice = input.sellingPrice.toFixed(2);
  if (input.minimumStock !== undefined) changes.minimumStock = input.minimumStock;
  if (input.imageUrl !== undefined) changes.imageUrl = input.imageUrl;

  await withTransaction(async (tx) => {
    const [updated] = await tx
      .update(products)
      .set(changes)
      .where(eq(products.id, id))
      .returning({ id: products.id });

    if (!updated) throw ApiError.notFound("Product not found.");

    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.PRODUCT_UPDATE,
        entityType: "product",
        entityId: id,
        details: { changed: Object.keys(input) },
        request,
      },
      tx,
    );
  });

  return getProduct(id, "admin");
}

export async function deleteProduct(id: string, actorId: string, request: Request) {
  const [existing] = await db
    .select({ id: products.id, name: products.name, sku: products.sku })
    .from(products)
    .where(eq(products.id, id))
    .limit(1);
  if (!existing) throw ApiError.notFound("Product not found.");

  const [[salesCount], [movementCount]] = await Promise.all([
    db.select({ total: count() }).from(saleItems).where(eq(saleItems.productId, id)),
    db
      .select({ total: count() })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.productId, id)),
  ]);

  if (Number(salesCount?.total) > 0 || Number(movementCount?.total) > 0) {
    throw ApiError.conflict(
      "This product has sales or inventory history and cannot be deleted. Keep it for audit integrity.",
    );
  }

  await withTransaction(async (tx) => {
    await tx.delete(products).where(eq(products.id, id));
    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.PRODUCT_DELETE,
        entityType: "product",
        entityId: id,
        details: { name: existing.name, sku: existing.sku },
        request,
      },
      tx,
    );
  });
}

export async function listCategories() {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      description: categories.description,
      createdAt: categories.createdAt,
      productCount: count(products.id),
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.name));

  return rows.map((row) => ({ ...row, productCount: Number(row.productCount) }));
}

export async function createCategory(
  input: { name: string; description?: string | null },
  actorId: string,
  request: Request,
) {
  return withTransaction(async (tx) => {
    const [created] = await tx
      .insert(categories)
      .values({ name: input.name, description: input.description ?? null })
      .returning();
    if (!created) throw new ApiError(500, "CREATE_FAILED", "Unable to create category.");

    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.CATEGORY_CREATE,
        entityType: "category",
        entityId: created.id,
        details: { name: created.name },
        request,
      },
      tx,
    );
    return created;
  });
}

export async function updateCategory(
  id: string,
  input: { name?: string; description?: string | null },
  actorId: string,
  request: Request,
) {
  const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!existing) throw ApiError.notFound("Category not found.");

  return withTransaction(async (tx) => {
    const [updated] = await tx
      .update(categories)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    if (!updated) throw ApiError.notFound("Category not found.");

    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.CATEGORY_UPDATE,
        entityType: "category",
        entityId: id,
        details: { changed: Object.keys(input) },
        request,
      },
      tx,
    );
    return updated;
  });
}

export async function deleteCategory(id: string, actorId: string, request: Request) {
  const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (!existing) throw ApiError.notFound("Category not found.");

  const productCountRows = await db
    .select({ total: count() })
    .from(products)
    .where(eq(products.categoryId, id));

  if (Number(productCountRows[0]?.total ?? 0) > 0) {
    throw ApiError.conflict(
      `This category contains ${productCountRows[0]?.total} product(s). Move or remove them first.`,
    );
  }

  await withTransaction(async (tx) => {
    await tx.delete(categories).where(eq(categories.id, id));
    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.CATEGORY_DELETE,
        entityType: "category",
        entityId: id,
        details: { name: existing.name },
        request,
      },
      tx,
    );
  });
}
