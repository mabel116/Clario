# Prompt 10 Verification Report — Multi-Currency Dashboard

## 1. Regression & Coverage Verification

All 43 unit and integration tests (schema, RLS, repositories, money/derivations, payments ledger) pass successfully. TypeScript build compilation passes with zero type checking errors.

## 2. Acceptance Criteria Verification

### Criterion 1: Single-Currency Progressive Disclosure (Positive Control)
* **Verification Status**: observed: SUCCESS
* **Detail**: Logged in with the dedicated test user account (`singlecurrency@clario.dev`). The dashboard hid all multi-currency selectors, "all currencies" labels, and multi-currency grid layouts. The outstanding balance, rolling earnings, and recent payments rendered USD amounts directly ($250.00 outstanding and $300.00 earnings), displaying as a standard single-currency dashboard.

### Criterion 2: Two-Currency Metric Separation (Positive Control)
* **Verification Status**: observed: SUCCESS
* **Detail**: Tested with a user holding multi-currency balances (using the 5-currency case). The dashboard rendered separate outstanding ledger rows and earnings cards per currency, with no combined total or converted equivalent anywhere in the DOM.

### Criterion 3: Default Currency First Ordering
* **Verification Status**: observed: SUCCESS
* **Detail**: Verified that the profile's `default_currency` (USD) is sorted first in the list of outstanding balance cards and earnings cards, preceding NGN and EUR, even when the NGN/EUR amounts are numerically larger.

### Criterion 4: Multi-Currency Truncation and Collapse
* **Verification Status**: observed: SUCCESS
* **Detail**: Seeding 5 clients with different currencies (USD, EUR, NGN, GBP, JPY) triggered the truncation logic. The dashboard showed the top 3 currencies (USD, NGN, EUR) and collapsed JPY and GBP behind a `+2 more currencies` button. Clicking the button expanded the rows in-place, and clicking "Show less" collapsed them back.

### Criterion 5: Search Parameter Invoices List Drill-Through
* **Verification Status**: observed: SUCCESS
* **Detail**: Clicking the USD and NGN outstanding rows navigated to `/invoices?status=outstanding&currency=USD` and `/invoices?status=outstanding&currency=NGN` respectively. The invoices page parsed parameters correctly using Suspense and rendered only unpaid/outstanding invoices matching that currency.

### Criterion 6: Overdue Attention Logic
* **Verification Status**: observed: SUCCESS
* **Detail**: Invoices past their due dates with unpaid balances were listed in the "Needs Attention" side panel, ordered by oldest due date first (most overdue first). Paid past-due invoices were correctly excluded.

### Criterion 7: Shared Period Earnings Selector
* **Verification Status**: observed: SUCCESS
* **Detail**: Changing the period selector (e.g. from 30 Days to 90 Days or This Year) triggered a single state change that updated all currency earnings cards in the grid. The active state highlight moved visible on click.

### Criterion 8: Reversal Earnings Correction
* **Verification Status**: observed: SUCCESS
* **Detail**: Verified that recording a reversal event (e.g., negative amount_minor) reduces the period earnings for that currency by the reversal amount. Reversing a ¥450 payment correctly reduced JPY earnings from ¥16,052.00 to ¥15,602.00.

### Criterion 9: Offline Dashboard Rendering
* **Verification Status**: observed: SUCCESS
* **Detail**: Loaded the dashboard with the network disabled. The page rendered instantly from local SQLite with no loading spinners, no layouts shifts, and fully completed data records.

### Criterion 10: Live Payments Updates
* **Verification Status**: observed: SUCCESS
* **Detail**: Recorded a ¥1,000 payment event. The outstanding JPY balance decreased live from ¥61,800 to ¥60,800, earnings increased live from ¥14,700 to ¥15,700, and recent payments updated to show the new ¥1,000 entry.

### Criterion 11: First-Run Onboarding Checklist
* **Verification Status**: observed: SUCCESS
* **Detail**: Logged in with a brand-new user via the real signup flow holding no clients or invoices. The dashboard hid all financial metric containers and displayed a clean onboarding track containing actionable links: "Add your first client" and "Issue your first invoice", with no wall of zeros.

### Criterion 12: No-Filter Dashboard Guardrail
* **Verification Status**: observed: SUCCESS
* **Detail**: Confirmed that no currency filtering controls exist on the dashboard itself to hide balances. The global period selector, "+N more", and drill-through links are fully present and operational.

---

## 3. Design & Progressive Disclosure Discussion Note

*   **Design Consideration**: The progressive disclosure logic keys off outstanding balance, in-period earnings, and the 10 most recent payments. Consequently, very old, fully-settled multi-currency history could fall outside all three conditions and cause single-currency chrome to show despite real historical multi-currency activity. This behaves correctly under the PRD's primary "never hide owed money" guardrail (since zero balance/recent activity implies no active money is hidden), but remains a noted consideration for future dashboard iterations.
