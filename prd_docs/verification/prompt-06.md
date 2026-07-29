# Verification Log — Prompt 06 (Clients & Document Links)

## Automated Unit & Integration Tests

The test suite was executed locally using PGlite as the test database harness. All 37 tests (including the two new Epic 1 and Epic 2 repository integration tests) passed successfully.

### Test Execution Command & Output
```text
powershell -ExecutionPolicy Bypass -Command "npx vitest run"

 RUN  v3.2.7 C:/Users/i7/Documents/Clario

 ✓ tests/money_and_derivations.test.ts (15 tests) 121ms
 ✓ tests/schema_and_rls.test.ts (9 tests) 5113ms
 ✓ tests/repositories.test.ts (13 tests) 6319ms

 Test Files  3 passed (3)
      Tests  37 passed (37)
   Start at  01:55:52
   Duration  8.72s
```

The new test cases added to `tests/repositories.test.ts` verify the local database operations and reactive queries:
1. **Epic 1 — Client CRUD**: Verifies offline-style client creation, updating client contact coordinates, soft deletion, visibility filters, and that deleted records are preserved in the database schema for ledger audit purposes (have `deleted_at` set).
2. **Epic 2 — Link CRUD**: Verifies document link additions, label and absolute URL changes, URL prefix validation (`http://` or `https://`), soft deletes, and that links are correctly filtered out of active query subscriptions.

---

## Manual QA Verification

The following manual verification tests were executed in the Chrome browser at a mobile viewport (375px) and desktop layout:

### 1. Clients List & Search (Epic 1)
* **Actions**: Navigated to `/clients`. Typed in the search box to find clients.
* **Observed Behavior**: List query fetches all active records via `useClients()`, sorted alphabetically. Searching filters cards reactively against name, company, and email values.
* **Mobile-First UX**: On viewports ≤ 375px, the master list fills the viewport. Selecting a client triggers a sleek slide-in drawer showing the details. On desktop, it displays in a split master-detail grid.

### 2. Offline Client CRUD (Epic 1)
* **Actions**: Toggled the network adapter to offline. Created a new client (Name: "Client Gamma", Currency: "USD"), edited the phone number, and soft-deleted the profile.
* **Observed Behavior**: All transactions execute instantly. No blocking spinners, loading overlays, or network failure alerts appear. The UI updates the list and details reactively from local SQLite.

### 3. Document Links Management (Epic 2)
* **Actions**: Attached a document link with label "Project Specification" and URL "https://google.com" to Client Beta. Toggled editing to update URL, then clicked the link.
* **Observed Behavior**: Adding links checks for absolute prefixes (`http://` or `https://`) and blocks saving with an alert if missing. The link renders as a clickable anchor with an external link icon, opening successfully in a new browser tab (`target="_blank"`). Soft-delete updates the list instantly.

### 4. Currency Balance Separation (Epic 1.2)
* **Actions**: Created invoices in different currencies (USD, EUR) for the same client. Reviewed outstanding balance in the details panel.
* **Observed Behavior**: The outstanding balances are formatted using `formatMoney` and rendered on separate lines:
  - **USD**: `$1,200.00`
  - **EUR**: `€800.00`
  They are never combined or summarized under a single number.

---

## Static Scan Verification (Confinement constraint)

Enforced that `@powersync` imports are strictly isolated behind the sync boundary:

### Scan Command & Output
```text
git grep "@powersync" -- src/

src/app/dev/sync/page.tsx:import { useQuery, usePowerSync } from '@powersync/react';
src/lib/sync/connector.ts:import { PowerSyncBackendConnector, CrudTransaction } from '@powersync/web';
src/lib/sync/db.ts:import { PowerSyncDatabase } from '@powersync/web';
src/lib/sync/db.ts:        worker: '/@powersync/worker.js'
src/lib/sync/db.ts:        worker: '/@powersync/worker.js'
src/lib/sync/provider.tsx:import { PowerSyncContext } from '@powersync/react';
src/lib/sync/schema.ts:import { Schema, Table, column } from '@powersync/web';
```
* **Findings**: `@powersync/*` SDK references exist exclusively within `src/lib/sync/` (with the exception of `src/app/dev/sync/page.tsx`, which is a developer diagnostics dashboard). The feature pages and client repositories import only native hooks/models, ensuring clean engine decoupling.
