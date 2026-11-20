import { and, asc, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import type { Request } from "express";
import { db, withTransaction } from "../db";
import { categories, inventoryMovements, products, users } from "../db/schema";
import { AUDIT_ACTIONS } from "../config/constants";
import { ApiError } from "../utils/api-error";
import { escapeLike, paginate } from "../utils/pagination";
import { paginationMeta } from "../utils/http";
import { money } from "../utils/money";
import { recordAudit } from "./audit.service";

export async function getInventorySummary(role: "admin" | "staff") {
  const [summary] = await db
    .select({
      skuCount: sql<number>`count(*)::int`,
      unitsOnHand: sql<number>`coalesce(sum(${products.stockQuantity}), 0)::int`,
      retailValue: sql<string>`coalesce(sum(${products.stockQuantity} * ${products.sellingPrice}), 0)`,
      costValue: sql<string>`coalesce(sum(${products.stockQuantity} * ${products.purchasePrice}), 0)`,
      lowStockCount: sql<number>`count(*) filter (where ${products.stockQuantity} <= ${products.minimumStock})::int`,
      outOfStockCount: sql<number>`count(*) filter (where ${products.stockQuantity} = 0)::int`,
    })
    .from(products);

  return {
    skuCount: Number(summary?.skuCount ?? 0),
    unitsOnHand: Number(summary?.unitsOnHand ?? 0),
    // Financial valuation is administrator-only. Staff receive operational
    // stock counts without retail or cost value.
    ...(role === "admin"
      ? {
          retailValue: money(summary?.retailValue ?? 0),
          costValue: money(summary?.costValue ?? 0),
        }
      : {}),
    lowStockCount: Number(summary?.lowStockCount ?? 0),
    outOfStockCount: Number(summary?.outOfStockCount ?? 0),
  };
}

/**
 * Operational stock-health list for staff-facing contexts. Deliberately omits
 * purchase cost, retail value and financial aggregates.
 */
export async function getSlowMovingProducts(limit = 5) {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      stockQuantity: products.stockQuantity,
      minimumStock: products.minimumStock,
    })
    .from(products)
    .where(
      and(
        sql`${products.stockQuantity} > 0`,
        sql`NOT EXISTS (
          SELECT 1 FROM sale_items si
          JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
          WHERE si.product_id = ${products.id} AND s.created_at >= now() - interval '30 days'
        )`,
      ),
    )
    .orderBy(asc(products.stockQuantity), asc(products.name))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    stockQuantity: row.stockQuantity,
    minimumStock: row.minimumStock,
  }));
}

