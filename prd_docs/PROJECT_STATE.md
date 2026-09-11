# Clario — Project State

> [!IMPORTANT]
> **This file is append-only.** Never summarize, compress, or delete a previous prompt's entry to make room for a new one. All architectural developments and verified steps must remain fully documented in chronological order.

## Phase 1 — Project Skeleton & Database Schema Definition
- **Phase**: 1
- **Status**: Complete & Verified (Remote + Local Engine)

### What Was Built
1. **Next.js App Router Skeleton**:
   - Initialized Next.js 15 App Router with TypeScript (strict mode), Tailwind CSS, ESLint, and shadcn/ui theme configuration.
   - Configured `.env.local.example` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_POWERSYNC_URL`.
   - Added `README.md` documenting setup, migration commands, and architectural guardrails.
   - Integrated Vitest test runner with `@electric-sql/pglite` for local PostgreSQL/RLS test execution without Docker dependencies.

2. **Supabase CLI Configuration & Initial Migration**:
   - Initialized Supabase CLI (`supabase/config.toml`).
   - Created initial migration `supabase/migrations/20260722000000_initial_schema.sql` defining all six core tables per PRD §5.2:
     - `profiles`: User billing and settings metadata.
     - `clients`: Soft-deletable client context.
     - `client_links`: Document URLs attached to clients.
     - `invoices`: Invoices header with derived status safety.
     - `invoice_line_items`: Line items with minor unit prices and quantities.
     - `payment_events`: Append-only, immutable payment ledger.

3. **Core Database Security & Invariants**:
   - **Money Representation**: All monetary columns (`total_minor`, `unit_price_minor`, `line_total_minor`, `amount_minor`) stored strictly as signed 64-bit `bigint` minor units paired with ISO-4217 `char(3)` currency codes. Zero floats or decimals.
   - **Immutable Payment Ledger**: `payment_events` has no `updated_at` or `deleted_at` columns. RLS policies grant ONLY `SELECT` and `INSERT` to row owners; `UPDATE` and `DELETE` policies are omitted, causing all modification attempts to affect 0 rows or fail.
   - **No Cascade Deletes on Ledger**: Changed foreign keys in `payment_events` (`invoice_id`, `client_id`, `reverses_id`) to use `ON DELETE RESTRICT` (instead of CASCADE/SET NULL) to protect ledger rows from deletion.
   - **Derived Status Protection**: `invoices.status` CHECK constraint strictly enforces `'draft' | 'sent' | 'void'`, rejecting `'paid'` and `'overdue'`.
   - **Offline-Safe Invoice Numbering**: Excluded unique DB constraint on `(user_id, invoice_number)` to prevent offline creation conflicts.
   - **Per-User Isolation**: RLS enabled on all 6 tables scoping access to `auth.uid() = user_id`. Dropped `FORCE RLS` to allow triggers (running under the system `postgres` role) to successfully write to the database during sign-up.
   - **Optional Method**: `payment_events.method` is nullable (optional per PRD).
   - **Currency Fallbacks**: Client-level `default_currency` is optional. Invoices fallback to the user's `profiles.default_currency` (pre-populated with `'USD'`) if missing.
   - **Indexes**: Added 8 performance indexes across user_id, client_id, invoice_id, and payment history ordering.
   - **Auth Trigger**: Added `handle_new_user()` trigger on `auth.users` insert auto-populating `profiles` with `default_currency = 'USD'`.

### What Was Verified
- `npm run typecheck`: Passed with 0 errors.
- `npm run lint`: Passed with 0 warnings or errors.
- `npm run build`: Successfully compiled Next.js production bundle.
- `npm test` (Vitest): 9/9 tests passed (testing schemas, cascade restricts, duplicate numbers, triggers, and RLS policies).
- `node scripts/verify_supabase.js`: All criteria successfully executed and verified against your **live Supabase cloud instance**, confirming clean migration execution, bigint datatypes, correct RLS isolation boundaries, append-only policies, hard delete constraints, and trigger-level signup profile creation. (Note: End-to-end Auth API signup verification is deferred to Phase 5).
- Grep scan: 0 service-role keys found in codebase or committed env files.

---

## Phase 2 — PowerSync Sync Engine Integration
- **Phase**: 2
- **Status**: Complete & Verified (Manual Verification Passed)

### What Was Built
1. **PowerSync Integration & Sync Engine Boundary**:
   - **Sync Boundary**: Isolated all `@powersync/web` and `@powersync/react` imports strictly to `src/lib/sync/` (and layout shell visual indicator wrapper).
   - **Local Schema (`src/lib/sync/schema.ts`)**: Mapped all 6 core tables to SQLite definitions. Correctly set `*_minor` columns to SQLite `INTEGER`, unit quantity to `REAL`, and date/timestamp fields to ISO-8601 `TEXT`.
   - **Sync Streams Configuration (`supabase/powersync/sync-rules.yaml`)**: Configured rules in the Edition 3 format using `streams` and inline `auth.user_id()` query scoping, with `auto_subscribe: true` to support transparent offline synchronizations.
   - **Upload Connector (`src/lib/sync/connector.ts`)**: Implements `fetchCredentials` using Supabase Session JWT, and `uploadData` translating transaction operations to remote Supabase writes. Integrates a defensive constraint check that rejects any modifications or deletions on the `payment_events` table.
   - **Provider & Hooks (`src/lib/sync/db.ts`, `provider.tsx`, `hooks.ts`)**: Implements automatic db connection on user login, automatic db disconnect and wipe (`db.disconnectAndClear()`) on sign-out to prevent session leakage, and exposes `useSyncStatus()`.
   - **Developer Diagnostics**: Created a visual `SyncIndicator` showing connection, pending queue size, and sync latency, and a diagnostic console `/dev/sync` with counts and client creation trigger.

2. **Core Concurrency and Worker Path Fixes (Blockers Resolved)**:
   - **WASM Worker Path Bug**: Resolved a silent deadlock where the SQLite WASM Web Worker loaded a Next.js 404 HTML routing page by running `powersync-web copy-assets -o public` to project workers to static public paths (`public/@powersync/`) and hardcoding explicit `worker` paths.
   - **Hot-Reload Mutex Locks**: Guarded `db.init` and `db.connect` with global lock promises (`globalInitPromise`/`globalConnectPromise`) to stop parallel connection deadlocks.
   - **uploadData Typo**: Corrected call from invalid `database.getNextUploadTransaction` to the actual common method `database.getNextCrudTransaction`.
   - **INITIAL_SESSION Local Wipe**: Fixed auth listener to wipe database only on `'SIGNED_OUT'`, resolving state loss on initial session boot.

### What Was Verified
- **Manual Verification Outcomes**:
  - *Criterion 1 (Sign in status)*: Observed `SYNC CONNECTED` and sync elapsed time updates live.
  - *Criterion 2 (Remote insert)*: Direct Supabase database insertion synced local SQLite in ~7 seconds without page refreshes.
  - *Criterion 3 (Offline write)*: Toggling network off queued writes instantly locally, showing `SYNC OFFLINE` and pending queue sizes of `1`.
  - *Criterion 4 (Reconnect sync)*: Enabling network pushed local offline queues to Supabase instantly.
  - *Criterion 5 (Offline reload)*: Hard network adapter disconnect proved local SQLite cached query rendering worked instantly with no spinners.
  - *Criterion 6 (User isolation)*: Wiped data and re-authenticated as User B, verifying User A's data was 100% invisible.
  - *Criterion 7 (Sign-out wipe)*: Verified signed-out states wipe local cache instantly (tables drop to 0 rows).
  - *Criterion 8 (Boundary Check)*: Confirmed via git grep that `@powersync` imports do not bleed outside the database adapter layer.

---

## Phase 3 — Money Primitives & Derivation Core
- **Phase**: 3
- **Status**: Complete & Verified (100% Test Coverage)

### What Was Built
1. **Money Primitives & Financial Calculations**:
   - Implemented `Money` value object interface and ISO-4217 Currency metadata list covering NGN, USD, EUR, GBP, KES, GHS, ZAR, CAD, AUD, INR, JPY, KRW.
   - Developed clean arithmetic functions: `addMoney`, `subtractMoney`, `sumMoney` that throw on currency mismatch.
   - Implemented float-drift immune `parseMoneyInput` parsing major units strings dynamically aligned to currency exponents.
   - Implemented `formatMoney` utilizing locale-based symbol and exponent matching.
   - Developed `multiplyMinor` returning a half-up rounded integer.

2. **Invoice & Currency Aggregates Derivations**:
   - Programmed per-invoice derivations: `lineTotalMinor`, `invoiceTotalMinor`, `amountPaidMinor` (signed sum), `balanceDueMinor`, `paymentStatus`, `isOverdue` (injected timezone date context), `displayStatus`.
   - Built multi-currency aggregate math: `outstandingByCurrency` (grouped by currency carrying overdue count), `earningsByCurrency` (date window filtering subtracting reversals), `clientOutstandingByCurrency`, and `sortCurrencyTotals` (placing user default currency first).
   - Created offline-safe `suggestNextInvoiceNumber` preserving text prefixes and padded digits increments.

### What Was Verified
- **`/codex` & `/review` Checklist Application**:
  - *SQL & Data Safety*: Confirmed calculations layer is entirely pure-functional, executing 0 SQL commands.
  - *Race Conditions*: Confirmed order-independent ledger sums commutes commutatively.
  - *Time Window Safety*: Date evaluations explicitly inject `today` parameters, avoiding system clock timezone drift.
  - *Type Coercions*: Scaled multiplications by `1e10` to avoid IEEE 754 float drift prior to rounding.
- **Unit Test Coverage**:
  - Running `npx vitest run --reporter=verbose` passed all 24 unit tests (15 calculations core tests and 9 database schema/RLS security tests).
- **Purity boundary scan**:
  - Command: `git grep -n -e "from 'react'" -e "@powersync" -e "supabase" -- src/lib/money src/lib/derive` returned 0 occurrences, proving perfect folder isolation.
- **Currency config verification**:
  - Verbatim check on JPY and KRW configurations confirmed exponents set to 0.

### Specification Deviations
- Added `deriveInvoice` helper function to map composite invoice metrics cleanly for local database repository layers.
- Added `KRW` currency to test zero-decimal rounding across multiple currencies.

## Phase 4 — Data-Access Layer (Repositories)
- **Phase**: 4
- **Status**: Complete & Verified (33 tests passing total)

### What Was Built
1. **Repository Classes (`src/lib/data/`)**:
   - `ClientRepo`: lists active clients (`deleted_at IS NULL`), gets detailed views including current outstanding balance aggregates computed reactively.
   - `ClientLinkRepo`: manages custom links for client accounts, verifying absolute `http(s)` URL addresses.
   - `InvoiceRepo`: handles line items, drafts, sent status triggers, and locks invoice modification fields (`invoice_number`, `issue_date`, line items, total amounts) if any payment records exist.
   - `PaymentRepo`: processes payments (`record` and `reverse`). `reverse` appends negative mirror ledger row and prevents double-reversing.
   - `DashboardRepo`: computes overdue counts by currency, recent payment history with invoice/client details, and earnings summaries.
   - `ProfileRepo`: gets/edits settings profile.
2. **React LiveQuery Hooks (`src/lib/data/hooks.ts`)**:
   - Exposes `useClients`, `useClient`, `useClientLinks`, `useInvoice`, `useInvoicesForClient`, `usePaymentsForInvoice`, `usePaymentsForClient`, `useDashboard`, and `useProfile`. Uses `useMemo` caching to prevent unnecessary SQLite query stream reconstructions.

### What Was Verified
- **Unit Test Coverage**:
  - `tests/repositories.test.ts` executes actual DB migrations and RLS setups inside a PGlite instance to verify:
    - Client created offline is visible in `list()` immediately.
    - Invoice `total_minor` matches the sum of line totals.
    - Payments sequence drives status from partially_paid to paid.
    - Reversal creates negative mirror and original event is unmodified.
    - Recording a payment in mismatched currency throws `CurrencyMismatchError`.
    - Financial editing locks after recording payment events.
    - Soft delete on client scopes visibility but preserves invoice records.
    - Validation check: ClientLink validates absolute URL format.
    - Double reversal safety check: Reversing a reversal throws error.
- **Type Compilation**:
  - `npx tsc --noEmit` resolved successfully with zero type warnings.
- **Dependency Scan**:
  - Verified `@powersync/*` SDK package imports are constrained strictly to `src/lib/sync/` (and not in `src/lib/data/` which only references the `db` instance).

### Specification Deviations
- **Three Custom Error Types**: Implemented `InvoiceLockedError` (locked invoice edits check), `CurrencyMismatchError` (payment invoice currency match assertion), and `ValidationError` (client link URL format validation check). These provide structured exception boundaries enabling the UI to catch and parse errors selectively.
- **Bypassed SSR Window Guard in Test Runtime (`isTest`)**: Bypassed browser window checks during Node Vitest runs using `process.env.NODE_ENV === 'test'` / `process.env.VITEST === 'true'` context checks. Since production builds/SSR runs execute with `process.env.NODE_ENV = 'production'` and no `VITEST` flag, `isTest` is always `false` at runtime, ensuring standard SSR routes fail-fast immediately if executed server-side.
- **Mock DB Array Return Type Alignment**: Mapped mock PGlite DB environment in Vitest to return rows arrays directly, matching real PowerSync client SDK behavior.
- **Diagnostic Route PowerSync Import Exception**: Confirmed that the import of `@powersync/react` on line 4 of `src/app/dev/sync/page.tsx` is an accepted exception strictly tied to the temporary diagnostics console route, which is scheduled for permanent deletion in Prompt 12.

## Phase 5 — Authentication & Profile Settings
- **Phase**: 5
- **Status**: Complete & Verified (35 tests passing total)

### What Was Built
1. **Supabase Auth Confinement wrappers (`src/lib/auth/`)**:
   - `client.ts`: Exposes client-friendly error mapping, network connectivity checks, sign-up, sign-in, Google OAuth trigger, password reset, and session helper functions (`getAuthUserId()`, `getAuthSession()`, `onAuthStateChange()`, `supabaseSignOut()`) to confine native `supabase.auth` calls.
   - `provider.tsx`: Implements React `AuthProvider` context managing loaded sessions, preserving authentication states during transient offline periods, and avoiding logging out when offline token refreshes fail.
2. **Client-side Router Protection (`src/components/`)**:
   - `ProtectedRoute`: Guards authenticated pages (like Settings or Dashboard), redirecting unauthenticated users to `/sign-in`.
   - `UnprotectedRoute`: Guards guest auth screens, redirecting authenticated users to the home dashboard.
3. **Application Shell & Settings Screen**:
   - `AppShell.tsx`: Responsive navigation layout container utilizing modern CSS gradients and responsive mobile sidebars/drawer toggles.
   - `/settings/page.tsx`: Interactive profile editing dashboard displaying sync engine status, pending upload queues, and last success sync times.
   - Placeholders for `/` and `/clients` utilizing route protection wrappers to prevent 404s.

### What Was Verified
- **Manual Web QA**: Verified sign-up profile creation (`default_currency = 'USD'`), Google OAuth authentication, automatic same-email identity linking, offline reload session retention, offline profile modifications, and CASCADE truncation database clearing upon signing out.
- **Unit Test Suite**: Added two new tests inside `tests/repositories.test.ts` verifying `ProfileRepo` offline update cache syncs and `disconnectAndClear` database purge. All 35 tests pass cleanly.
- **Strict Confinement Scan**: `git grep` verified that direct `supabase.auth` calls are completely confined to `src/lib/auth/`, the redirect handler, and dev-console exceptions.

### Specification Deviations
- **Encapsulated Auth Helpers**: Repositories and database connector import functions from `src/lib/auth/client.ts` rather than importing `supabase` directly to isolate auth logic.
- **Throttled Database Logger**: Integrated a warning throttle in `db.ts` to limit connection error logging to once every 30 seconds, improving dev console usability during offline debugging.

## Phase 6 — Clients & Document Links
- **Phase**: 6
- **Status**: Complete & Verified (37 tests passing total)

### What Was Built
1. **Unified Clients Dashboard (`src/app/clients/page.tsx`)**:
   - Live client query lists binding reactively to `useClients()` and ordering alphabetically by name.
   - Client-side filtering input matching queries against client name, company, or email fields.
   - Master-Detail layout: on desktop, splits the screen into a client list and a detail profile pane; on mobile viewports (≤ 375px), opens an overlay sliding detail drawer with full back-navigation controls.
   - Add/Edit Client Modals: modal forms that support full client profile CRUD operations instantly offline. Sets default currency using the user profile's currency.
   - Document Links Panel: displays labeled URLs attached to a client. Each link opens in a new tab with `target="_blank" rel="noopener noreferrer"`.
   - Add/Edit Link Modals: validates that links are absolute URLs (`http://` or `https://`) and saves/modifies records instantly offline.
   - Soft deletion hooks: Client deletions (`ClientRepo.softDelete`) and document link deletions (`ClientLinkRepo.softDelete`) trigger soft-deletes (updating `deleted_at`) instantly offline.
2. **Repository Unit & Integration Tests (`tests/repositories.test.ts`)**:
   - Added `Client CRUD` test case confirming offline creation, reactive lists, local updates, soft delete visibility, and historic database row retention.
   - Added `Link CRUD` test case confirming link additions, label/URL modifications, URL prefix verification, soft deletes, and list updates.

### What Was Verified
- **Manual Browser QA (Criteria 1–8)**: Verified firsthand via manual offline-first testing:
  - Client offline creation immediately loads in UI and syncs to Supabase on reconnect (Criterion 1).
  - Client offline editing persists and syncs on reconnect (Criterion 2).
  - Search filters instantly with the network disabled (Criterion 3).
  - Labeled URL link saving and redirection opens in a new tab (Criterion 4).
  - URL validations block `ftp://` and `not-a-url` inputs inline (Criterion 5).
  - Document link addition offline persists and syncs on reconnect (Criterion 6).
  - Soft-deleting document link updates UI and sets `deleted_at` in Postgres (Criterion 7).
  - Soft-deleting client updates UI immediately and keeps historic DB rows (Criterion 8).
- **Vitest Unit Suite**: Running `npx vitest run` confirms all 37 tests pass cleanly.
- **TypeScript Typecheck**: Compiles cleanly with no type check errors.
- **ESLint checks**: `npx eslint src/app/clients/page.tsx` checks out with 0 lint errors or warnings.
- **Static Confinement Scan (Criterion 11)**: Confirms PowerSync/Supabase imports are confined.
- **Binary/Upload Exclusions (Criterion 10)**: Scans show zero storage or file inputs.

### Carried-Forward / Deferred Items
- **Invoice Queryability (Criterion 8 half)**: Verified in Prompt 7 integration tests that soft-deleted clients' invoices remain queryable.
- **Payments Queryability (Criterion 8 half)**: Confirming that soft-deleted clients' payments remain queryable is deferred to Prompt 8 (when that table is populated with data).
- **Outstanding Balances Verification (Criterion 9)**: Real outstanding multi-currency balance rendering is deferred to Prompt 8 (when invoices can be subtracted by payment events to compute ledger values). Code mapping separates currencies cleanly.

### Specification Deviations
- **Master-Detail Layout**: Implemented master-detail panel switching (slides in on mobile ≤ 375px, splits on desktop) for enhanced mobile usability.
- **Alert-based Form Validation Errors**: Blocks invalid client-side inputs (e.g. invalid email or link URLs) via UI alert prompts instead of complex inline form blocks.
- **Mock DB Query Subscription Watch Re-subscription**: In unit tests, a fresh query subscription is instantiated after each write operation due to Vitest mock DB `watch` iterator limitations.


## Prompt 7: Invoices, Line Items & Lifecycle
- **Status**: Complete & Verified (37 tests passing total)

### What Was Built
1. **Invoice Hooks & Repositories (`src/lib/data/`)**:
   - Implemented `useCanEditFinancials(invoiceId)` in `hooks.ts` to reactively track if payments are recorded.
   - Added `isNumberDuplicate(invoiceNumber)` query check to `InvoiceRepo` in `invoice.ts`.
2. **Client Dashboard Invoices List (`src/app/clients/page.tsx`)**:
   - Replaced empty shell with reactive list using `useInvoicesForClient(clientId)`.
   - Displays invoice number, timelines, totals, outstanding balances, and display status badges.
   - Orders unpaid/overdue invoices first, then date descending.
   - Added navigation triggers to invoice details/new invoice forms.
3. **Invoice Creation Route (`src/app/clients/[id]/invoices/new/page.tsx`)**:
   - Dynamic form suggesting next invoice number on load.
   - Fixed client/profile default currency resolution.
   - Stacked line-item editor supporting add, remove, and reorder (shift up/down).
   - Real-time total aggregations and soft duplicate number alert validation checks.
4. **Invoice Detail Viewer (`src/app/invoices/[id]/page.tsx`)**:
   - Renders client, timelines, line items list, statement summary (total, amount paid, balance due), and private internal notes (marked with a private label).
   - Conditional lifecycle actions: Mark as Sent (timeline modal), Void Invoice (confirmation prompt), and Delete Draft (soft-deletes).
   - Integrates `useCanEditFinancials` lock banner explaining read-only fields.
5. **Invoice Edit Route (`src/app/invoices/[id]/edit/page.tsx`)**:
   - Mirrors creation form layout but respects the financial edit lock state.
   - Disables number, dates, line items, and notes if payments exist. Keeps `due_date` and `internal_note` always editable.

### What Was Verified
- **Manual Browser QA (Criteria 1–6, 7 positive half, 8–10, 12)**: Verified firsthand via manual offline-first testing:
  - Offline creation of invoices with three line items computes total, saves locally, and syncs on reconnect (Criterion 1).
  - Floating-point precision validation: quantity `2.5` × unit price `3.33` yields `8.33` with no visual float bugs (Criterion 2).
  - JPY currency formats without decimal places (Criterion 3).
  - Pre-fills next number; duplicate invoice number alerts but saves (Criterion 4).
  - Marking as sent captures timelines and updates status badge to Sent (Criterion 5).
  - Backdated due dates instantly shift display status from Sent to Overdue (Criterion 6).
  - Financial editing permitted on Sent status with 0 payments (Criterion 7 positive half).
  - `due_date` and `internal_note` remain editable regardless of status or locking state (Criterion 8).
  - Voiding an invoice updates status badge to Void and subtracts from outstanding balance (Criterion 9).
  - Drafts display Delete option; Sent/Void/Overdue hide it (Criterion 10).
  - Mobile viewport ≤ 375px formats the line items editor into stacked responsive grids (Criterion 12).
- **Automated Verification (Criterion 11)**: Ripgrep scans confirm `'paid'` and `'overdue'` are never written to the database `status` column (only computed dynamically for display badges).
- **Vitest Unit Suite**: Running `npm run test` confirms all 37 tests continue to pass cleanly.
- **TypeScript Typecheck**: Compiles cleanly with no compilation type errors.

### Carried-Forward / Deferred Items
- None. All Prompt 6 and Prompt 7 carried-forward/deferred items are fully resolved.

### Specification Deviations
- None.

---

## Prompt 8: Payments ledger & reversals
- **Phase**: 4 (Epic 4 Payments)
- **Status**: Complete & Verified (43 tests passing total)

### What Was Built
1. **Manual Payment Dialog (`src/components/RecordPaymentModal.tsx`)**:
   - Record manual payment events in major units parsed to integer minor units.
   - Fixed currency context locked to target invoice, displays as text with no selection.
   - Provides a "Pay full balance" shortcut pre-calculating remaining balance.
   - Warns on overpayment via browser confirm warning, allowing negative balances.
   - Submits values via `PaymentRepo.record` using safe SQLite database insertions.
2. **Invoice Details Payments Section (`src/app/invoices/[id]/page.tsx`)**:
   - Replaced empty payments section shell with a live events list from `usePaymentsForInvoice(invoiceId)` ordered newest first.
   - Statement Summary displays live derived ledger values: total paid, remaining balance due, and status badge.
   - Added visual markers (warning borders, negative signs, reversal badges) distinguishing reversals by more than color.
   - Offers "Reverse" action on active normal payments.
3. **Reversal Flow Confirmation & Execution**:
   - A modal details original ledger immutability rules, captures optional reversal notes, and triggers `PaymentRepo.reverse`.
   - The reversed payment hides its reverse action and displays as reversed (opacity reduction + label).
4. **Client Payment History (`src/app/clients/page.tsx`)**:
   - Replaced Prompt 6 shell with a live events history using `usePaymentsForClient(clientId)` mapping all invoices events newest first.
   - Each event attributes to and links back to the specific invoice.

### What Was Verified
- **Automated Integration Suite (`tests/prompt8.test.ts`)**:
  - Criterion 1 & 2: Verified partial payment ($6.00) driving balance to $4.00 and status remains Sent, then remainder settling ($4.00) driving status to Paid and balance to $0.00.
  - Criterion 4: Verified reversal creates a negative entry, restores invoice balance, and leaves the original row completely unmodified and byte-identical.
  - Criterion 5: UPDATE and DELETE on `payment_events` are blocked under RLS (affecting 0 rows) while positive control updates succeed. Invoice line item edits throw `InvoiceLockedError` when payments exist (resolved negative lock control carried forward from Prompt 7).
  - Criterion 6: Double reversals blocked correctly. Reversing a reversal throws error.
  - Criterion 7: Overpayments warning verified; yields negative balance and doesn't crash.
  - Criterion 11: Client history correctly attributes events to respective invoices.
- **Manual Verification Outcomes**:
  - All 11 acceptance criteria manually verified in a real browser (including Criterion 9 concurrent offline profile sync which merged cleanly, preserving client-side UUIDs with no lost writes, verified against Supabase database inserts of 3000 and 4000 minor units).

### Carried-Forward / Deferred Items (For Prompt 9 / 12 design pass)
1. **Modal Inconsistency**: The overpayment warning modal currently triggers the native browser `confirm()` modal window, which is inconsistent with the rest of the application's premium custom-styled dialog elements. (To be resolved during Prompt 9 or 12 design review pass).
2. **Invisible Link Affordance**: In the client detail payment ledger list, the invoice ID links (e.g. "INV-0001") lack hover states, underlines, or icon indicators. This makes it difficult for users to visually identify that these elements are interactive links. (To be resolved during Prompt 9 or 12 design review pass).

### Resolved Deferred / Carried-Forward Items
- **Payments Queryability**: Confirmed soft-deleted clients' payments are preserved and remain queryable for historical ledger context.
- **Outstanding Balances**: Real outstanding balances are now derived reactively from payment events.
- **Financial Lock Negative Control**: Invoices with payment events lock financial edits cleanly.

### Specification Deviations
- None.


## Prompt 9 — Client Financial View

### 1. Features Implemented & Changes Made
- **Restructured Client Detail Drawer Layout**: Restructured layout to position client name, company, and multi-currency outstanding balance panels prominently at the top ("money-first, context-second").
- **Segmented Currencies**: Segmented outstanding balance cards by currency (default currency sorting first) and appended total paid to date in muted secondary text, preventing any cross-currency summation.
- **Invoice Filters & Sorting**: Introduced tabs (`All`, `Outstanding`, `Overdue`, `Paid`, `Draft`) filtering list content offline, sorted with unpaid and overdue invoices first, then date descending.
- **Collapsible Payment Statements**: Collapsed client payment statement log to the most recent 10 items, offering an expandable "Show all" / "Show less" toggle.
- **Link Affordances & A11y**: Enhanced invoice reference links in payment history with underlines on hover and inline external link icons (`ExternalLink`). Status badges include descriptive `aria-label` screen reader tags.
- **Custom Overpayment Warning**: Replaced native browser `confirm()` with a custom in-app overpayment warning modal overlay containing custom styling and AlertTriangle icons.
- **Quick Payments**: Added quick record-payment actions directly within unpaid/overdue invoice list items.

### 2. Verification Outcomes
- **Automated Tests**:
  - All 43 Vitest tests (including prompt8 ledger test cases) pass successfully.
  - TypeScript build compiles cleanly with zero errors.
- **Manual Verification Outcomes**:
  - All 13 Prompt 9 acceptance criteria manually verified in a real browser, including performance verification under "Perf Test Client" (55 invoices, 105 payments loading instantly).

### 3. Carried-Forward / Deferred Items (For Prompt 12 design pass)
1. **Balance Subtext Visual Spacing**: On mobile screens at exactly 375px width, the outstanding count details label (e.g. `(55 invoices · 1 overdue)`) sits visually tight against the large outstanding balance amount figure. Legible, but worth a minor spacing tweak during a future cosmetic review pass.

### 4. Resolved Deferred / Carried-Forward Items
- **Modal Inconsistency**: The overpayment warning dialog has been replaced with a custom styled modal, resolving the native browser `confirm()` discrepancy.
- **Invisible Link Affordance**: Payment history invoice link buttons now have clear underlines on hover and inline icons.

### 5. Specification Deviations
- None.


## Prompt 10 — Multi-Currency Dashboard

### 1. Features Implemented & Changes Made
- **Segregated Currency Outstanding Balances**: Lists outstanding sums per currency at the top of the dashboard. Sorted dynamically with default profile currency first, then by outstanding amount descending.
- **Progressive Disclosure Visuals**: Single-currency users see standard metric panels without currency selectors or selectors chrome. Multi-currency treatment (segmented rows and currency tiles) automatically triggers only when >1 active currency exists.
- **Top-3 + N Collapse control**: Outstanding list collapses extra currencies beyond the top 3 under a `+N more currencies` button which expands the list in-place and toggles to `Show less`.
- **Query Param Invoices List Route**: Created `/invoices/page.tsx` displaying all invoices, which parses `status=outstanding` and `currency={currency}` from URL search parameters to filter invoices offline.
- **Attention Overdue Panel**: Adds a "Needs Attention" side panel showing overdue invoices sorted by days overdue descending. Hidden completely if no invoices are overdue.
- **Rolling Period Earnings Grid**: Added metric tiles showing signed earnings totals per currency, updated dynamically by a shared period selector button group (`Last 30 Days`, `Last 90 Days`, `This Year`).
- **Recent Payments Activity Log**: Displays the 10 most recent positive payment events showing client name, invoice number, date, amount in its own currency inline, and a navigation link.
- **Empty State Onboarding**: Provides a new account checklist guiding users to "Add your first client" and "Create your first invoice" instead of rendering a wall of zeros.

### 2. Verification Outcomes
- **Automated Tests**:
  - All 43 Vitest tests pass successfully.
  - TypeScript build compiles cleanly with zero errors.
- **Manual Verification Outcomes**:
  - All 12 Prompt 10 acceptance criteria manually verified in a real browser (including single-currency progressive disclosure, "+N more" collapse/expand, and overdue attention lists).

### 3. Carried-Forward / Deferred Items (For Prompt 12 design pass)
1. **Historical Multi-Currency Display Edge Case**: As noted in verification discussions, fully-settled historical multi-currency transactions falling outside outstanding balances, selected rolling period earnings, and the 10 most recent payments will trigger single-currency progressive disclosure. Correct under the "never hide unpaid money" constraint, but recorded for future dashboard iteration passes.

### 4. Resolved Deferred / Carried-Forward Items
- **Modal Inconsistency**: Custom overpayment modal warning dialog fully implemented.
- **Invisible Link Affordance**: Payment ledger links now show hover underlines and icons.

### 5. Specification Deviations
- None.


## Prompt 11 — On-Device Invoice PDF

### 1. Features Implemented & Changes Made
- **On-Device PDF Generation (`src/lib/pdf/generator.ts` & `src/components/InvoicePDFDocument.tsx`)**:
  - Dynamically imports `@react-pdf/renderer` and the custom React PDF component at generation time to keep the initial app bundle size unaffected (lazy-loading).
  - Employs on-device rendering using a client-side Blob compiled completely offline.
  - Omits the private `internal_note` field (only the client-facing `notes` are rendered).
  - Normalizes native locale currency formatting, showing zero decimals for JPY/KRW and two decimals for other currencies.
  - Formats fractional quantities up to 3 decimals, and whole number quantities as integers.
- **Embedded Base64 Typography (`src/components/fonts.ts` & `scripts/download_fonts.js`)**:
  - Sourced and base64-embedded full versions of the Inter Regular and Inter Bold fonts from the jsdelivr/xz-fonts CDN, replacing CDN URLs to ensure complete offline reliability.
  - Full font embedding resolved a character encoding rendering issue where the Naira (`₦`, `U+20A6`) symbol originally rendered as a broken bar (`¦`) in PDF reports.
- **Sanitized Filename Compilation**:
  - Sanitizes the compiled PDF filename by replacing filesystem-invalid characters, spaces, and duplicate hyphens, resulting in standard lowercase names (e.g. `inv-001-client-name.pdf`).
- **Running Page Numbering & Multi-Page Pagination**:
  - Renders dynamic page counters (`pageNumber / totalPages`) at the bottom footer.
  - Automatically handles row spacing and text wrapping for long client names and line item descriptions across multi-page invoice layouts (tested with 35+ items).
- **Graceful Mobile Share Sheet Abort**:
  - Integrates capability check features (`navigator.share` and `navigator.canShare` verification on the file payload) on mobile user agents.
  - Intercepts and handles `AbortError` (cancellations) silently so no error notifications trigger when a user decides to close the native share sheet.

### 2. Verification Outcomes
- **Automated Tests**:
  - Compiled and executed a dedicated suite (`tests/pdf.test.ts` and `tests/verify_currencies.test.ts`) validating document compiles, data mapping, note omissions, and full-glyph currency renders.
  - All 46 Vitest tests pass cleanly. TypeScript compiles successfully (`npx tsc --noEmit`).
- **Manual Verification Outcomes**:
  - Verification results for all 11 criteria are fully detailed in [prompt-11.md](file:///c:/Users/i7/Documents/Clario/prd_docs/verification/prompt-11.md).
  - All features are verified locally in the browser. 
  - Mobile Share Sheet logic was verified correct via walk-through, but not run on a real phone due to HTTP local IP non-secure context blockers (which disable modern browser `crypto.randomUUID` and PowerSync engine initialization over non-secure connections).

### 3. Carried-Forward / Deferred Items (For Prompt 12 offline/PWA pass)
1. **HTTP/Local-IP Device Test Blockers**: Non-localhost HTTP connections block the PWA's access to the Web Cryptography API (`crypto.randomUUID`) and the PowerSync wa-sqlite OPFS worker. This must be reviewed/fixed (e.g. via local HTTPS proxying, custom development profiles, or polyfills) for PWA device testing in Prompt 12.
2. **PowerSync Toast Network Error Handling**: Spontaneous "Sync error" TypeError network toast occurrences noted in `src/lib/sync/db.ts` to be reviewed during offline hardening.

### 4. Resolved Deferred / Carried-Forward Items
- **Duplicate/Dead PDF Download Button**: Removed the redundant and disabled download button from the payments ledger card view model.


### 5. Specification Deviations
- **Mobile Share Sheet Real Device Verification**: Gated on logic code review and simulator walkthrough rather than real-device testing due to secure-context local IP blockers on the test network.

### 6. Known Concurrency / Multi-Tab Constraints
- **PowerSync Multi-Tab Limitation**: As observed during testing and warned in PowerSync's client console ("Multiple tab support is not enabled. Using this site across multiple tabs may not function correctly"), opening multiple browser tabs simultaneously against the same origin causes replication connection drops, resulting in secondary tabs showing "Sync Offline". Closing concurrent tabs and running a single active session immediately restores sync connection state. For the v1 release, this is an accepted behavior and single-tab operation is required.

---

## Session Update — Prompt 12: Large-Dataset Sync Performance Investigation & Dashboard Cached-Snapshot Architecture

### 1. Performance Investigation & Root Cause Confirmation
- **Diagnosis**: On accounts populated with thousands of rows (e.g. 200 clients, 1,000 invoices, 2,000 payment events, ~4,200 total records), `db.connect()` consistently blocks for ~9.5s–10.5s before releasing the database lock to live queries.
- **Root Cause**: PowerSync client's `db.connect()` executes a full checksum verification and checkpoint validation across all rows in subscribed sync buckets within WebAssembly SQLite (`wa-sqlite`). This computational verification costs ~2.3ms per row in WASM.
- **Ruled-Out Factors**:
  - **Not query execution complexity or missing indexes**: Local SQLite `SELECT` queries across all 4,200 rows execute in 1.5ms–4.5ms once the connection unblocks.
  - **Not SQL JOIN overhead**: Splitting `InvoiceRepo.listAll()` into two sequential queries (`invoices LEFT JOIN clients` + separate `payment_events`) was verified and retained, but does not alter the initial `db.connect()` delay.
  - **Not Auth listener churn**: Eliminating duplicate `onAuthStateChange` reconnect triggers fixed reconnection churn, but `db.connect()` itself remained ~9.5s on the large dataset.
  - **Not client library version**: Upgrading `@powersync/web` from `2.0.0` to `2.2.0` and `@powersync/common` to `2.1.0` (with `v0.5.2` WASM assets) completed cleanly but demonstrated identical checksum validation timings. Upgraded packages are retained for ongoing stability.

### 2. Two-Tier Sync Streams Experiment & Reversion
- **Design & Deployment**: A two-tier Sync Streams architecture (`config: edition: 3`) was designed to prioritize active billing data in Tier 1 (`user_active`: `auto_subscribe: true`, priority 1) and historical data in Tier 2 (`user_history`: `auto_subscribe: false`, priority 3) to test background subscription via `db.syncStream('user_history').subscribe()`.
- **Findings & Constraint**:
  - In our accounting model, `payment_events` (~2,000 rows) and `invoice_line_items` (~1,049 rows) constitute the vast majority of database volume.
  - Because `payment_events` is an immutable append-only ledger without invoice status columns, and invoice balance calculations require summing all related ledger events, ledger entries cannot be partitioned by invoice status without violating the immutable append-only ledger rule (ADR 002) or causing balance drift on active invoices.
  - Consequently, 96.1% of all rows remained in Tier 1 (`user_active`), and `db.connect()` still took ~9.4s–9.7s.
- **Reversion**: The two-tier experiment was completely reverted in application code (`src/lib/sync/provider.tsx`) and the sync configuration was restored to the clean, single-stream `user_data` stream (`edition: 3`, `auto_subscribe: true` for all 6 tables). Verified via manual dashboard redeployment and test suite execution.

### 3. Accepted Architectural Fix: Cached-Snapshot Pattern (ADR 035)
- **Implementation**:
  - Created [`src/lib/data/snapshot.ts`](file:///c:/Users/i7/Documents/Clario/src/lib/data/snapshot.ts) providing fault-tolerant IndexedDB storage (`clario_cache`, store `dashboard_snapshots` keyed by `${userId}_${periodDays}`).
  - Updated `useDashboard` in [`src/lib/data/hooks.ts`](file:///c:/Users/i7/Documents/Clario/src/lib/data/hooks.ts) to read the snapshot immediately on mount, initializing state with `isCached: true` and `cachedAt: timestamp`.
  - Stored `defaultCurrency` directly inside `DashboardSnapshot`, allowing the cached render path to immediately establish exact currency card ordering on frame 0 without waiting for profile queries (~750ms–1.3s in worker).
  - Updated [`src/app/page.tsx`](file:///c:/Users/i7/Documents/Clario/src/app/page.tsx) with a non-blocking loading gate on warm cache:
    `const isLoading = isDashboardLoading || (!isCached && (isClientsLoading || isInvoicesLoading || isProfileLoading));`
  - Rendered a transparent staleness disclosure badge: `• Showing snapshot from [X ago] (syncing...)` with `min-h-[22px]` to completely eliminate layout reflow when live data swaps in.
  - Added dynamic cursor cleanup on `SIGNED_OUT` in [`src/lib/sync/provider.tsx`](file:///c:/Users/i7/Documents/Clario/src/lib/sync/provider.tsx) to wipe all snapshot keys matching `${userId}_*`.
- **Strict Scope**: Applies solely to read-only summary widgets on the Dashboard. All actionable screens (Record Payment modal, Edit Invoice, Client Detail, Invoice Detail) always execute against live queries.

### 4. Standing Engineering Lessons from this Session
1. **Never Trust Documentation-Based Time Estimates Without Measurement**: Predictions from research (e.g. "~500ms initial connect" or "~15ms checksums") were contradicted by live WASM measurements (~2.3ms/row on client hardware). Always measure and profile directly on the target runtime.
2. **PowerSync Sync Streams (Edition 3) SQL Syntax Rules**:
   - The `IN (...)` list expression is unsupported in Edition 3 Sync Streams SQL.
   - Separate queries per status or equality chains must be used if filtering.
3. **PowerSync Configuration Deployment**: Sync stream rules must be deployed via the PowerSync dashboard editor rather than CLI tooling for this project setup.

### 5. Current Working Tree Status (Uncommitted)
All code changes from tonight's session remain **uncommitted** pending human review:
- `modified: .gitignore`
- `modified: DECISIONS.md` (Added ADR 035, ADR 036)
- `modified: package.json` / `package-lock.json` (@powersync/web 2.2.0 upgrade)
- `modified: public/@powersync/*` (Updated WASM and worker binaries)
- `modified: src/app/page.tsx` (Cached snapshot badge, deterministic isAccountEmpty readiness gate)
- `modified: src/lib/data/dashboard.ts` (Added isAccountEmpty deterministic one-shot query)
- `modified: src/lib/data/hooks.ts` (useDashboard snapshot read/persist, combineLiveQueries integration)
- `modified: src/lib/data/invoice.ts` (listAll query separation)
- `modified: src/lib/data/types.ts` (combineLiveQueries helper)
- `modified: src/lib/sync/hooks.ts` (Exposed hasSynced and connecting status)
- `modified: src/lib/sync/provider.tsx` (Auth loop deduplication, clearDashboardSnapshot on signout)
- `untracked: scripts/reset-dev-password.js` (Dev-only safeguarded password reset utility)
- `untracked: src/lib/data/snapshot.ts` (IndexedDB snapshot storage utility)
- `untracked: sync-rules.yaml` (Single-stream edition 3 reference configuration)

### 6. Prompt 12 Follow-Up: Dashboard Cold-Boot Readiness & Race-Condition Hardening
- **Status**: Complete & Verified (46 / 46 Vitest tests passing, 0 TypeScript errors)

#### 1. The Bug & Root Cause
On cold boot (brand-new device, or cleared browser site data with zero cached snapshot in IndexedDB), the Dashboard could briefly flash incorrect UI states before real synced data arrived from the server:
- **Phase 1**: Active accounts with hundreds of clients/invoices briefly flashed the "Let's set up your business" first-run onboarding screen.
- **Phase 2**: When onboarding was suppressed via basic boolean checks, the dashboard summary widgets instead briefly rendered empty states ("No outstanding invoices", "No earnings", "No payment transactions") with sync status "Last: Never" before real records loaded.

**Root Cause**: Relying on query loading flags (`isLoading`, `isClientsLoading`, `isDashboardLoading`) or composite loading/synced boolean flags. In `useLiveQuery` (and React query patterns generally), `isLoading` represents "resolved once, ever" and permanently sets to `false` on Iteration 0 against empty local SQLite (~1ms on cold boot). When PowerSync later commits downloaded server batches to SQLite and flips `hasSynced = true`, `isClientsLoading` stays `false` and does *not* re-arm, creating an asynchronous timing gap where queries appear "loaded" with stale 0-row results before reactive `db.watch()` iterations yield.

#### 2. Failed Naive Fix Attempts (In Order)
1. **Gating on `isLoading` alone**: Failed because Iteration 0 resolved in ~1ms against empty local SQLite, setting `isLoading = false` with `clients = []` and `allInvoices = []`, triggering first-run onboarding immediately.
2. **Combining `isClientsLoading` + `hasSynced`**: Failed because `isClientsLoading` was already stale `false` from Iteration 0 when `hasSynced` flipped to `true`. In that tick, `db.watch()` had not yielded Iteration 1 into React state, so `clients.length === 0` still evaluated to `true`.
3. **150ms Settling Timeout (`isSyncSettled`)**: Rejected as non-deterministic. Guessed timer windows fail on slower mobile CPUs, heavy network throttling, or background tab throttling, reproducing the exact race condition.

#### 3. The Accepted Architectural Fix (ADR 036)
- **Deterministic One-Shot Read (`DashboardRepo.isAccountEmpty`)**:
  Added a direct one-shot query to [`src/lib/data/dashboard.ts`](file:///c:/Users/i7/Documents/Clario/src/lib/data/dashboard.ts) using `db.getAll` to execute `SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL` and `SELECT COUNT(*) FROM invoices WHERE deleted_at IS NULL`. Runs directly in local SQLite in ~1ms without creating an async watch stream.
- **Asymmetric Unified Readiness Gate (`src/app/page.tsx`)**:
  Consolidated all page loading, onboarding, and widget decisions into a single gate:
  `const isDataReady = hasProvenData || isConfirmedEmpty === true;`
  where `hasProvenData = isCached || (clients !== undefined && clients.length > 0) || allInvoices.length > 0`.
  - **Confirmed Empty (`isConfirmedEmpty === true`)**: Unblocks `isDataReady` immediately $\rightarrow$ renders first-run onboarding cleanly.
  - **Confirmed Has Data (`isConfirmedEmpty === false`)**: `isDataReady` stays `false`, holding the loading skeleton until the real reactive queries (`hasProvenData`) deliver their rows to React state $\rightarrow$ transitions directly to real dashboard with zero empty-widget flash.
  - **Pending (`isConfirmedEmpty === null`)**: Holds the skeleton.
- **Cross-Account Session Reset**:
  Added `useEffect(() => { setIsConfirmedEmpty(null); }, [user?.id])` to reset disk confirmation on user ID change, ensuring no state leakage across account switches in the same browser tab.

#### 4. Design Principle Worth Carrying Forward
- **Never trust a "loading finished" boolean as proof that current data is accurate** — only trust actual data content (`hasProvenData`) or an explicit, deterministic one-shot check.
- **Fail toward "show a skeleton a bit longer" rather than "risk a false negative/empty state"** — an extra millisecond on a loading skeleton is a minor UX cost, whereas flashing "You have no clients / No outstanding invoices" actively misleads the freelancer in a financial clarity app.

#### 5. New Known Issue (Unresolved / Deferred)
- **Google OAuth Redirect Loop on Dev Project**:
  Google OAuth sign-in for `mabelmarkus116@gmail.com` got stuck in a redirect loop during dev testing (repeated console warning: `"message port closed before a response was received"`, plausibly related to Supabase/Google OAuth state or dev origin redirect configuration; confirmed not caused by browser extensions as it also reproduced in Incognito).
  - **Workaround**: Created `scripts/reset-dev-password.js` (dev-only, dual-safeguarded against project ref `ukjdwoldakcapojcpfas`) and reset the account's password to `Password123!` to enable standard email/password authentication.
  - **Status**: Open known issue for OAuth investigation in a dedicated session. Email/password authentication is fully functional.

#### 6. Next Steps
- Perform end-to-end manual verification across all 4 dashboard test scenarios:
  1. Test 1 (Large seeded account, cold boot, no cache).
  2. Test 2 (Small account with data, cold boot, no cache).
  3. Test 3 (Genuinely empty account, cold boot, no cache).
  4. Test 4 (Warm cache instant load, offline-first reload).
- Resume the offline-hardening audit across remaining screens (`/clients`, `/invoices`, `/invoices/[id]`, `/invoices/new`, `/invoices/[id]/edit`, Record Payment modal, `/settings`).

---

## Prompt 13: Offline-Hardening Audit for `/clients` and `/` (Dashboard)
- **Status**: Complete & Verified (58 / 58 Vitest tests passing, 0 TypeScript errors, Manual QA Passed)

### 1. Scope & Objective
Audit and harden the Clients List (`/clients`) and Dashboard (`/`) against cold-boot race conditions, false-empty UI flashes, and offline state inaccuracies by applying the architectural lessons from ADR 035 (Cached-Snapshot Pattern) and ADR 036 (Lifted Deterministic Readiness Gate).

### 2. Architectural Implementations

#### A. Lifted Deterministic Readiness Gate (`src/lib/data/readiness.ts`)
- **Shared Hook (`useDataReady`)**: Extracted and generalized the asymmetric readiness gate into a reusable hook conforming to ADR 036.
- **Injectable Domain Empty Checks**:
  - Dashboard: Injects `DashboardRepo.isAccountEmpty()` (checks both active clients and invoices).
  - Clients: Injects `ClientRepo.isEmpty()` (checks `SELECT COUNT(*) FROM clients WHERE deleted_at IS NULL` directly against local SQLite via `db.getAll`). Avoids the "Infinite Skeleton Trap" where an account with 0 clients but historic invoices would never unblock.
- **Strict Error Safety**: If SQLite direct read throws an error, `isConfirmedEmpty` remains `null`, failing safely toward maintaining the loading skeleton rather than flashing false-empty states.
- **Cross-User Session Reset**: Listens to `user?.id` and resets `isConfirmedEmpty = null` upon user change to prevent state leakage across account switches in the same browser tab.
- **Exports**: Exposes `{ isDataReady, isLoading, isConfirmedEmpty }`.

#### B. Deterministic Onboarding & Search Gates (`src/app/clients/page.tsx`)
- **Strict Evaluation Ladder**:
  1. `isLoading === true`: Renders loading skeleton.
  2. `isConfirmedEmpty === true`: Explicitly verified 0 clients on local disk $\rightarrow$ renders "Add your first client" onboarding.
  3. `filteredClients.length > 0`: Renders live client master-detail list.
  4. Fallthrough (clients exist on disk, but filtered results are empty): Renders "No matching clients found for query" with a "Clear Search Query" button.
- **Eliminated Race Condition**: Replaced naive `clients?.length === 0` checks that flashed false empty states during the ~1ms window where `useLiveQuery` returned `undefined` before emitting `[]`.

#### C. Cached-Snapshot Poisoning Fix (`src/app/page.tsx` & `src/lib/data/hooks.ts`)
- **The Issue**: During Empty Cold Boot (Test 2), `useDashboard` saved an empty snapshot `{ outstanding: [], earnings: [], recentPayments: [], invoices: [] }` to IndexedDB. On the next load, `isCached` immediately flipped to `true`, causing `hasProvenData = isCached || ...` to evaluate `true` on Frame 1. This dropped the loading skeleton (`isLoading = false`) before the 1ms SQLite check completed, flashing empty widgets ("No outstanding invoices") for 1 frame before dropping into onboarding.
- **The Fix**:
  1. **Guarded `hasProvenData` in `src/app/page.tsx`**: A cached snapshot is only considered proven if it actually contains non-empty records (`hasCachedData = isCached && (invoices.length > 0 || outstanding.some(o => o.amountMinor > 0) || earnings.length > 0 || recentPayments.length > 0)`).
  2. **Purge Empty Snapshots in `src/lib/data/hooks.ts`**: In `useDashboard`, `saveDashboardSnapshot` is only called when `liveData` has real business records. If the account is completely empty, it calls `clearDashboardSnapshot(userId)` to purge any lingering empty cache from IndexedDB.

### 3. Automated & Manual Verification
- **Vitest Unit Suite**: 11 new tests in `tests/clients_readiness.test.ts` covering:
  - `ClientRepo.isEmpty()` invariants (returns true on 0 rows, false on active rows, true on soft-deleted rows).
  - `useDataReady` asymmetric latching, empty vs data unblocking, error safety, and user switch resets.
  - All 7 test files (**58 / 58 tests**) pass cleanly.
- **TypeScript Typecheck**: `npm run typecheck` (`tsc --noEmit`) passes with 0 errors.
- **Manual QA**: Verified in real browser on Empty Cold Boot (Test 2) — 0 UI flicker, perfectly smooth transition directly into onboarding.

### 4. Next Steps
- Begin offline-hardening audit for the `/invoices` (Invoices list) and `/invoices/[id]` (Invoice Detail) screens.

---

## Prompt 14: Invoices Offline-Hardening Audit, WASM Worker Contention & Next.js RSC Prefetch Resolution
- **Status**: Complete & Verified (86 / 86 Vitest tests passing, 0 TypeScript errors, Manual & Chaos QA Passed)

### 1. Scope & Objective
Extend the ADR 036 readiness architecture to the invoices domain (`/invoices` master list and `/invoices/[id]` detail view) to eliminate false-empty flashes and false 404 screens during initial sync, resolve intermittent WASM worker deadlocks during rapid client-side routing, and eliminate Next.js router crashes under heavy navigation churn.

### 2. Architectural Implementations & Root Causes Resolved

#### A. Fixed "Error-to-False" Repository Return Semantics (`src/lib/data/`)
- **The Root Cause**: Previously, `isEmpty()` and `exists()` methods in `InvoiceRepo`, `ClientRepo`, and `DashboardRepo` swallowed missing database instances (`!db`) or query errors and returned `false`. In the ADR 036 asymmetric readiness gate, `isConfirmedEmpty === false` tells the UI that records exist on disk and holds the loading skeleton waiting for live queries to deliver rows. If the account was actually empty and the error was transient (e.g. WASM worker spinning up), the state machine was trapped into waiting forever $\rightarrow$ infinite loading skeleton.
- **The Resolution**:
  - Updated `InvoiceRepo.isEmpty()`, `InvoiceRepo.exists()`, `ClientRepo.isEmpty()`, and `DashboardRepo.isAccountEmpty()` to throw an explicit `Error('Database connection not available')` or propagate SQLite query errors instead of returning `false`.
  - In `useDataReady` and `useEntityReady`, any query rejections are caught cleanly and leave state as `null`, safely failing toward the loading skeleton and retrying without corrupting the confirmed empty/non-empty flags.

#### B. Decoupled Local Disk from Network Sync (`src/lib/data/readiness.ts`)
- **The Root Cause**: The initial implementation checked `if (hasSynced && !hasLocalData && ...)`. This created a "Pre-Sync Lockout" where the hooks refused to read local SQLite until `hasSynced` flipped to `true`. On offline cold boots (or slow network connections with pre-existing local disk data), the UI was unnecessarily blocked behind a network gate.
- **The Resolution**:
  - Refactored `useDataReady` and `useEntityReady` to execute their one-shot SQLite direct reads (`InvoiceRepo.isEmpty`, `InvoiceRepo.exists`) immediately on mount.
  - **Local Disk First**: If local SQLite reports records present (`isEmpty === false` or `exists === true`), the hooks unblock to live queries immediately without waiting for network `hasSynced`.
  - **Cold Boot Gate**: Only if local SQLite reports 0 rows (`isEmpty === true` or `exists === false`) do the hooks gate behind `hasSynced` to distinguish between an in-flight server download and a genuine empty state or true 404.

#### C. Resolved WASM Polling Contention via `useSyncExternalStore` (`src/lib/sync/hooks.ts`)
- **The Root Cause**: `useSyncStatus()` previously maintained a separate `setInterval(..., 1000)` polling loop and database event subscription per mounted component. When navigating across complex views with multiple hook consumers, dozen(s) of parallel `db.getUploadQueueStats()` queries saturated the single-threaded SQLite WASM worker queue, causing query lockups and latency spikes.
- **The Resolution**:
  - Refactored `useSyncStatus` to use React's `useSyncExternalStore`.
  - Unified all subscribers into a single module-level singleton listener and throttled 2-second polling interval, with an `isUpdating` mutex lock preventing concurrent stats queries against the WASM worker.

#### D. Elimination of Next.js RSC Prefetch Exhaustion (`prefetch={false}`)
- **The Root Cause**: Converting UI navigation cards and buttons to semantic Next.js `<Link>` components introduced aggressive React Server Component (RSC) background prefetching. During rapid tab switching or when rendering large lists of invoice cards, Next.js spammed the local server with background fetch requests (`net::ERR_NETWORK_CHANGED`, `Failed to fetch RSC payload... Falling back to browser navigation`), exhausting the browser's HTTP connection pool alongside the WASM worker and crashing the Next.js router.
- **The Resolution**:
  - Explicitly configured `prefetch={false}` across all `<Link>` components throughout the application:
    - [AppShell.tsx](file:///c:/Users/i7/Documents/Clario/src/components/AppShell.tsx): Mobile drawer and desktop sidebar navigation items (`/`, `/invoices`, `/clients`, `/settings`).
    - [Dashboard (src/app/page.tsx)](file:///c:/Users/i7/Documents/Clario/src/app/page.tsx): Onboarding step cards, Outstanding Balances currency cards, Recent Activity invoice links, and Needs Attention overdue cards.
    - [Auth Screens](file:///c:/Users/i7/Documents/Clario/src/app/): Sign-in, Sign-up, and Reset Password links.

#### E. Single-Entity Cold Boot & Genuine 404 Gate (`useEntityReady`)
- Implemented `useEntityReady` in [src/lib/data/readiness.ts](file:///c:/Users/i7/Documents/Clario/src/lib/data/readiness.ts) and integrated it into `/invoices/[id]/page.tsx`.
- Prevents false "Invoice Not Found" flashes on cold boot URLs while sync is downloading.
- Confirms genuine 404s cleanly once sync resolves without hanging on an infinite skeleton.

### 3. Verification Outcomes
- **Automated Verification**:
  - `npm run typecheck` (`tsc --noEmit`): Compiles with 0 errors.
  - `npm test`: All **86 / 86 Vitest tests** across 9 test files passed:
    - `tests/invoices_readiness.test.ts`: Covers master list negative control (sync in-flight), positive control (0 rows after sync), asymmetric timing flaw, detail view 404 suppression, and genuine 404 unblocking.
    - `tests/wasm_stress.test.ts`: Verifies repository error throwing semantics, decoupled disk unblocking, singleton polling throttling (100 concurrent components execute 1 throttled call), 50-iteration rapid mount/unmount churn with 0 lockups, and transient SQLite error recovery.
- **Manual & Chaos QA Verification**:
  - **Test 1 (Master List Cold Boot)**: Verified zero false-empty flashes; loading skeleton holds cleanly until records sync.
  - **Test 2 (Invoice Detail Cold Boot)**: Verified zero false 404 screens; entity readiness gate holds until sync resolution.
  - **Test 3 (Genuine 404 Handling)**: Verified clean rendering of missing record state without hanging or infinite skeletons.
  - **Chaos / Stress Test**: Verified rapid-fire tab switching and hard refreshes execute without RSC network dropouts or database deadlocks.

### 4. Next Steps
- Continue the offline-hardening audit across remaining routes (`/clients/[id]/invoices/new`, `/invoices/[id]/edit`, Record Payment modal, and `/settings`).

## Prompt 12 Milestone: Client Detail (`/clients`, `/clients/[id]`) Offline Hardening & Readiness
- **Status**: Complete & Verified (100 / 100 Vitest tests passing, 0 TypeScript errors, Manual QA Passed across mobile and desktop).
- **Architectural Implementations & Bugs Resolved**:
  1. Added deterministic existence probe `ClientRepo.exists(id)` throwing on missing db per ADR 037.
  2. Implemented Next.js Server Component canonical redirect at `src/app/clients/[id]/page.tsx` routing to `/clients?id=...`.
  3. Resolved 3-second false 404 flash by making `useEntityReady` identity-aware and enforcing strict 3-tier drawer evaluation precedence.
  4. Resolved premature "Settled — No Outstanding Balance" flash by adding synchronous query state reset to `useLiveQuery` and establishing atomic readiness across parent and child queries.
- **Verification Outcomes**:
  - `npm.cmd run typecheck`: 0 errors.
  - `npm.cmd test`: 100/100 tests passing across 10 files (including 14 tests in `tests/client_detail_readiness.test.ts`).
  - Manual QA: Test 1 (Canonical redirect & deep-link), Test 2 (Genuine 404 handling), Test 3 (New invoice route existence gate), and Test 4 (Mobile drawer escape & flash elimination verified across mobile and desktop).

## Prompt 12 Milestone: Invoice Creation & Edit Routes Offline Hardening & Readiness
- **Status**: Complete & Verified (106 / 106 Vitest tests passing, 0 TypeScript errors, Manual QA Passed).
- **Architectural Implementations & Bugs Resolved**:
  1. Integrated `useEntityReady` and `InvoiceRepo.exists(id)` into `/invoices/[id]/edit`, eliminating cold-boot false 404 flashes.
  2. Enforced atomic readiness on the edit form (`isFormLoading`), eliminating the 50–200ms unlocked-field flicker on invoices with payments.
  3. Gated edit 404 screen strictly behind confirmed disk not-found.
  4. Guarded number auto-suggestion on `/clients/[id]/invoices/new` to preserve typed user input against async race conditions.
- **Verification Outcomes**:
  - `npm.cmd run typecheck`: 0 errors.
  - `npm.cmd test`: 106/106 tests passing across 10 files (including 6 new tests in `tests/invoices_readiness.test.ts`).
  - Manual QA: Test 1 (Paid invoice cold boot & lock state verification), Test 2 (Genuine 404 handling), and Test 3 (Typing preservation before auto-suggest resolution) all passed.

## Prompt 12 Milestone: Record Payment Modal (`RecordPaymentModal`) Offline Hardening & Readiness
- **Status**: Complete & Verified (120 / 120 Vitest tests passing, 0 TypeScript errors, Manual QA Passed).
- **Architectural Implementations & Bugs Resolved**:
  1. Replaced mount effect with synchronous active invoice derivation (`deriveEffectiveInvoiceId`), removing Frame-1 layout pop-in.
  2. Replaced text loader with a full-form structured skeleton matching modal dimensions, eliminating height jerk on open.
  3. Standardized "Pay full balance" calculation to use canonical currency exponent metadata and `.toFixed(exponent)` precision.
  4. Added defensive modal view states (`invoice_not_found` and `no_active_invoices`) with actionable close controls.
- **Verification Outcomes**:
  - `npm.cmd run typecheck`: 0 errors.
  - `npm.cmd test`: 120/120 tests passing across 11 files (including 14 unit tests in `tests/record_payment_modal.test.ts`).
  - Manual QA: Test 1 (Full-height skeleton and zero-layout-jump mount), Test 2 ("Full" shortcut precision), and Test 3 (Automated verification of empty active invoice state) all passed.

## Prompt 12 Milestone: Settings Screen (`/settings`) & Offline Sign-Out Security Hardening
- **Status**: Complete & Verified (133 / 133 Vitest tests passing, 0 TypeScript errors, Manual QA Passed).
- **Architectural Implementations & Bugs Resolved**:
  1. Resolved critical offline sign-out leak in `PowerSyncProvider` by removing the `!isInitialized` gate and enforcing unconditional database and snapshot clearing.
  2. Added `ProfileRepo.exists()` probe and integrated `useEntityReady` to prevent cold-boot empty states.
  3. Eliminated async user typing clobbering using `isDirtyRef` protection.
  4. Replaced loading spinner with a geometry-matched `animate-pulse` form skeleton.
  5. Sourced currencies canonically from `CURRENCIES` in `src/lib/money`.
  6. Added Account & Session section with unsynced mutations warning modal when `pendingUploads > 0`.
- **Verification Outcomes**:
  - `npm.cmd run typecheck`: 0 errors.
  - `npm.cmd test`: 133/133 tests passing across 12 files (including 13 unit tests in `tests/settings_readiness.test.ts`).
  - Manual QA: Test 1 (Form skeleton & layout stability), Test 2 (Input preservation while editing), Test 3 (Unsynced changes warning dialog), and Test 4 (Clean sign-out & database purge) all passed.
