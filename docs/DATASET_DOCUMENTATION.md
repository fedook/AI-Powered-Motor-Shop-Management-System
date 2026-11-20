# Dataset documentation

## 1. Requirement

The final project requires at least **50 valid records** in each of five datasets. The system reports actual counts from the live database, not from seed constants or frontend state.

## 2. Verified counts

Verified with `npm.cmd run db:verify` and `GET /api/analytics/datasets` on 20 November 2026:

| Dataset | Table | Count | Distinct primary keys | Minimum | Status |
|---|---|---:|---:|---:|---|
| Products | `products` | 50 | 50 | 50 | PASS |
| Customers | `customers` | 50 | 50 | 50 | PASS |
| Sales | `sales` | 59 | 59 | 50 | PASS |
| Sale Items | `sale_items` | 138 | 138 | 50 | PASS |
| Inventory Movements | `inventory_movements` | 188 | 188 | 50 | PASS |

Additional integrity facts: first sale **2026-07-26**, last sale **2026-11-17**, **0** cancelled sales.

## 3. Dataset descriptions

### Products
Master list of sellable items. Key fields: `id`, `category_id`, `name`, `sku`, `purchase_price`, `selling_price`, `stock_quantity`, `minimum_stock`, timestamps. Used for product rankings, inventory valuation, stockout risk, and recommendation text.

### Customers
Customer profiles. Key fields: `id`, `full_name`, `email`, `contact_number`, `address`, timestamps. Used for purchasing-customer counts, spending averages, frequency buckets, and top-customer ranking. Staff-facing AI context excludes customer PII.

### Sales
Transaction headers. Key fields: `id`, `customer_id`, `user_id`, `transaction_number`, `subtotal`, `discount`, `total_amount`, `payment_method`, `status`, `created_at`. Only `completed` sales contribute to revenue and forecasts; cancellations are reported separately.

### Sale Items
Line items that connect a sale to a product. Key fields: `id`, `sale_id`, `product_id`, `quantity`, `unit_price`, `cost_price`, `subtotal`. Used for units sold, product revenue, COGS, gross profit, and per-product demand history.

### Inventory Movements
Audit trail of stock changes. Key fields: `id`, `product_id`, `movement_type`, `quantity`, `previous_quantity`, `new_quantity`, `reason`, `created_at`. Used for movement summaries and to demonstrate that stock changes are traceable.

## 4. Safe data preparation

The original audit found 48 customers. The seeder was adjusted to **top up only missing demo customers** until the count reached 50. It does not delete, truncate, or rewrite existing customers, products, sales, sale items, or movements. Re-running the seeder is therefore safe for the requirement check.

## 5. Verification commands

```powershell
cd backend
npm.cmd run db:verify
```

Expected output includes all five dataset rows with `PASS`, the counts above, and the sale date/cancellation integrity block. The frontend also displays the same endpoint result on the BA Overview and BA Dashboard pages.