export async function listInventory(input: {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: string;
  lowStock?: boolean;
  role: "admin" | "staff";
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

  const [rows, totalRows, summary] = await Promise.all([
    db
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        categoryId: products.categoryId,
        categoryName: categories.name,
        purchasePrice: products.purchasePrice,
        sellingPrice: products.sellingPrice,
        stockQuantity: products.stockQuantity,
        minimumStock: products.minimumStock,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(whereClause)
      .orderBy(asc(products.stockQuantity), asc(products.name))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(products).where(whereClause),
    getInventorySummary(input.role),
  ]);

  return {
    data: rows.map(({ purchasePrice, sellingPrice, ...row }) => ({
      ...row,
      // Cost price and retail valuation are commercially confidential. They are
      // added only for administrators, never inherited from the raw row.
      ...(input.role === "admin"
        ? {
            purchasePrice: money(purchasePrice),
            retailValue: money(sellingPrice) * row.stockQuantity,
          }
        : {}),
      sellingPrice: money(sellingPrice),
      isLowStock: row.stockQuantity <= row.minimumStock,
      stockStatus:
        row.stockQuantity === 0
          ? "out_of_stock"
          : row.stockQuantity <= row.minimumStock
            ? "low_stock"
            : "in_stock",
    })),
    summary,
    meta: paginationMeta(page, pageSize, Number(totalRows[0]?.total ?? 0)),
  };
}

export async function listMovements(input: {
  page?: number;
  pageSize?: number;
  productId?: string;
  movementType?: string;
  from?: string;
  to?: string;
}) {
  const { page, pageSize, offset } = paginate(input);
  const conditions: SQL[] = [];

  if (input.productId) conditions.push(eq(inventoryMovements.productId, input.productId));
  if (input.movementType) {
    conditions.push(
      eq(
        inventoryMovements.movementType,
        input.movementType as typeof inventoryMovements.$inferSelect.movementType,
      ),
    );
  }
  if (input.from) {
    const from = new Date(`${input.from}T00:00:00.000Z`);
    if (!Number.isNaN(from.getTime())) conditions.push(gte(inventoryMovements.createdAt, from));
  }
  if (input.to) {
    const to = new Date(`${input.to}T23:59:59.999Z`);
    if (!Number.isNaN(to.getTime())) conditions.push(lte(inventoryMovements.createdAt, to));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: inventoryMovements.id,
        productId: inventoryMovements.productId,
        productName: products.name,
        sku: products.sku,
        userId: inventoryMovements.userId,
        userName: users.name,
        movementType: inventoryMovements.movementType,
        quantity: inventoryMovements.quantity,
        previousQuantity: inventoryMovements.previousQuantity,
        newQuantity: inventoryMovements.newQuantity,
        reason: inventoryMovements.reason,
        createdAt: inventoryMovements.createdAt,
      })
      .from(inventoryMovements)
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .leftJoin(users, eq(inventoryMovements.userId, users.id))
      .where(whereClause)
      .orderBy(desc(inventoryMovements.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(inventoryMovements)
      .where(whereClause),
  ]);

  return { data: rows, meta: paginationMeta(page, pageSize, Number(totalRows[0]?.total ?? 0)) };
}

export async function createMovement(
  input: {
    productId: string;
    movementType: "stock_in" | "stock_out" | "adjustment";
    quantity?: number;
    newQuantity?: number;
    reason: string;
  },
  actorId: string,
  request: Request,
) {
  const movementId = await withTransaction(async (tx) => {
    const [product] = await tx
      .select({
        id: products.id,
        name: products.name,
        sku: products.sku,
        stockQuantity: products.stockQuantity,
      })
      .from(products)
      .where(eq(products.id, input.productId))
      .for("update")
      .limit(1);

    if (!product) throw ApiError.notFound("Product not found.");

    const previous = product.stockQuantity;
    let next: number;

    if (input.movementType === "stock_in") {
      next = previous + (input.quantity ?? 0);
    } else if (input.movementType === "stock_out") {
      next = previous - (input.quantity ?? 0);
    } else {
      next = input.newQuantity ?? previous;
    }

    if (next < 0) {
      throw new ApiError(
        422,
        "NEGATIVE_STOCK",
        `This change would make stock negative (current: ${previous}).`,
      );
    }
    if (next === previous) {
      throw ApiError.badRequest("The new stock quantity is the same as the current quantity.");
    }

    const delta = Math.abs(next - previous);

    const [updated] = await tx
      .update(products)
      .set({ stockQuantity: next, updatedAt: new Date() })
      .where(eq(products.id, product.id))
      .returning({ stockQuantity: products.stockQuantity });

    if (!updated) throw ApiError.notFound("Product not found.");

    const [movement] = await tx
      .insert(inventoryMovements)
      .values({
        productId: product.id,
        userId: actorId,
        movementType: input.movementType,
        quantity: delta,
        previousQuantity: previous,
        newQuantity: next,
        reason: input.reason,
      })
      .returning({ id: inventoryMovements.id });

    if (!movement) throw new ApiError(500, "MOVEMENT_FAILED", "Unable to record stock movement.");

    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.INVENTORY_MOVEMENT,
        entityType: "product",
        entityId: product.id,
        details: {
          sku: product.sku,
          movementType: input.movementType,
          quantity: delta,
          previousQuantity: previous,
          newQuantity: next,
          reason: input.reason,
        },
        request,
      },
      tx,
    );

    return { id: movement.id, productName: product.name, sku: product.sku, newQuantity: next };
  });

  return movementId;
}
