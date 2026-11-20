# AI integration with Business Analytics

## 1. Principle

The Groq integration remains backend-only. Forecasts and recommendations are computed by deterministic services; the AI model only explains verified figures and stage relationships. It cannot query the database directly, execute code, or invent values.

## 2. Stage-aware context

`backend/src/services/ai-context.service.ts` now includes `facts.businessAnalytics` in the **admin** context by calling `getBABundleForAI()`. The object contains:

- `descriptive` — range, revenue, transactions, AOV, growth, best/least sellers, low/out-of-stock counts, gross profit and margin;
- `predictive` — historical range, horizon, method and description, expected revenue/transactions, 7/30/90-day forecast periods, product demand ranking, inventory risks;
- `prescriptive` — generated recommendations with evidence, predicted result, action, reason, priority, status, purchasing summary;
- `workflow` — the three explicit stage definitions.

Staff context does **not** include `businessAnalytics`; financial and forecast values remain admin-only.

## 3. Prompt rules

`backend/src/services/ai-prompt.service.ts` was extended with explicit rules:

- Descriptive answers "what happened?" using measured completed records.
- Predictive answers "what is likely?" using statistical estimates; forecasts are never guaranteed.
- Prescriptive answers "what should we do?" using forecast plus current stock; recommendations require human approval.
- When `businessAnalytics` exists, use it for all three stages and never invent missing numbers.
- Forecast answers must state period, method, and at least one limitation.
- Recommendation answers must state the supporting historical figure and predicted result, and remind the user that nothing is executed automatically.
- Staff prompt rules continue to block revenue, profit, margins, forecasts, valuation, and strategic plans.

## 4. Fallback answers

When the provider is unavailable or the question is recognized as a stage-explanation request, deterministic answers are built from the verified `businessAnalytics` object. Examples include definitions of descriptive, predictive, and prescriptive analytics plus the relevant figures and limitations. If no recommendation exists, the fallback says so instead of fabricating one.

## 5. Alerts

`buildAdminAlerts` now surfaces:

- critical stockout risks from the predictive rows;
- the number of pending/admin-review recommendations from the prescriptive rows.

Alerts carry figures taken from the same snapshot and are labeled as advisory.

## 6. Data privacy

- Customer PII is excluded from AI context.
- Staff receive operational data only; blocked intents are rejected before context building.
- Audit actions for AI queries and policy blocks remain unchanged.
- No credential values are ever placed in prompts, fallbacks, logs, or documentation.

## 7. How to demo

As admin, ask:

1. "Explain descriptive analytics for this shop."
2. "What does the predictive stage forecast for the next 30 days?"
3. "Which prescriptive recommendations should I review and why?"
4. "How are the three stages connected?"

As staff, ask the same questions and confirm that financial/forecast details are refused with the existing role-safe message.
