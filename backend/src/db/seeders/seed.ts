import "dotenv/config";
import bcrypt from "bcrypt";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";
import * as schema from "../schema";
import { fromCents } from "../../utils/money";

const BCRYPT_ROUNDS = 12;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_DATABASE_URL: z.string().optional(),
  ADMIN_EMAIL: z.string().email("ADMIN_EMAIL must be valid"),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD must be set (8+ chars)"),
  STAFF_EMAIL: z.string().email("STAFF_EMAIL must be valid"),
  STAFF_PASSWORD: z.string().min(8, "STAFF_PASSWORD must be set (8+ chars)"),
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
  console.error("[seed] Missing seeder configuration:");
  for (const issue of parsedEnv.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error(
    "[seed] Set ADMIN_EMAIL, ADMIN_PASSWORD, STAFF_EMAIL and STAFF_PASSWORD in backend/.env",
  );
  process.exit(1);
}

const env = parsedEnv.data;

const connectionString = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 15_000 });
const db = drizzle(pool, { schema });

/** Deterministic PRNG so repeated demo seeds are reproducible across environments. */
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20261115);
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)] as T;
const randomInt = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;

const categoriesSeed = [
  { name: "Motorcycles", description: "Brand-new motorcycles and scooters." },
  { name: "Motorcycle Parts", description: "OEM and aftermarket replacement parts." },
  { name: "Helmets", description: "Certified half-face, full-face and modular helmets." },
  { name: "Tires", description: "Tubeless and tube-type motorcycle tires." },
  { name: "Lubricants", description: "Engine oils, gear oils and lubricants." },
  { name: "Accessories", description: "Riding accessories and add-ons." },
  { name: "Batteries", description: "Maintenance-free and lithium batteries." },
  { name: "Motorcycle Tools", description: "Workshop and rider tools." },
  { name: "Riding Gear", description: "Jackets, gloves and protective gear." },
  { name: "Brake & Electrical", description: "Brake components, plugs and electrical parts." },
];

type ProductSeed = {
  sku: string;
  name: string;
  category: string;
  purchase: number;
  selling: number;
  stock: number;
  minimum: number;
};

