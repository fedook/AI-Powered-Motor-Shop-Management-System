import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type { Request } from "express";
import { db, withTransaction } from "../db";
import { customers, inventoryMovements, products, saleItems, sales, users } from "../db/schema";
import { AUDIT_ACTIONS } from "../config/constants";
import { ApiError } from "../utils/api-error";
import { escapeLike, paginate } from "../utils/pagination";
import { paginationMeta } from "../utils/http";
import { fromCents, money, toCents } from "../utils/money";
import { recordAudit } from "./audit.service";

interface SaleLineInput {
  productId: string;
  quantity: number;
}

function transactionNumber(): string {
  const now = new Date();
  const date = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(
    now.getUTCDate(),
  ).padStart(2, "0")}`;
  const random = randomBytes(3).toString("hex").toUpperCase();
  return `MS-${date}-${random}`;
}

function isIdempotencyConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505" &&
    (error as { constraint?: string }).constraint === "sales_idempotency_key_unique"
  );
}

const saleListSelection = {
  id: sales.id,
  transactionNumber: sales.transactionNumber,
  customerId: sales.customerId,
  customerName: customers.fullName,
  cashierId: sales.userId,
  cashierName: users.name,
  subtotal: sales.subtotal,
  discount: sales.discount,
  totalAmount: sales.totalAmount,
  paymentMethod: sales.paymentMethod,
  amountPaid: sales.amountPaid,
  changeAmount: sales.changeAmount,
  status: sales.status,
  createdAt: sales.createdAt,
  itemCount: sql<number>`(
    SELECT coalesce(sum(${saleItems.quantity}), 0)::int
    FROM ${saleItems}
    WHERE ${saleItems.saleId} = ${sales.id}
  )`,
};

export async function listSales(input: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "completed" | "cancelled";
  paymentMethod?: "cash" | "gcash" | "bank_transfer" | "other";
  cashierId?: string;
  from?: string;
  to?: string;
  role: "admin" | "staff";
  actorId: string;
}) {
  const { page, pageSize, offset } = paginate(input);
  const conditions: SQL[] = [];

  if (input.role === "staff") {
    conditions.push(eq(sales.userId, input.actorId));
  } else if (input.cashierId) {
    conditions.push(eq(sales.userId, input.cashierId));
  }
  if (input.status) conditions.push(eq(sales.status, input.status));
  if (input.paymentMethod) conditions.push(eq(sales.paymentMethod, input.paymentMethod));
  if (input.search) {
    const term = `%${escapeLike(input.search)}%`;
    const clause = or(
      ilike(sales.transactionNumber, term),
      ilike(customers.fullName, term),
    );
    if (clause) conditions.push(clause);
  }
  if (input.from) {
    const from = new Date(`${input.from}T00:00:00.000Z`);
    if (!Number.isNaN(from.getTime())) conditions.push(gte(sales.createdAt, from));
  }
  if (input.to) {
    const to = new Date(`${input.to}T23:59:59.999Z`);
    if (!Number.isNaN(to.getTime())) conditions.push(lte(sales.createdAt, to));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select(saleListSelection)
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .innerJoin(users, eq(sales.userId, users.id))
      .where(whereClause)
      .orderBy(desc(sales.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(whereClause),
  ]);

  return {
    data: rows.map((row) => ({
      ...row,
      subtotal: money(row.subtotal),
      discount: money(row.discount),
      totalAmount: money(row.totalAmount),
      amountPaid: money(row.amountPaid),
      changeAmount: money(row.changeAmount),
      itemCount: Number(row.itemCount),
    })),
    meta: paginationMeta(page, pageSize, Number(totalRows[0]?.total ?? 0)),
  };
}

export async function getSaleById(
  id: string,
  actor: { id: string; role: "admin" | "staff" },
) {
  const [sale] = await db
    .select({
      ...saleListSelection,
      cancelledAt: sales.cancelledAt,
      cancelledBy: sales.cancelledBy,
      cancellationReason: sales.cancellationReason,
      customerEmail: customers.email,
      customerContact: customers.contactNumber,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .innerJoin(users, eq(sales.userId, users.id))
    .where(eq(sales.id, id))
    .limit(1);

  if (!sale) throw ApiError.notFound("Sale not found.");
  if (actor.role === "staff" && sale.cashierId !== actor.id) {
    throw ApiError.forbidden("You can only view sales that you processed.");
  }

  const items = await db
    .select({
      id: saleItems.id,
      productId: saleItems.productId,
      productName: products.name,
      sku: products.sku,
      quantity: saleItems.quantity,
      unitPrice: saleItems.unitPrice,
      costPrice: saleItems.costPrice,
      subtotal: saleItems.subtotal,
    })
    .from(saleItems)
    .innerJoin(products, eq(saleItems.productId, products.id))
    .where(eq(saleItems.saleId, id))
    .orderBy(products.name);

  return {
    ...sale,
    subtotal: money(sale.subtotal),
    discount: money(sale.discount),
    totalAmount: money(sale.totalAmount),
    amountPaid: money(sale.amountPaid),
    changeAmount: money(sale.changeAmount),
    itemCount: Number(sale.itemCount),
    items: items.map(({ costPrice, ...item }) => ({
      ...item,
      unitPrice: money(item.unitPrice),
      // Cost of goods sold per line is commercially confidential.
      ...(actor.role === "admin" ? { costPrice: money(costPrice) } : {}),
      subtotal: money(item.subtotal),
    })),
    ...(actor.role === "staff" ? { customerEmail: undefined } : {}),
  };
}

async function findByIdempotencyKey(key: string, actor: { id: string; role: "admin" | "staff" }) {
  const [row] = await db
    .select({ id: sales.id })
    .from(sales)
    .where(eq(sales.idempotencyKey, key))
    .limit(1);
  return row ? getSaleById(row.id, actor) : null;
}

export interface CreateSaleInput {
  customerId?: string | null;
  items: SaleLineInput[];
  discount: number;
  paymentMethod: "cash" | "gcash" | "bank_transfer" | "other";
  amountPaid: number;
  idempotencyKey?: string;
}

export async function createSale(
  input: CreateSaleInput,
  actor: { id: string; role: "admin" | "staff" },
  request: Request,
) {
  if (actor.role === "staff" && toCents(input.discount) > 0) {
    throw ApiError.forbidden("Only administrators can apply discounts.");
  }

  if (input.idempotencyKey) {
    const existing = await findByIdempotencyKey(input.idempotencyKey, actor);
    if (existing && (actor.role === "admin" || existing.cashierId === actor.id)) {
      return { ...existing, replayed: true };
    }
    if (existing) throw ApiError.forbidden("This idempotency key belongs to another user.");
  }

  const itemQuantities = new Map<string, number>();
  for (const item of input.items) {
    itemQuantities.set(item.productId, (itemQuantities.get(item.productId) ?? 0) + item.quantity);
  }
  const productIds = [...itemQuantities.keys()].sort();

  let saleId: string;

  try {
    saleId = await withTransaction(async (tx) => {
      if (input.customerId) {
        const [customer] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.id, input.customerId))
          .limit(1);
        if (!customer) throw ApiError.badRequest("The selected customer does not exist.");
      }

      // Row locks serialize concurrent sales of the same product so stock
      // cannot be oversold between validation and deduction.
      const lockedProducts = await tx
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          sellingPrice: products.sellingPrice,
          purchasePrice: products.purchasePrice,
          stockQuantity: products.stockQuantity,
        })
        .from(products)
        .where(inArray(products.id, productIds))
        .orderBy(products.id)
        .for("update");

      if (lockedProducts.length !== productIds.length) {
        const found = new Set(lockedProducts.map((product) => product.id));
        const missing = productIds.filter((id) => !found.has(id));
        throw ApiError.badRequest("One or more products no longer exist.", { missing });
      }

      const productMap = new Map(lockedProducts.map((product) => [product.id, product]));
      const lines: Array<{
        productId: string;
        quantity: number;
        unitPriceCents: number;
        costPriceCents: number;
        subtotalCents: number;
        previousStock: number;
        newStock: number;
        name: string;
      }> = [];

      let subtotalCents = 0;
      for (const productId of productIds) {
        const product = productMap.get(productId);
        const quantity = itemQuantities.get(productId) ?? 0;
        if (!product) throw ApiError.badRequest("One or more products no longer exist.");
        if (quantity <= 0) throw ApiError.badRequest("Item quantities must be positive.");
        if (quantity > product.stockQuantity) {
          throw new ApiError(
            409,
            "INSUFFICIENT_STOCK",
            `Insufficient stock for ${product.name}. Only ${product.stockQuantity} left.`,
            { productId, available: product.stockQuantity, requested: quantity },
          );
        }

        const unitPriceCents = toCents(product.sellingPrice);
        const subtotal = unitPriceCents * quantity;
        subtotalCents += subtotal;

        lines.push({
          productId,
          quantity,
          unitPriceCents,
          costPriceCents: toCents(product.purchasePrice),
          subtotalCents: subtotal,
          previousStock: product.stockQuantity,
          newStock: product.stockQuantity - quantity,
          name: product.name,
        });
      }

      const discountCents = toCents(input.discount);
      if (discountCents > subtotalCents) {
        throw ApiError.badRequest("Discount cannot be greater than the subtotal.");
      }
      const totalCents = subtotalCents - discountCents;
      const amountPaidCents = toCents(input.amountPaid);
      if (amountPaidCents < totalCents) {
        throw new ApiError(
          400,
          "INSUFFICIENT_PAYMENT",
          "Amount paid is less than the total amount due.",
          { total: fromCents(totalCents), amountPaid: fromCents(amountPaidCents) },
        );
      }
      const changeCents = amountPaidCents - totalCents;
      const txNumber = transactionNumber();

      const [sale] = await tx
        .insert(sales)
        .values({
          customerId: input.customerId ?? null,
          userId: actor.id,
          transactionNumber: txNumber,
          subtotal: fromCents(subtotalCents),
          discount: fromCents(discountCents),
          totalAmount: fromCents(totalCents),
          paymentMethod: input.paymentMethod,
          amountPaid: fromCents(amountPaidCents),
          changeAmount: fromCents(changeCents),
          status: "completed",
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning({ id: sales.id });

      if (!sale) throw new ApiError(500, "SALE_CREATE_FAILED", "Unable to record the sale.");

      await tx.insert(saleItems).values(
        lines.map((line) => ({
          saleId: sale.id,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: fromCents(line.unitPriceCents),
          costPrice: fromCents(line.costPriceCents),
          subtotal: fromCents(line.subtotalCents),
        })),
      );

      for (const line of lines) {
        const [deducted] = await tx
          .update(products)
          .set({
            stockQuantity: sql`${products.stockQuantity} - ${line.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, line.productId),
              gte(products.stockQuantity, line.quantity),
            ),
          )
          .returning({ stockQuantity: products.stockQuantity });

        if (!deducted) {
          throw new ApiError(
            409,
            "STOCK_CONFLICT",
            `Stock for ${line.name} changed during checkout. Please review the cart and retry.`,
          );
        }

        await tx.insert(inventoryMovements).values({
          productId: line.productId,
          userId: actor.id,
          movementType: "sale",
          quantity: line.quantity,
          previousQuantity: line.previousStock,
          newQuantity: deducted.stockQuantity,
          reason: `Sold via transaction ${txNumber}`,
        });
      }

      await recordAudit(
        {
          userId: actor.id,
          action: AUDIT_ACTIONS.SALE_CREATE,
          entityType: "sale",
          entityId: sale.id,
          details: {
            transactionNumber: txNumber,
            itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
            subtotal: fromCents(subtotalCents),
            discount: fromCents(discountCents),
            total: fromCents(totalCents),
            paymentMethod: input.paymentMethod,
          },
          request,
        },
        tx,
      );

      return sale.id;
    });
  } catch (error) {
    if (input.idempotencyKey && isIdempotencyConflict(error)) {
      const existing = await findByIdempotencyKey(input.idempotencyKey, actor);
      if (existing && (actor.role === "admin" || existing.cashierId === actor.id)) {
        return { ...existing, replayed: true };
      }
    }
    throw error;
  }

  return getSaleById(saleId, { id: actor.id, role: actor.role });
}

