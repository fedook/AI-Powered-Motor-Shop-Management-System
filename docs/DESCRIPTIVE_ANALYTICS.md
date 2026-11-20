# Descriptive analytics

## 1. Question answered

**What happened?** Descriptive analytics summarizes completed sales, product performance, customer behavior, inventory state, and financial outcomes from the selected database range.

## 2. Source and filters

Endpoint: `GET /api/analytics/descriptive`

Validated filters:

- `from`, `to` — `YYYY-MM-DD`
- `days` — 7 to 365, default 90
- `groupBy` — `day`, `week`, `month`, `year`
- `productId` — optional UUID
- `categoryId` — optional UUID

Only completed sales are included in revenue and transaction totals. Cancelled transactions are counted separately as a data-quality indicator.

## 3. KPI definitions

| KPI | Definition |
|---|---|
| Net revenue | Sum of completed sale `total_amount` after discounts |
| Gross sales | Sum of sale-item revenue before discount attribution |
| Discounts | Sum of completed sale discounts |
| Transactions | Count of completed sales |
| Units sold | Sum of sale-item quantities |
| Average order value | Net revenue ÷ completed transactions |
| Previous-period revenue | Net revenue in the immediately preceding equivalent range |
| Revenue growth % | `(current − previous) ÷ previous × 100`; 100 when previous is 0 and current is positive |
| Sales trend | `increasing`, `decreasing`, or `stable`, based on the OLS slope of daily revenue |
| COGS | Sum of sale-item `cost_price × quantity` |
| Gross profit | Net revenue − COGS |
| Gross margin % | Gross profit ÷ net revenue × 100 |

## 4. Output sections

The response contains:

- `sales` — totals, growth, trend, daily/weekly/monthly/yearly series, payment mix
- `products` — total products, best/least sellers, highest/lowest revenue, full ranking
- `customers` — total and purchasing customers, average spending, frequency buckets, top customers
- `inventory` — SKU count, units on hand, low/out-of-stock lists, fast/slow movers, movement summary/history
- `financial` — net revenue, gross sales, discounts, COGS, gross profit, margin, AOV, calculation basis

Definitions used by the UI:

- **Low stock:** `0 < stock_quantity <= minimum_stock`
- **Out of stock:** `stock_quantity = 0`
- **Fast moving:** top 8 products with recent 30-day units greater than zero
- **Slow moving:** top 10 in-stock products with zero recent 30-day units, sorted by stock on hand

## 5. Visualizations

The BA Dashboard shows a revenue trend (Recharts), payment mix bar chart, product/customer/inventory tables, and a financial summary. A CSV export is available for the selected series.

## 6. Role of this stage in the chain

Descriptive output is not an endpoint of the analysis. Its daily series is passed to the predictive stage, and its product rankings, low-stock lists, and growth value are passed to the prescriptive stage. The Connected Process page displays these handoffs explicitly.