const productsSeed: ProductSeed[] = [
  { sku: "MOT-001", name: "Honda Click 125i V3", category: "Motorcycles", purchase: 78000, selling: 92500, stock: 6, minimum: 2 },
  { sku: "MOT-002", name: "Yamaha NMAX 155 ABS", category: "Motorcycles", purchase: 118000, selling: 129500, stock: 4, minimum: 2 },
  { sku: "MOT-003", name: "Honda PCX 160 CBS", category: "Motorcycles", purchase: 118500, selling: 128900, stock: 3, minimum: 2 },
  { sku: "MOT-004", name: "Yamaha Aerox 155", category: "Motorcycles", purchase: 112000, selling: 124900, stock: 5, minimum: 2 },
  { sku: "MOT-005", name: "Suzuki Burgman Street 125", category: "Motorcycles", purchase: 76000, selling: 89900, stock: 4, minimum: 2 },
  { sku: "PRT-001", name: "Cylinder Head Assembly 150cc", category: "Motorcycle Parts", purchase: 3200, selling: 4800, stock: 12, minimum: 4 },
  { sku: "PRT-002", name: "Brake Pad Set Front", category: "Motorcycle Parts", purchase: 380, selling: 650, stock: 40, minimum: 15 },
  { sku: "PRT-003", name: "Chain and Sprocket Kit", category: "Motorcycle Parts", purchase: 1450, selling: 2200, stock: 18, minimum: 6 },
  { sku: "PRT-004", name: "Clutch Lining Set", category: "Motorcycle Parts", purchase: 620, selling: 980, stock: 25, minimum: 8 },
  { sku: "PRT-005", name: "Side Mirror Pair", category: "Motorcycle Parts", purchase: 320, selling: 550, stock: 30, minimum: 10 },
  { sku: "PRT-006", name: "Handlebar Grip Set", category: "Motorcycle Parts", purchase: 180, selling: 320, stock: 45, minimum: 15 },
  { sku: "PRT-007", name: "Fuel Pump Assembly", category: "Motorcycle Parts", purchase: 2400, selling: 3600, stock: 8, minimum: 4 },
  { sku: "PRT-008", name: "Shock Absorber Rear", category: "Motorcycle Parts", purchase: 1900, selling: 2950, stock: 10, minimum: 4 },
  { sku: "HLM-001", name: "LS2 Stream II Helmet", category: "Helmets", purchase: 3200, selling: 4500, stock: 14, minimum: 5 },
  { sku: "HLM-002", name: "HJC CS-15 Helmet", category: "Helmets", purchase: 4200, selling: 5800, stock: 9, minimum: 4 },
  { sku: "HLM-003", name: "Spyder Recon Helmet", category: "Helmets", purchase: 1800, selling: 2700, stock: 20, minimum: 6 },
  { sku: "HLM-004", name: "Gillett Helmet Matte Black", category: "Helmets", purchase: 1500, selling: 2300, stock: 16, minimum: 6 },
  { sku: "HLM-005", name: "AGV K3 SV Helmet", category: "Helmets", purchase: 9500, selling: 12500, stock: 5, minimum: 3 },
  { sku: "HLM-006", name: "Modular Helmet with Intercom Slot", category: "Helmets", purchase: 3800, selling: 5200, stock: 7, minimum: 3 },
  { sku: "TIR-001", name: "Michelin Pilot Street 2", category: "Tires", purchase: 2600, selling: 3500, stock: 12, minimum: 5 },
  { sku: "TIR-002", name: "IRC NR73 Tire 80/90-17", category: "Tires", purchase: 950, selling: 1450, stock: 24, minimum: 8 },
  { sku: "TIR-003", name: "Corsa Platinum R26", category: "Tires", purchase: 1300, selling: 1950, stock: 18, minimum: 6 },
  { sku: "TIR-004", name: "Dunlop TT900 90/80-17", category: "Tires", purchase: 1650, selling: 2400, stock: 15, minimum: 6 },
  { sku: "TIR-005", name: "Swallow Street Enduro Tire", category: "Tires", purchase: 1150, selling: 1750, stock: 10, minimum: 5 },
  { sku: "LUB-001", name: "Yamalube 4T Semi-Synthetic 1L", category: "Lubricants", purchase: 340, selling: 480, stock: 60, minimum: 20 },
  { sku: "LUB-002", name: "Shell Advance AX7 1L", category: "Lubricants", purchase: 380, selling: 520, stock: 45, minimum: 15 },
  { sku: "LUB-003", name: "Motul 5100 10W40 1L", category: "Lubricants", purchase: 450, selling: 620, stock: 35, minimum: 12 },
  { sku: "LUB-004", name: "Honda Genuine Oil 10W30 1L", category: "Lubricants", purchase: 320, selling: 450, stock: 70, minimum: 20 },
  { sku: "LUB-005", name: "Castrol Power1 4T 1L", category: "Lubricants", purchase: 360, selling: 510, stock: 40, minimum: 15 },
  { sku: "LUB-006", name: "Repsol Moto Rider 20W50 1L", category: "Lubricants", purchase: 330, selling: 470, stock: 28, minimum: 10 },
  { sku: "ACC-001", name: "Phone Holder with USB Charger", category: "Accessories", purchase: 420, selling: 750, stock: 22, minimum: 8 },
  { sku: "ACC-002", name: "Waterproof Raincoat Set", category: "Accessories", purchase: 550, selling: 950, stock: 30, minimum: 10 },
  { sku: "ACC-003", name: "Motorcycle Cover XL", category: "Accessories", purchase: 380, selling: 650, stock: 25, minimum: 8 },
  { sku: "ACC-004", name: "Saddle Bag Waterproof", category: "Accessories", purchase: 700, selling: 1200, stock: 12, minimum: 5 },
  { sku: "ACC-005", name: "LED Headlight Bulb H4", category: "Accessories", purchase: 450, selling: 780, stock: 20, minimum: 6 },
  { sku: "ACC-006", name: "Handlebar Phone Mount Aluminum", category: "Accessories", purchase: 650, selling: 1050, stock: 14, minimum: 5 },
  { sku: "BAT-001", name: "Yuasa YTX7A-BS Battery", category: "Batteries", purchase: 1650, selling: 2350, stock: 13, minimum: 5 },
  { sku: "BAT-002", name: "Motolite MF5 Battery", category: "Batteries", purchase: 2100, selling: 2950, stock: 9, minimum: 4 },
  { sku: "BAT-003", name: "GS GTZ6V Battery", category: "Batteries", purchase: 1900, selling: 2700, stock: 11, minimum: 4 },
  { sku: "BAT-004", name: "Lithium Battery 12V 6Ah", category: "Batteries", purchase: 2800, selling: 3900, stock: 6, minimum: 3 },
  { sku: "TOL-001", name: "Socket Wrench Set 40pc", category: "Motorcycle Tools", purchase: 1200, selling: 1850, stock: 8, minimum: 3 },
  { sku: "TOL-002", name: "Tire Lever Set", category: "Motorcycle Tools", purchase: 350, selling: 580, stock: 15, minimum: 5 },
  { sku: "TOL-003", name: "Chain Breaker Tool", category: "Motorcycle Tools", purchase: 750, selling: 1150, stock: 6, minimum: 3 },
  { sku: "TOL-004", name: "Torque Wrench 1/2 inch", category: "Motorcycle Tools", purchase: 2200, selling: 3200, stock: 4, minimum: 2 },
  { sku: "GER-001", name: "Riding Gloves Touchscreen", category: "Riding Gear", purchase: 450, selling: 780, stock: 20, minimum: 6 },
  { sku: "GER-002", name: "Riding Jacket Mesh", category: "Riding Gear", purchase: 2800, selling: 4200, stock: 7, minimum: 3 },
  { sku: "GER-003", name: "Knee and Shin Guard Set", category: "Riding Gear", purchase: 900, selling: 1450, stock: 12, minimum: 4 },
  { sku: "ELE-001", name: "NGK Iridium Spark Plug", category: "Brake & Electrical", purchase: 380, selling: 580, stock: 50, minimum: 15 },
  { sku: "ELE-002", name: "Brake Fluid DOT4 500ml", category: "Brake & Electrical", purchase: 220, selling: 350, stock: 32, minimum: 10 },
  { sku: "ELE-003", name: "LED Turn Signal Set", category: "Brake & Electrical", purchase: 280, selling: 480, stock: 18, minimum: 6 },
];

