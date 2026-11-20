import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { Request } from "express";
import { db, withTransaction } from "../db";
import { customers, sales } from "../db/schema";
import { AUDIT_ACTIONS } from "../config/constants";
import { ApiError } from "../utils/api-error";
import { escapeLike, paginate } from "../utils/pagination";
import { paginationMeta } from "../utils/http";
import { money } from "../utils/money";
import { recordAudit } from "./audit.service";

function normalizeCustomerInput(input: {
  fullName?: string;
  email?: string | null;
  contactNumber?: string | null;
  address?: string | null;
}) {
  const normalized: Record<string, unknown> = {};
  if (input.fullName !== undefined) normalized.fullName = input.fullName.trim();
  if (input.email !== undefined) normalized.email = input.email?.trim().toLowerCase() || null;
  if (input.contactNumber !== undefined) {
    normalized.contactNumber = input.contactNumber?.trim() || null;
  }
  if (input.address !== undefined) normalized.address = input.address?.trim() || null;
  return normalized;
}

export async function listCustomers(input: {
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const { page, pageSize, offset } = paginate(input);
  const conditions: SQL[] = [];
  if (input.search) {
    const term = `%${escapeLike(input.search)}%`;
    const clause = or(
      ilike(customers.fullName, term),
      ilike(customers.email, term),
      ilike(customers.contactNumber, term),
    );
    if (clause) conditions.push(clause);
  }
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(whereClause)
      .orderBy(desc(customers.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(customers).where(whereClause),
  ]);

  return { data: rows, meta: paginationMeta(page, pageSize, Number(totalRows[0]?.total ?? 0)) };
}

export async function getCustomer(
  id: string,
  actor: { id: string; role: "admin" | "staff" },
  request?: Request,
) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) throw ApiError.notFound("Customer not found.");

  // Staff need contact details for POS, but spending totals and purchase
  // history are financial analytics. Return the basic profile only and record
  // that the sensitive fields were withheld.
  if (actor.role !== "admin") {
    void recordAudit({
      userId: actor.id,
      action: AUDIT_ACTIONS.CUSTOMER_VIEW,
      entityType: "customer",
      entityId: id,
      details: {
        role: actor.role,
        scope: "basic_profile",
        financialHistory: "restricted",
      },
      request,
    });
    return { ...customer, restrictedFinancials: true };
  }

  const [statsRows, history] = await Promise.all([
    db
      .select({
        purchaseCount: count(),
        totalSpent: sql<string>`coalesce(sum(${sales.totalAmount}), 0)`,
        lastPurchaseAt: sql<Date | null>`max(${sales.createdAt})`,
      })
      .from(sales)
      .where(and(eq(sales.customerId, id), eq(sales.status, "completed"))),
    db
      .select({
        id: sales.id,
        transactionNumber: sales.transactionNumber,
        totalAmount: sales.totalAmount,
        status: sales.status,
        paymentMethod: sales.paymentMethod,
        createdAt: sales.createdAt,
      })
      .from(sales)
      .where(eq(sales.customerId, id))
      .orderBy(desc(sales.createdAt))
      .limit(10),
  ]);

  const stats = statsRows[0];

  return {
    ...customer,
    stats: {
      purchaseCount: Number(stats?.purchaseCount ?? 0),
      totalSpent: money(stats?.totalSpent ?? 0),
      lastPurchaseAt: stats?.lastPurchaseAt ?? null,
    },
    recentPurchases: history.map((sale) => ({ ...sale, totalAmount: money(sale.totalAmount) })),
  };
}

export async function createCustomer(
  input: {
    fullName: string;
    email?: string | null;
    contactNumber?: string | null;
    address?: string | null;
  },
  actorId: string,
  request: Request,
) {
  const values = normalizeCustomerInput(input);

  return withTransaction(async (tx) => {
    const [created] = await tx
      .insert(customers)
      .values({
        fullName: input.fullName,
        email: (values.email as string | null) ?? null,
        contactNumber: (values.contactNumber as string | null) ?? null,
        address: (values.address as string | null) ?? null,
      })
      .returning();

    if (!created) throw new ApiError(500, "CREATE_FAILED", "Unable to create customer.");

    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.CUSTOMER_CREATE,
        entityType: "customer",
        entityId: created.id,
        details: { fullName: created.fullName },
        request,
      },
      tx,
    );

    return created;
  });
}

export async function updateCustomer(
  id: string,
  input: {
    fullName?: string;
    email?: string | null;
    contactNumber?: string | null;
    address?: string | null;
  },
  actorId: string,
  request: Request,
) {
  const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!existing) throw ApiError.notFound("Customer not found.");

  const changes = normalizeCustomerInput(input);

  return withTransaction(async (tx) => {
    const [updated] = await tx
      .update(customers)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();

    if (!updated) throw ApiError.notFound("Customer not found.");

    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.CUSTOMER_UPDATE,
        entityType: "customer",
        entityId: id,
        details: { changed: Object.keys(input) },
        request,
      },
      tx,
    );

    return updated;
  });
}

export async function deleteCustomer(id: string, actorId: string, request: Request) {
  const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!existing) throw ApiError.notFound("Customer not found.");

  const salesCountRows = await db
    .select({ total: count() })
    .from(sales)
    .where(eq(sales.customerId, id));

  if (Number(salesCountRows[0]?.total ?? 0) > 0) {
    throw ApiError.conflict(
      "This customer has sales history and cannot be deleted. Transaction records must be preserved.",
    );
  }

  await withTransaction(async (tx) => {
    await tx.delete(customers).where(eq(customers.id, id));
    await recordAudit(
      {
        userId: actorId,
        action: AUDIT_ACTIONS.CUSTOMER_DELETE,
        entityType: "customer",
        entityId: id,
        details: { fullName: existing.fullName },
        request,
      },
      tx,
    );
  });
}
