# Presentation guide

## 1. Recommended 8–10 minute flow

| Time | Slide / screen | Talking point |
|---:|---|---|
| 0:00–1:00 | Title | "We extended the existing motor shop system with a connected Business Analytics layer; no existing module was rebuilt." |
| 1:00–2:00 | Problem & objectives | Reactive stock decisions → need for evidence, forecast, and action in one chain. |
| 2:00–3:00 | Dataset verification | Show live counts: 50 products, 50 customers, 59 sales, 138 sale items, 188 movements. Emphasize **actual DB counts**. |
| 3:00–4:30 | Descriptive dashboard | Show filters, revenue trend, AOV, payment mix, product/customer/inventory tables. Say figures are completed sales only. |
| 4:30–5:45 | Predictive dashboard | Show forecast chart and method text. Say linear regression or weighted moving average; no AI-invented numbers. Mention limitations. |
| 5:45–7:00 | Prescriptive dashboard | Show recommendation queue and purchasing summary. Emphasize evidence → predicted result → action, human approval required. |
| 7:00–8:15 | Connected process | Select a product and trace the three cards. Read the handoff text between stages. |
| 8:15–9:00 | AI stage awareness | Ask the AI Assistant to explain a stage; show that it uses verified BA facts and refuses staff-only data. |
| 9:00–10:00 | Results & conclusion | 7/7 forecast tests, 13/13 API tests, role-based access, safe migration/seeding, remaining manual checks. |

## 2. Demo script for `/analytics/process`

1. Open **BA Process** from the sidebar.
2. Leave horizon at 30 days and note the auto-selected focus product.
3. Read the descriptive card's **Output to next stage**.
4. Point to the predictive card's **Input from previous stage** and its forecast rows.
5. Read the predictive card's **Output to next stage**.
6. Point to the prescriptive card's action and stored status.
7. Change the product dropdown, click **Trace workflow**, and show that the whole chain changes.
8. Click **Copy question** and open the AI Assistant to ask the copied question.

## 3. Key phrases to use

- "Connected, not parallel: one service snapshot feeds all three stages."
- "Statistical forecast, not AI estimation: the model receives computed history."
- "Human-in-the-loop: recommendations are stored with pending/accepted/rejected/completed status."
- "Role-safe: staff can verify datasets but cannot read financial forecasts."
- "Safe data prep: we topped up only missing customers and never deleted existing records."

## 4. Phrases to avoid

- "The AI predicts sales" — instead say "The AI explains the statistical forecast."
- "The system automatically reorders stock" — instead say "The system proposes a reorder for human approval."
- "We replaced the old reports" — instead say "We rewrote the existing Reports page as the BA Dashboard."

## 5. Likely questions and answers

**Q: How do you know the datasets are real?**  
A: `GET /api/analytics/datasets` and `db:verify` count rows directly in PostgreSQL and report distinct IDs and integrity dates.

**Q: What if there is not enough history?**  
A: The forecast returns `sufficientData: false` and no invented values. Sparse products return `unknown` rather than a fabricated demand number.

**Q: Can staff see revenue forecasts?**  
A: No. Backend permissions return 403; the frontend also hides the sections.

**Q: Does the AI change any data?**  
A: No. The AI is read-only and advisory. The only new write in the BA feature is the recommendation status decision by an admin.

## 6. Final slide checklist

- Live counts shown.
- Three stages defined and connected.
- Formula names visible.
- Test results shown.
- Manual actions listed: credential rotation, `.env` exclusion check, authenticated UI walkthrough.