const firstNames = [
  "Miguel", "Andrea", "Jose", "Bea", "Carlo", "Diana", "Enrico", "Faith", "Gabriel", "Hazel",
  "Ivan", "Jasmine", "Kevin", "Liza", "Marco", "Nina", "Oscar", "Pia", "Quincy", "Rhea",
  "Samuel", "Tina", "Ulysses", "Vera", "Wesley", "Ximena", "Yael", "Zara", "Adrian", "Bianca",
  "Cedric", "Donna", "Elias", "Fiona", "Gio", "Helena", "Ismael", "Jessa", "Kian", "Lorna",
  "Mikael", "Noelle", "Oliver", "Patricia", "Rafael", "Sofia", "Tristan", "Ursula", "Victor", "Wendy",
];
const lastNames = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Flores", "Ramos",
  "Aquino", "Del Rosario", "Villanueva", "Navarro", "Domingo", "Salazar", "Castillo", "Mercado", "Lim", "Tan",
  "Pascual", "Rivera", "Aguilar", "Fernandez", "Gonzales", "Roxas", "Panganiban", "Velasco", "Ong", "Sy",
];
const barangays = ["San Isidro", "Poblacion", "Bagong Silang", "Malinis", "Santa Cruz", "Mabuhay", "Tagumpay", "Bayani"];
const cities = ["Quezon City", "Makati", "Pasig", "Cebu City", "Davao City", "Bacolod", "Iloilo City", "Baguio"];

