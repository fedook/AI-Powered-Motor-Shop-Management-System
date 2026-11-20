# Business Analytics Case Study

**Case:** AI-Powered Motor Shop Management System  
**Prepared for:** Business Analytics final project  
**Data verification date:** 20 November 2026

---

## 1. Title and context

**From Operational Records to Connected Business Decisions: A Descriptive, Predictive, and Prescriptive Analytics Case Study of a Motor Shop**

The system already records product masters, customer profiles, POS transactions, sale line items, and inventory movements. This case study documents how those records are converted into evidence, estimates, and reviewable actions without replacing any existing operational module.

## 2. Business profile and statement of the problem

The case business is a retail motor shop selling automotive parts and accessories. Sales are processed through a POS flow that writes transaction headers, line items, and stock movements in one transaction. Inventory changes are audited through movement records.

Before this work, reporting answered only retrospective questions. Managers could see revenue or stock levels, but there was no consistent chain that carried observed facts into a forecast and then into a concrete recommended action. Stock replenishment and sales focus depended on manual interpretation, and no database record captured whether a suggested action was accepted, rejected, or completed.

## 3. Objectives of the study

1. Verify that the five required datasets each contain at least 50 valid records using live database counts.
2. Describe sales, product, customer, inventory, and financial performance from completed transactions.
3. Forecast revenue, transaction counts, product demand, and stockout timing using statistical methods.
4. Generate replenishment, purchasing, sales-focus, and business-improvement recommendations from forecast outputs.
5. Connect all three analytical stages in one interactive workflow with role-based access and auditable human decisions.

## 4. Significance of the study

- **Owners and managers** receive a traceable path from evidence to action.
- **Staff** retain operational access and dataset verification without seeing restricted financial forecasts.
- **Customers** benefit indirectly from better stock availability and fewer missed sales.
- **Instructors and evaluators** can verify that the three analytics levels are genuinely connected rather than presented as independent dashboards.

## 5. Scope, delimitations, and assumptions

- Only data already in the application database is used. No external market data is introduced.
- Descriptive and financial figures use completed sales. Cancelled sales are counted separately.
- Forecast horizons are limited to 7, 30, and 90 days.
- Product demand uses the most recent 30 days against the prior 30 days, regardless of the selected dashboard range.
- Recommendations are advisory. The system never creates purchase orders, changes prices, or mutates stock automatically.
- Forecast accuracy beyond the available sales window cannot be claimed.

## 6. Review of related literature and methods

Descriptive analytics summarizes historical data through counts, totals, averages, ratios, rankings, and trends. Predictive analytics extends these summaries with models. For this dataset, linear regression is appropriate when a material trend exists; otherwise a weighted moving average is more stable. Prescriptive analytics evaluates forecast outcomes against constraints such as stock on hand, lead time, and safety stock to propose actions.

Human-in-the-loop decision support is applied because recommendations affect money and inventory. A generated suggestion therefore carries a status that a responsible user updates.

## 7. Conceptual framework

```text
Products / Customers / Sales / Sale Items / Inventory Movements
                         │
                         ▼
        Shared verified snapshot (ba.service.ts)
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   Descriptive       Predictive      Prescriptive
   observed KPIs →  statistical  →  ranked actions
          │              │              │
          └──────────────┴──────────────┘
                         │
                         ▼
             Human decision stored in DB
```

The same snapshot feeds all stages. The predictive stage receives the descriptive daily series; the prescriptive stage receives the predictive rows plus descriptive rankings and current inventory.

## 8. Research design and analytical procedures

The design is quantitative and explanatory. Filters for date range, group period, category, and product are validated server-side. The service then computes:

- `Average Order Value = net revenue ÷ completed transactions`
- `Revenue growth % = (current net revenue − prior net revenue) ÷ prior net revenue × 100`
- `Trend slope = ordinary least-squares slope of daily revenue`
- `Stockout days = current stock ÷ recent average daily demand`
- `Reorder quantity = projected demand over 7-day lead time + 3 safety days − current stock`

## 9. Data sources, dataset verification, and integrity

Live verification results:

| Dataset | Table | Count | Distinct ID requirement | Status |
|---|---|---:|---|---|
| Products | `products` | 50 | 50 distinct IDs | PASS |
| Customers | `customers` | 50 | 50 distinct IDs | PASS |
| Sales | `sales` | 59 | 59 distinct IDs | PASS |
| Sale Items | `sale_items` | 138 | 138 distinct IDs | PASS |
| Inventory Movements | `inventory_movements` | 188 | 188 distinct IDs | PASS |

Integrity checks reported first sale **2026-07-26**, last sale **2026-11-17**, and **0** cancelled sales. The seeder was made repeatable by topping customers up from 48 to 50 without modifying or deleting existing records.

## 10. Results and discussion — descriptive analytics

The dashboard reports net revenue, gross sales, discounts, transactions, units sold, average order value, growth versus the prior equivalent period, payment mix, product rankings, customer segments, inventory indicators, and financial summary. For the default 30-day window the system computes these values at request time; therefore the case study page displays the live result rather than hardcoding it.

The main interpretation is that observed performance is measured from completed sales only, and current stock is presented as a snapshot. These two facts become the input series for prediction: daily revenue/transactions and per-product recent demand.

## 11. Results and discussion — predictive analytics

Revenue and transaction forecasts use linear regression when `|slope × horizon|` is at least 10% of the average daily value; otherwise a 7-day weighted moving average is used. Product demand uses historical units adjusted by a bounded 30-day trend ratio. Stockout timing divides current stock by recent average daily demand.

The API returns method names, historical period, active selling days, sufficient-data flags, forecast rows, inventory risk rows, and explicit limitations. This makes the estimate auditable instead of presenting a single unexplained number.

## 12. Results and discussion — prescriptive analytics

Recommendations are generated from:

- products with projected stockout risk → restock suggestion with computed reorder quantity;
- products with decreasing demand → sales-focus or promotional review;
- products with excess stock relative to forecast demand → inventory review;
- leading products by revenue → continued sales focus;
- overall growth or decline → business-improvement action;
- aggregate reorder quantities and purchase prices → purchasing plan.

Each recommendation stores the historical evidence text, predicted result, recommended action, reason, priority, and a decision status. The first four statuses are `pending`, `accepted`, `rejected`, and `completed`.

## 13. Conclusions, recommendations, and future work

The five dataset requirements are satisfied with live counts. The three analytics stages are connected through one service snapshot, statistical forecasts are explainable, and recommendations are reviewable and auditable. Before submission, the group should verify `.env` exclusion, rotate any previously exposed credentials, and review the generated recommendations with a manager.

Future improvements may include seasonality decomposition, supplier lead-time variability, forecast accuracy tracking against later actuals, and optional external demand signals. These are deliberately out of scope for the current verified dataset.