export async function cancelSale(
  id: string,
  reason: string,
  actor: { id: string; role: "admin" },
  request: Request,
) {
  await withTransaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).for("update").limit(1);
    if (!sale) throw ApiError.notFound("Sale not found.");
    if (sale.status === "cancelled") throw ApiError.conflict("This sale was already cancelled.");

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, id));

    for (const item of items) {
      const [restored] = await tx
        .update(products)
        .set({
          stockQuantity: sql`${products.stockQuantity} + ${item.quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, item.productId))
        .returning({ stockQuantity: products.stockQuantity });

      if (!restored) {
        throw new ApiError(
          409,
          "PRODUCT_MISSING",
          "A product from this sale no longer exists; stock could not be restored.",
        );
      }

      await tx.insert(inventoryMovements).values({
        productId: item.productId,
        userId: actor.id,
        movementType: "sale_cancellation",
        quantity: item.quantity,
        previousQuantity: restored.stockQuantity - item.quantity,
        newQuantity: restored.stockQuantity,
        reason: `Sale ${sale.transactionNumber} cancelled: ${reason}`,
      });
    }

    await tx
      .update(sales)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: actor.id,
        cancellationReason: reason,
      })
      .where(eq(sales.id, id));

    await recordAudit(
      {
        userId: actor.id,
        action: AUDIT_ACTIONS.SALE_CANCEL,
        entityType: "sale",
        entityId: id,
        details: {
          transactionNumber: sale.transactionNumber,
          total: sale.totalAmount,
          reason,
          restoredItems: items.length,
        },
        request,
      },
      tx,
    );
  });

  return getSaleById(id, { id: actor.id, role: "admin" });
}