const customersSeed = Array.from({ length: 50 }, (_, index) => {
  const number = index + 1;
  return {
    fullName: `${firstNames[index % firstNames.length]} ${lastNames[(index * 7) % lastNames.length]}`,
    email: `demo.customer${String(number).padStart(2, "0")}@example.test`,
    contactNumber: `0917-555-${String(1000 + number).slice(-4)}`,
    address: `${randomInt(10, 250)} ${pick(["Rizal", "Mabini", "Bonifacio", "Quezon", "Magsaysay"])} St., Barangay ${pick(barangays)}, ${pick(cities)}`,
  };
});

async function seed() {
  console.log("[seed] Starting demo data seed (safe to re-run)...");

  const passwordHashes = await Promise.all([
    bcrypt.hash(env.ADMIN_PASSWORD, BCRYPT_ROUNDS),
    bcrypt.hash(env.STAFF_PASSWORD, BCRYPT_ROUNDS),
    bcrypt.hash(env.STAFF_PASSWORD, BCRYPT_ROUNDS),
  ]);

  const secondStaffEmail = "staff2@motorshop.local";

  await db.transaction(async (tx) => {
    // ---------- Users ----------
    const userSeeds = [
      {
        name: "Shop Administrator",
        email: env.ADMIN_EMAIL.toLowerCase(),
        passwordHash: passwordHashes[0]!,
        role: "admin" as const,
      },
      {
        name: "Front Desk Staff",
        email: env.STAFF_EMAIL.toLowerCase(),
        passwordHash: passwordHashes[1]!,
        role: "staff" as const,
      },
      {
        name: "Inventory Staff",
        email: secondStaffEmail,
        passwordHash: passwordHashes[2]!,
        role: "staff" as const,
      },
    ];

    for (const userSeed of userSeeds) {
      await tx.insert(schema.users).values(userSeed).onConflictDoNothing({
        target: schema.users.email,
      });
    }

    const [admin] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`${schema.users.email} = ${userSeeds[0]!.email}`)
      .limit(1);
    if (!admin) throw new Error("Admin account could not be created.");

    // ---------- Categories ----------
    for (const category of categoriesSeed) {
      await tx.insert(schema.categories).values(category).onConflictDoNothing({
        target: schema.categories.name,
      });
    }
    const categoryRows = await tx.select().from(schema.categories);
    const categoryByName = new Map(categoryRows.map((row) => [row.name, row.id]));

    // ---------- Products ----------
    for (const product of productsSeed) {
      const categoryId = categoryByName.get(product.category);
      if (!categoryId) throw new Error(`Missing category ${product.category}`);
      await tx
        .insert(schema.products)
        .values({
          categoryId,
          name: product.name,
          sku: product.sku,
          description: `${product.name} — demo catalog item for the motor shop.`,
          purchasePrice: product.purchase.toFixed(2),
          sellingPrice: product.selling.toFixed(2),
          stockQuantity: product.stock,
          minimumStock: product.minimum,
        })
        .onConflictDoNothing({ target: schema.products.sku });
    }

    const productRows = await tx.select().from(schema.products);
    const newProducts = new Set(productsSeed.map((product) => product.sku));
    const existingMovements = await tx
      .select({ id: schema.inventoryMovements.id })
      .from(schema.inventoryMovements)
      .limit(1);

    if (existingMovements.length === 0) {
      for (const product of productRows) {
        if (!newProducts.has(product.sku)) continue;
        if (product.stockQuantity <= 0) continue;
        await tx.insert(schema.inventoryMovements).values({
          productId: product.id,
          userId: admin.id,
          movementType: "stock_in",
          quantity: product.stockQuantity,
          previousQuantity: 0,
          newQuantity: product.stockQuantity,
          reason: "Demo opening stock",
        });
      }
    }

    // ---------- Customers ----------
    // Safe top-up: existing customer records are never modified or deleted.
    // Only deterministic demo records with unused emails are inserted, and
    // insertion stops as soon as the five-dataset minimum (50) is satisfied.
    const [customerCountRow] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.customers);
    let customerCount = Number(customerCountRow?.total ?? 0);
    if (customerCount < 50) {
      for (const customer of customersSeed) {
        if (customerCount >= 50) break;
        const inserted = await tx
          .insert(schema.customers)
          .values(customer)
          .onConflictDoNothing({ target: schema.customers.email })
          .returning({ id: schema.customers.id });
        customerCount += inserted.length;
      }
      console.log(`[seed] Customer top-up complete; ${customerCount} customer records present.`);
    } else {
      console.log(`[seed] ${customerCount} customer records already present; no top-up needed.`);
    }

    // ---------- Sales ----------
    const [seedSalesCount] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.sales)
      .where(sql`${schema.sales.transactionNumber} LIKE 'SEED-%'`);

    const existingSeedSales = Number(seedSalesCount?.total ?? 0);
    if (existingSeedSales > 0) {
      console.log(`[seed] ${existingSeedSales} demo sales already exist; skipping sale generation.`);
      return;
    }

    const customerRows = await tx.select({ id: schema.customers.id }).from(schema.customers);
    const stockByProduct = new Map(productRows.map((product) => [product.id, product.stockQuantity]));
    const paymentMethods = ["cash", "gcash", "gcash", "gcash", "bank_transfer", "other"] as const;

    let createdSales = 0;

    for (let index = 0; index < 50; index += 1) {
      const itemCount = randomInt(1, 4);
      const selected: typeof productRows = [];
      let attempts = 0;
      while (selected.length < itemCount && attempts < 60) {
        attempts += 1;
        const candidate = pick(productRows);
        if (selected.some((item) => item.id === candidate.id)) continue;
        const available = stockByProduct.get(candidate.id) ?? 0;
        if (available < 1) continue;
        selected.push(candidate);
      }
      if (selected.length === 0) break;

      const lines = selected.map((product) => {
        const maxQuantity = Math.min(
          stockByProduct.get(product.id) ?? 0,
          product.sku.startsWith("MOT-") ? 1 : 3,
        );
        const quantity = randomInt(1, Math.max(1, maxQuantity));
        const unitCents = Math.round(Number(product.sellingPrice) * 100);
        const costCents = Math.round(Number(product.purchasePrice) * 100);
        return {
          product,
          quantity,
          unitCents,
          costCents,
          subtotalCents: unitCents * quantity,
        };
      });

      const subtotalCents = lines.reduce((sum, line) => sum + line.subtotalCents, 0);
      const discountRate = random() < 0.2 ? pick([0.02, 0.05]) : 0;
      const discountCents = Math.round(subtotalCents * discountRate);
      const totalCents = subtotalCents - discountCents;
      const paymentMethod = pick([...paymentMethods]);
      const amountPaidCents =
        paymentMethod === "cash"
          ? Math.ceil(totalCents / 5000) * 5000 || totalCents
          : totalCents;
      const changeCents = amountPaidCents - totalCents;

      const daysAgo = Math.min(118, Math.floor(index * 2.3 + random() * 4));
      const createdAt = new Date(Date.now() - daysAgo * 86_400_000 - randomInt(0, 10) * 3_600_000);
      const transactionNumber = `SEED-${String(index + 1).padStart(4, "0")}`;

      const [sale] = await tx
        .insert(schema.sales)
        .values({
          customerId: random() < 0.55 ? pick(customerRows).id : null,
          userId: admin.id,
          transactionNumber,
          subtotal: fromCents(subtotalCents),
          discount: fromCents(discountCents),
          totalAmount: fromCents(totalCents),
          paymentMethod,
          amountPaid: fromCents(amountPaidCents),
          changeAmount: fromCents(changeCents),
          status: "completed",
          createdAt,
        })
        .returning({ id: schema.sales.id });

      if (!sale) throw new Error("Failed to create demo sale.");

      for (const line of lines) {
        const previous = stockByProduct.get(line.product.id) ?? 0;
        const next = previous - line.quantity;
        await tx.insert(schema.saleItems).values({
          saleId: sale.id,
          productId: line.product.id,
          quantity: line.quantity,
          unitPrice: fromCents(line.unitCents),
          costPrice: fromCents(line.costCents),
          subtotal: fromCents(line.subtotalCents),
        });
        await tx
          .update(schema.products)
          .set({ stockQuantity: next, updatedAt: new Date() })
          .where(sql`${schema.products.id} = ${line.product.id}`);
        await tx.insert(schema.inventoryMovements).values({
          productId: line.product.id,
          userId: admin.id,
          movementType: "sale",
          quantity: line.quantity,
          previousQuantity: previous,
          newQuantity: next,
          reason: `Demo sale ${transactionNumber}`,
          createdAt,
        });
        stockByProduct.set(line.product.id, next);
      }

      createdSales += 1;
    }

    console.log(`[seed] Created ${createdSales} demo sales with inventory movements.`);

    await tx.insert(schema.auditLogs).values({
      userId: admin.id,
      action: "DEMO_SEED",
      entityType: "system",
      details: {
        customers: customersSeed.length,
        products: productsSeed.length,
        sales: createdSales,
      },
    });
  });

  const [verification] = await db
    .select({
      products: sql<number>`(SELECT count(*)::int FROM products)`,
      customers: sql<number>`(SELECT count(*)::int FROM customers)`,
      categories: sql<number>`(SELECT count(*)::int FROM categories)`,
      sales: sql<number>`(SELECT count(*)::int FROM sales)`,
      saleItems: sql<number>`(SELECT count(*)::int FROM sale_items)`,
      movements: sql<number>`(SELECT count(*)::int FROM inventory_movements)`,
      inconsistent: sql<number>`(
        SELECT count(*)::int FROM products p
        WHERE p.stock_quantity <> coalesce((
          SELECT sum(CASE WHEN m.movement_type IN ('stock_in', 'sale_cancellation') THEN m.quantity ELSE -m.quantity END)
          FROM inventory_movements m WHERE m.product_id = p.id
        ), 0)
      )`,
      negativeStock: sql<number>`(SELECT count(*)::int FROM products WHERE stock_quantity < 0)`,
    })
    .from(sql`(SELECT 1) AS seed_check`);

  console.log("[seed] Verification:", {
    products: Number(verification?.products ?? 0),
    categories: Number(verification?.categories ?? 0),
    customers: Number(verification?.customers ?? 0),
    sales: Number(verification?.sales ?? 0),
    saleItems: Number(verification?.saleItems ?? 0),
    inventoryMovements: Number(verification?.movements ?? 0),
    inventoryInconsistencies: Number(verification?.inconsistent ?? 0),
    negativeStockProducts: Number(verification?.negativeStock ?? 0),
  });

  if (Number(verification?.inconsistent ?? 0) > 0 || Number(verification?.negativeStock ?? 0) > 0) {
    throw new Error("Inventory consistency verification failed.");
  }

  console.log("[seed] Demo accounts ready:");
  console.log(`  admin: ${env.ADMIN_EMAIL} (password from ADMIN_PASSWORD)`);
  console.log(`  staff: ${env.STAFF_EMAIL} (password from STAFF_PASSWORD)`);
  console.log(`  staff: ${secondStaffEmail} (password from STAFF_PASSWORD)`);
  console.log("[seed] Done.");
}

seed()
  .catch((error) => {
    console.error("[seed] Failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
