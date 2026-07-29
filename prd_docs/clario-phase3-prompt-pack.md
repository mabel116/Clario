# Clario — Phase 3: Prompt Pack

Twelve sequential prompts for building Clario. **`prd_docs/clario-prd.md` is the single source of truth** — these prompts sequence the work and point into it; they don't restate it.

## How to use (orchestrator notes)

- Paste one prompt at a time into Claude Code or Antigravity. The agent needs the PRD in the repo; it never needs this file.
- **Current state** in each prompt assumes the previous steps completed to their acceptance criteria. If reality diverges — a different directory name, a decision that shifted — amend that field before pasting.
- Every prompt ends by running `/review` and updating `prd_docs/PROJECT_STATE.md`. Steps touching migrations, RLS, or sync rules also run `/careful`.
- If a step fails its acceptance criteria, fix it before moving on.

| # | Prompt | Skills at close |
|---|---|---|
| 1 | Scaffold, schema, RLS & migrations | `/careful` + `/review` |
| 2 | PowerSync wiring & sync status | `/careful` + `/review` |
| 3 | Money core (pure logic + tests) | `/codex` + `/review` |
| 4 | Data-access layer (repositories) | `/codex` + `/review` |
| 5 | Auth & profile settings | `/review` |
| 6 | Clients & document links | `/review` + `/qa` |
| 7 | Invoices, line items & lifecycle | `/review` + `/qa` |
| 8 | Payments ledger & reversals | `/review` + `/qa` |
| 9 | Client financial view | `/review` + `/design-review` + `/qa` |
| 10 | Multi-currency dashboard | `/review` + `/design-review` + `/qa` |
| 11 | On-device invoice PDF | `/review` + `/qa` |
| 12 | PWA, offline hardening & ship | `/review` + `/design-review` + `/qa` + `/cso` + `/ship` |

**Watch these acceptance criteria closely:** P1 #5 (database refuses ledger mutations), P3 #9 (order-independent balances), P8 #9 (two offline devices both survive sync), P11 #3 (`internal_note` never reaches the PDF), P12 #1–8 (the offline QA script, executed literally).

## Verification pattern — positive and negative controls

Established in Prompt 1, applied throughout. **Any criterion that asserts an absence — a zero count, a rejected write, a grep with no matches, a UI control that shouldn't exist — can pass for two reasons: the guarantee holds, or the test apparatus was dead.** Those outcomes are indistinguishable from a negative result alone.

Every such criterion below is therefore paired with a positive control proving the apparatus was live:

| Absence claim | Paired positive control |
|---|---|
| User A sees 0 of user B's rows | User A sees their own rows, and `auth.uid()` resolves to A |
| A write was rejected | An equivalent legitimate write succeeded in the same session |
| A grep found no violations | The same pattern finds known matches elsewhere in the repo |
| A control isn't rendered | The surrounding screen rendered correctly with real data |
| Cached data survived / was cleared | The data was confirmed present immediately beforehand |

Report both halves. A criterion reported as only a zero is not verified.

---
---

# Prompt 1 — Scaffold, Supabase schema, RLS & migrations

**Role:** You are a senior full-stack engineer specializing in Postgres data modeling and row-level security, working in a greenfield TypeScript / Next.js (App Router) / Supabase codebase that will become an offline-first PWA.

**Goal:** Stand up the project skeleton and the complete database schema, with security policies that provably enforce Clario's two most important invariants — per-user isolation and an immutable payment ledger.

**Current state:** Nothing built yet. The repo contains only `CLAUDE.md`, `prd_docs/`, and `.agents/skills/gstack/`. No app code, no Supabase project, no migrations.

**Constraints:**
- Read `prd_docs/clario-prd.md` first — §1–§4 (product, scope, architecture, invariants), §5.2 (table specifications), §7.1–§7.2 (RLS, migrations), §10 (non-functional). The PRD is the source of truth; if anything here conflicts with it, the PRD wins and you say so.
- **Money columns are `bigint` minor units** paired with an ISO-4217 `char(3)` currency. Never `numeric`, `real`, or `double precision` for money.
- **`payment_events` must be append-only at the database level.** No `updated_at`, no `deleted_at`. Grant only `select` and `insert` policies; create **no** update or delete policy so RLS denies them. Add a SQL comment marking this as deliberate.
- **`status` CHECK allows only `'draft'`, `'sent'`, `'void'`.** It must reject `'paid'` and `'overdue'` — those are derived (PRD §6.1).
- **No unique constraint on `(user_id, invoice_number)`.** Uniqueness is a soft client-side warning only; a hard constraint would break offline creation (PRD §6.3).
- All primary keys are client-generated UUIDs. Soft deletes (`deleted_at`) on every table except `payment_events`.
- All schema lives in `supabase/migrations` via the Supabase CLI. No dashboard schema edits, ever.
- No service-role key in client code or committed env files.
- Do not build: PowerSync integration, authentication UI, or any feature screens.

**Task:**
1. Scaffold Next.js (App Router) + TypeScript strict + Tailwind + ESLint; initialize shadcn/ui; set up a test runner (a later step depends on it). Add `.env.local.example` documenting `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_POWERSYNC_URL`, and a README with setup steps.
2. Initialize the Supabase CLI so migrations live in `supabase/migrations`.
3. Write the initial migration creating all six tables exactly per PRD §5.2 — `profiles`, `clients`, `client_links`, `invoices`, `invoice_line_items`, `payment_events` — enabling RLS on every table in the same migration.
4. Add indexes: `clients(user_id)`, `client_links(client_id)`, `invoices(user_id)`, `invoices(client_id)`, `invoice_line_items(invoice_id)`, `payment_events(invoice_id)`, `payment_events(client_id)`, `payment_events(user_id, created_at desc)`.
5. Write RLS policies per PRD §7.1.
6. Add a trigger on `auth.users` insert creating the matching `profiles` row with `default_currency = 'USD'`.

**Acceptance criteria:**
1. Build passes with no TypeScript errors; the test runner executes.
2. Migrations apply cleanly to a fresh instance (`supabase db reset`).
3. Querying `information_schema.columns` shows every `*_minor` column as `bigint`, and zero money columns as `numeric`/`real`/`double precision`.
4. `payment_events` has no `updated_at` and no `deleted_at` column.
5. As an authenticated test user: inserting a `payment_events` row succeeds, while attempting an `update` and a `delete` on that row both fail or affect zero rows.
6. With two test users, user A cannot select, update, or delete any of user B's `clients` or `invoices`.
7. Two invoices for the same user can share an `invoice_number` without a database error.
8. The `status` CHECK rejects `'paid'` and `'overdue'`.
9. Grep confirms no service-role key in any client file or committed env file.

Criteria 5 and 6 require actually attempting the forbidden operation and showing it fails. An assertion that it "should fail" does not satisfy them.

**Output, in this order:**
1. The files you'll create or change, and why — before writing any code.
2. The code.
3. Results for all nine acceptance criteria, with **verbatim output** for 5 and 6.
4. Run `/careful` (this step touches migrations and RLS) and `/review`. Report findings and fix anything surfaced before calling this done.
5. Update `prd_docs/PROJECT_STATE.md`; log load-bearing decisions in `DECISIONS.md`.
6. Any deviation from this spec, with your reasoning.

---
---

# Prompt 2 — PowerSync wiring, local schema & sync status

**Role:** You are a senior engineer specializing in local-first data synchronization, working in a TypeScript / Next.js / Supabase codebase where offline capability is the product's core differentiator.

**Goal:** Wire PowerSync so the app reads and writes a local SQLite database that syncs bidirectionally with Supabase Postgres, with the sync dependency contained behind a single boundary.

**Current state:** Prompt 1 complete — Next.js scaffold, Supabase project, all six tables with RLS, append-only enforcement on `payment_events`, migrations in `supabase/migrations`. No PowerSync, no local database, no app features.

**Constraints:**
- Read `prd_docs/clario-prd.md` §4.2 (data-flow model), §7.3 (sync rules), §7.4 (local schema), §8.3 (upload connector), §9 Epic 8 (offline acceptance criteria).
- **Establish the sync boundary now:** every PowerSync SDK import lives under `src/lib/sync/`. No component, route handler, or business-logic module may import the SDK. This containment is what makes a future engine swap or self-host cheap.
- **The upload connector must reject `PATCH` and `DELETE` on `payment_events`** with a descriptive error — a defensive mirror of the database's append-only policy. Soft deletes on other tables arrive as normal `PATCH` operations setting `deleted_at`.
- **Reads never hit the network.** All app-data reads target local SQLite.
- Sync rules scope strictly per user — a device must never receive another user's rows.
- Money columns map to SQLite `integer`, never `real`.
- Do not build: repositories, derivation logic, auth UI, or feature screens.

**Task:**
1. Install the PowerSync web SDK and Supabase connector dependencies; wire `NEXT_PUBLIC_POWERSYNC_URL` into env config.
2. Write the local schema (`src/lib/sync/schema.ts`) mirroring all six tables per PRD §7.4 — `*_minor` → `integer`, `quantity` → `real`, `position` → `integer`, ids/text → `text`, timestamps and dates → ISO-8601 `text`. Export typed row types.
3. Write sync rules (`supabase/powersync/sync-rules.yaml`) per PRD §7.3, bucketing all six tables by `request.user_id()`. Document per-environment deployment in the README.
4. Implement the connector (`src/lib/sync/connector.ts`) per PRD §8.3: `fetchCredentials()` returning the endpoint plus the Supabase session JWT (return null rather than throw when there's no session); `uploadData()` translating queued local ops into Supabase writes. Distinguish permanent errors (auth → surface for re-auth) from transient ones (network → rethrow for retry).
5. Create `src/lib/sync/db.ts` (database singleton) and `src/lib/sync/provider.tsx` (initializes, connects when a session exists, disconnects and **clears the local database** on sign-out). Wire into the root layout.
6. Build `useSyncStatus()` exposing `{ connected, lastSyncedAt, pendingUploads }` and a `SyncIndicator` component in the app shell.
7. Add a temporary dev route `/dev/sync` listing local row counts with a button inserting a throwaway client row. It gets deleted in prompt 12.

**Acceptance criteria:**
1. Build passes; signed in, the indicator shows connected with a recent sync time.
2. A row inserted directly in Supabase appears in local counts within seconds.
3. With the network disabled, creating a row via the diagnostic button makes it appear locally immediately, the indicator shows offline, and `pendingUploads` is at least 1.
4. Re-enabling the network drops pending to zero and the row exists in Supabase.
5. With the network disabled, reloading the app renders previously synced data and nothing hangs. **Positive control:** name the specific rows expected and confirm they are present — "the page loaded" is not sufficient, since an empty local database also loads.
6. A second user's device receives none of the first user's rows. **Positive control:** confirm the second user DOES see their own rows in the same session. Zero rows for everything would otherwise look identical to correct isolation.
7. Signing out clears the local database. **Positive control:** report the row counts immediately before sign-out and confirm they were non-zero — an already-empty database clears trivially.
8. Grep confirms `@powersync` imports appear only under `src/lib/sync/`. **Control:** show the same pattern matching the known-good imports inside `src/lib/sync/`, proving the pattern is correct rather than simply not matching anything.

**Output, in this order:**
1. The files you'll create or change, and why — before writing any code.
2. The code.
3. Results for all eight acceptance criteria, with the actual observed behaviour for 3–6.
4. The steps required to deploy sync rules per environment.
5. Run `/careful` (this step touches sync rules) and `/review`. Report findings and fix anything surfaced.
6. Update `prd_docs/PROJECT_STATE.md`; log decisions in `DECISIONS.md`.
7. Any deviation from this spec, with your reasoning.

---
---

# Prompt 3 — Money core: types, derivations & unit tests

**Role:** You are a senior engineer specializing in financial correctness and pure-functional TypeScript, writing the calculation core that every screen in this app will depend on.

**Goal:** Implement and exhaustively test the money primitives and derivation logic — balances, payment status, overdue, and per-currency aggregates — as pure functions with no dependencies.

**Current state:** Prompts 1–2 complete — schema with the append-only ledger, PowerSync wiring under `src/lib/sync/`, sync status. No business logic, no repositories, no UI.

**Constraints:**
- Read `prd_docs/clario-prd.md` §4.3 (invariants), §6.1 (per-invoice derivations), §6.2 (aggregates), §6.3 (invoice numbering). Implement these definitions exactly.
- **Pure functions only.** Nothing in `src/lib/money/` or `src/lib/derive/` may import React, PowerSync, or Supabase, or perform any I/O.
- **`today` is always an injected parameter** — never read the system clock inside a derivation. This keeps overdue logic testable and timezone-safe.
- **Ledger sums must be commutative:** identical results regardless of event order, because offline devices sync in arbitrary order. This property is what makes the append-only design safe.
- **No function may return a single total across mixed currencies.**
- Money is integer minor units throughout; rounding happens in exactly one place.
- Do not build: repositories, queries, or UI.

**Task:**
1. `src/lib/money/` — `Money` as `{ amountMinor, currency }`; `addMoney`/`subtractMoney`/`sumMoney` that **throw** on currency mismatch; `multiplyMinor(amountMinor, quantity)` returning a half-up rounded integer (the only place rounding is permitted); `formatMoney` via `Intl.NumberFormat` respecting each currency's real exponent and handling zero-decimal currencies (JPY, KRW) — do not hardcode a divisor of 100; `parseMoneyInput(text, currency)` converting major-unit input to minor units without floating-point drift; a currency list covering at least NGN, USD, EUR, GBP, KES, GHS, ZAR, CAD, AUD, INR, JPY with code, symbol, name, exponent.
2. `src/lib/derive/invoice.ts` — `lineTotalMinor`, `invoiceTotalMinor`, `amountPaidMinor` (signed sum), `balanceDueMinor`, `paymentStatus`, `isOverdue`, `displayStatus`, exactly per PRD §6.1.
3. `src/lib/derive/aggregates.ts` — `outstandingByCurrency`, `earningsByCurrency`, `clientOutstandingByCurrency`, `sortCurrencyTotals(totals, defaultCurrency)` per PRD §6.2. Each returns a per-currency array; outstanding also carries an overdue count.
4. `src/lib/derive/numbering.ts` — `suggestNextInvoiceNumber(existingNumbers)` per PRD §6.3, preserving prefix and zero-padding, returning `INV-0001` when empty and ignoring unparseable entries rather than throwing.

**Acceptance criteria** (each is a passing unit test):
1. `formatMoney` correct for NGN, USD, and JPY (no decimals for JPY).
2. `parseMoneyInput('1,250.50', 'USD')` returns `125050`; `19.99` never yields `1998` or a float artifact.
3. `multiplyMinor(333, 2.5)` returns `833` (half-up).
4. Currency mismatch throws in `addMoney` and `sumMoney`. **Control:** assert the specific error thrown, and confirm a same-currency call in the same test returns the correct sum — a function that throws on every input would otherwise pass.
5. Total 100000 with payments of 30000 and 20000 gives balance 50000 and status `partially_paid`.
6. Payments summing exactly to the total give balance 0 and status `paid`.
7. Overpayment gives a negative balance and status `paid`, with no crash.
8. A payment of 50000 followed by a reversal of −50000 returns the balance to the full total and status to `unpaid`.
9. The same event set in three shuffled orders yields identical balance and status. **Control:** assert the result equals the correct expected value, not merely that the three runs agree. A function returning a constant would satisfy "identical" while being wrong. Also confirm the three orders are genuinely different permutations.
10. A `sent` invoice past due with balance > 0 is overdue; the same invoice fully paid is not; a `draft` past due is not; a `void` invoice never is. All four cases must appear in the same test run — the three negatives alone would pass against a function that always returns false.
11. `displayStatus` reports `paid` — not `overdue` — for a paid-and-past-due invoice.
12. Invoices in NGN and USD produce two aggregate entries, and no function returns a combined scalar.
13. `earningsByCurrency` respects the date window and subtracts reversals.
14. `sortCurrencyTotals` places the default currency first regardless of amount.
15. `suggestNextInvoiceNumber(['INV-0007','INV-0002'])` returns `'INV-0008'`; `[]` returns `'INV-0001'`.

Plus: no file in these directories imports React, PowerSync, or Supabase.

**Output, in this order:**
1. The exported function signatures you plan, and why — before writing implementations.
2. The code, tests first where practical.
3. Test run output with the passing count, and explicit confirmation of criteria 9 and 12.
4. Run `/codex` for an independent second opinion on the rounding, sign handling, and currency logic, then `/review`. Report findings and fix anything surfaced.
5. Update `prd_docs/PROJECT_STATE.md`; log decisions in `DECISIONS.md`.
6. Any deviation from this spec, with your reasoning.

---
---

# Prompt 4 — Data-access layer (repositories)

**Role:** You are a senior engineer designing the data-access API for a local-first application, working in TypeScript with PowerSync-backed SQLite.

**Goal:** Build the typed repository layer that every screen will consume — live local queries for reads, optimistic local writes, and the invoice locking rule enforced in one place.

**Current state:** Prompts 1–3 complete — schema with RLS, PowerSync wiring under `src/lib/sync/`, and fully tested pure money/derivation logic in `src/lib/money/` and `src/lib/derive/`. No repositories, no UI.

**Constraints:**
- Read `prd_docs/clario-prd.md` §8 in full (§8.1 interfaces, §8.2 rules, §8.3 connector), §6 (derivations to reuse), §9 Epic 3.2 (locking rule).
- **There is no REST API for app data.** This repository layer *is* the API surface.
- **This layer plus `src/lib/sync/` are the only places that may touch PowerSync.** Components consume repositories and hooks exclusively.
- **Reuse prompt 3's functions** for every derived value — never reimplement balance, status, or aggregate logic inline.
- **`payment_events` is insert-only.** `record` and `reverse` are the only write paths; no code path may update or delete a payment event.
- **Implement the locking rule exactly** (PRD §9 Epic 3.2): financial fields — line items, amounts, `currency`, `invoice_number`, `issue_date` — stay editable while the invoice has **zero** payment events, in either `draft` or `sent`. Once any payment event exists they lock and edits throw a typed error. `due_date` and `internal_note` are **always** editable.
- **Recording a payment whose currency differs from its invoice must throw.**
- All reads are live queries; all writes land locally first and return a client-generated UUID.
- Do not build: UI screens, auth flows, or PDF logic.

**Task:**
Create `src/lib/data/` implementing the interfaces in PRD §8.1 — `ClientRepo`, `ClientLinkRepo`, `InvoiceRepo`, `PaymentRepo`, `DashboardRepo`, `ProfileRepo` — plus:
- `types.ts` with row types, input types, and view models carrying derived fields (`InvoiceSummary` includes `displayStatus`, `amountPaidMinor`, `balanceDueMinor`).
- `ClientLinkRepo` validating `url` as an absolute `http(s)` URL, throwing a typed validation error otherwise.
- `InvoiceRepo.setLineItems` replacing items in a transaction and recomputing `line_total_minor` and `total_minor`.
- `InvoiceRepo.canEditFinancials(invoiceId)` as a live query so the UI can reflect the locking rule rather than duplicating it.
- `PaymentRepo.reverse` inserting a negative mirror with `reverses_id` set, throwing if the target is itself a reversal or already reversed.
- `DashboardRepo` built on prompt 3's aggregates, sorted via `sortCurrencyTotals` with the profile's `default_currency`.
- `hooks.ts` exposing `useClients`, `useClient`, `useClientLinks`, `useInvoice`, `useInvoicesForClient`, `usePaymentsForInvoice`, `usePaymentsForClient`, `useDashboard`, `useProfile`, each returning `{ data, isLoading }`.

**Acceptance criteria:**
1. Build passes with no `any` on public signatures.
2. A client created offline appears in `list()` immediately.
3. Invoice `total_minor` equals the sum of its line totals.
4. Two partial payments drive `balanceDue` and `displayStatus` to `partially_paid`, then `paid`.
5. `reverse()` inserts a negative event and leaves the original row unchanged — assert `id`, `amount_minor`, and `created_at` are identical before and after.
6. A payment in a mismatched currency throws.
7. Editing line items with zero payments succeeds; the same edit after a payment throws; `due_date` and `internal_note` succeed in both cases. The success cases are the positive control — assert the specific typed error on the throw, so a repository that rejects every edit cannot pass.
8. `softDelete` on a client sets `deleted_at`, removes it from `list()`, and leaves its invoices queryable.
9. Grep of `src/lib/data/` shows no `UPDATE` or `DELETE` targeting `payment_events`. **Control:** show the same pattern matching the legitimate `UPDATE` statements on other tables, proving it would have found a violation.
10. Grep of the repo shows PowerSync imports only in `src/lib/sync/` and `src/lib/data/`. **Control:** show the pattern matching the known imports inside those two directories.
11. Live queries re-emit on local writes with no manual refresh.

**Output, in this order:**
1. The repository files and interface signatures you plan, and why — before writing implementations.
2. The code.
3. Test run output covering criteria 2–8, with explicit confirmation of 5 and 7.
4. Run `/codex` for a second opinion on the locking rule and the reversal path, then `/review`. Report findings and fix anything surfaced.
5. Update `prd_docs/PROJECT_STATE.md`; log decisions in `DECISIONS.md`.
6. Any deviation from this spec, with your reasoning.

---
---

# Prompt 5 — Authentication & profile settings

**Role:** You are a senior full-stack engineer implementing authentication for an offline-first PWA, working with Supabase Auth in a Next.js App Router codebase.

**Goal:** Ship sign-up, sign-in (email/password and Google), session handling that survives being offline, and profile settings.

**Current state:** Prompts 1–4 complete — schema with RLS and the `profiles` bootstrap trigger, PowerSync sync, tested derivation logic, and the repository layer with React hooks. No user-facing screens yet.

**Constraints:**
- Read `prd_docs/clario-prd.md` §9 Epic 0 (auth and profile acceptance criteria), §12.1 (resolved auth decision).
- **A cached session must open the app offline.** After a first successful sign-in, launching with no network loads cached data without re-authentication. Never gate the app shell behind a network auth check.
- **Never sign the user out on an offline token-refresh failure.** Sign out only on explicit action or a definitive server-side rejection while online.
- **Sign-out must clear the local database**, so no data leaks between accounts on a shared device.
- Sign-in, sign-up, and password reset genuinely need network — say so clearly when offline rather than failing silently.
- Supabase Auth calls are confined to `src/lib/auth/`; components read data through repository hooks.
- Error messages are human ("That email or password isn't right"), never raw exception strings.
- No service-role key in client code.
- Do not build: clients, invoices, payments, or the dashboard.

**Task:**
1. `src/lib/auth/` — Supabase browser client with persistent sessions and auto-refresh; `signUpWithPassword`, `signInWithPassword`, `signInWithGoogle`, `signOut`, `resetPassword`; a session provider exposing `{ session, user, isLoading }`, mounted above the PowerSync provider so sync connects once a session exists.
2. Google Sign-In: enable the provider, register redirect URIs per environment, cover Vercel preview URLs via the Supabase redirect allow-list (document the exact pattern), and configure identity linking so Google sign-in on an email that already has a password account resolves to the **same** account.
3. Screens: `/sign-in` (email + password, "Continue with Google", links to sign-up and reset), `/sign-up`, `/reset-password`. Route protection in both directions.
4. `/settings` — bound to `useProfile()` and `ProfileRepo.update` for `business_name`, `business_address`, `default_currency` (from prompt 3's currency list). Editable offline. Includes sync status and sign-out.
5. App shell — authenticated layout with navigation (Dashboard, Clients, Settings), the sync indicator, mobile-first responsive.

**Acceptance criteria:**
1. Email sign-up creates a `profiles` row automatically with `default_currency = 'USD'`.
2. Google sign-in succeeds.
3. Creating a password account, signing out, then signing in with Google on the same email resolves to the same account with no duplicate profile row.
4. After signing in, going offline and reloading opens the app with cached data and no re-auth prompt. **Positive control:** name specific cached data visible after the reload — an app that opens to an empty shell also satisfies "no re-auth prompt."
5. An extended offline period does not sign the user out.
6. A profile edited offline persists locally and syncs on reconnect.
7. Signing out clears the local database; a second user sees none of the first user's data. **Positive control:** confirm non-zero row counts immediately before sign-out, and confirm the second user sees their own data.
8. Unauthenticated access to `/settings` redirects to `/sign-in`. **Positive control:** an authenticated user reaches `/settings` successfully — a broken router redirecting everything would otherwise pass.
9. Grep confirms Supabase Auth imports only under `src/lib/auth/`, and no service-role key anywhere.

**Output, in this order:**
1. The files you'll create or change, and why — before writing any code.
2. The code.
3. Results for all nine acceptance criteria, with observed behaviour for 3–7.
4. The preview redirect-URI pattern and the identity-linking configuration you used.
5. Run `/review`. Report findings and fix anything surfaced.
6. Update `prd_docs/PROJECT_STATE.md`; log decisions in `DECISIONS.md`.
7. Any deviation from this spec, with your reasoning.

---
---

# Prompt 6 — Clients & document links

**Role:** You are a senior frontend engineer building the first feature surface of an offline-first app, working in Next.js App Router with React, Tailwind, and shadcn/ui.

**Goal:** Ship client CRUD and document links — labeled URLs attached to a client — all fully functional offline.

**Current state:** Prompts 1–5 complete — schema, sync, derivation logic, repositories with hooks, authentication, and the app shell. No feature screens yet.

**Constraints:**
- Read `prd_docs/clario-prd.md` §9 Epic 1 (clients), §9 Epic 2 (document links), §4.4 (why links instead of file uploads).
- **Document links are labeled URLs, not file uploads.** Do not add file inputs, Supabase Storage, drag-and-drop, link previews, server-side fetching, or Drive/Dropbox OAuth. Binary sync is a separate, harder offline problem and is a deliberate post-v1 fast-follow. Links are per **client** only — no per-invoice links.
- **Outstanding balances render one line per currency**, never combined.
- **Everything works offline** — creating and editing a client with no network is instant, with no spinner and no error.
- Components use repository hooks only; no direct PowerSync or Supabase imports.
- Soft deletes only.
- Mobile-first, verified at 375px. Empty states are an invitation, not an apology.
- Do not build: invoices, payments, PDF, or the dashboard.

**Task:**
1. `/clients` — live list via `useClients()`, alphabetical, with client-side search over local data (name, company, email). Each row shows name, company, and outstanding balance per currency. Empty state with an "Add client" action.
2. Create/edit client form — `name` (required), `email` (format-validated when present), `phone`, `company`, `notes`, `default_currency` (pre-filled from the profile). Saves locally and returns immediately.
3. `/clients/[id]` ordered money-first — header with name, company, and outstanding per currency; **section shells** for invoices (prompt 7) and payment history (prompt 8) so the layout is settled; then contact details and notes; then document links. Actions: edit, delete.
4. Document links — list per client, each showing its `label` and opening its `url` in a new tab with `rel="noopener noreferrer"`. Add, edit, soft-delete. Invalid URLs block the save with an inline message surfaced from the repository's typed error. Long URLs truncate visually.
5. Delete client — confirmation stating invoices and payment history are preserved; soft delete only.

**Acceptance criteria:**
1. Creating a client offline shows it immediately, displays a pending upload, and it exists in Supabase after reconnect.
2. Editing offline persists and syncs.
3. Search filters instantly with the network disabled.
4. A valid link saves and opens correctly in a new tab. **This is the positive control for criterion 5** — run both in the same session.
5. `not-a-url`, `ftp://x`, and an empty label are each blocked inline with nothing written. A form that rejects every input would pass this alone; criterion 4 must pass alongside it.
6. A link added offline works and syncs later.
7. A soft-deleted link disappears from the list while the row remains in Postgres with `deleted_at` set. **Positive control:** confirm the link was visible in the list immediately before deletion, and that other links remain visible after.
8. A soft-deleted client disappears from the list while its invoices and payments remain queryable. **Positive control:** confirm the client was listed beforehand and that other clients still appear — an empty or broken list would otherwise satisfy "disappeared."
9. A client with two currencies shows two separate outstanding lines and no combined figure.
10. Grep confirms no file-upload input, no Supabase Storage import, and no file `FormData` handling. **Control:** demonstrate each pattern is well-formed by matching something known to exist (e.g. the `<input>` elements that do exist).
11. Grep confirms no PowerSync or Supabase imports in `src/app/` or `src/components/`. **Control:** the same pattern must match the legitimate imports under `src/lib/sync/`.

**Output, in this order:**
1. The routes and components you'll create, and why — before writing any code.
2. The code.
3. Results for all eleven acceptance criteria, with observed behaviour for 1, 5, and 9.
4. Run `/review`, then `/qa` to exercise the flows in a real browser **with the network disabled**. Report findings and fix anything surfaced.
5. Update `prd_docs/PROJECT_STATE.md`; log decisions in `DECISIONS.md`.
6. Any deviation from this spec, with your reasoning.

---
---

# Prompt 7 — Invoices, line items & lifecycle

**Role:** You are a senior frontend engineer building invoice creation and lifecycle management in an offline-first Next.js app, where money correctness matters more than feature richness.

**Goal:** Ship invoice creation with line items, the draft → sent → void lifecycle, derived status badges, and the payment-gated locking rule.

**Current state:** Prompts 1–6 complete — schema, sync, derivation logic, repositories, auth, and clients with document links. The client detail page has empty section shells for invoices and payment history.

**Constraints:**
- Read `prd_docs/clario-prd.md` §9 Epic 3 (invoices), §6.1 (derived status), §6.3 (numbering), §12.2 (locking decision).
- Invoicing is table stakes in service of payment clarity — build it clean and fast, not elaborate.
- **Never write `'paid'` or `'overdue'` to the `status` column.** Stored status holds only `draft | sent | void`; paid and overdue are derived.
- **Locking is gated on payments, not on status.** With zero payment events, financial fields stay editable even in `sent` — Clario never transmits the invoice, so `sent` is self-declared and edits recompute cleanly. `due_date` and `internal_note` are always editable.
- **`internal_note` is private** and must never appear in any client-facing output.
- **Invoice-number uniqueness is a soft warning** — warn on a local duplicate, never block; blocking would break offline creation.
- All money is integer minor units; no float arithmetic in this UI. Input in major units converts via `parseMoneyInput`.
- Currency is fixed per invoice at creation from the client's default.
- Status is conveyed by text label as well as colour. Mobile-first, verified at 375px.
- Do not build: payment recording, PDF, or the dashboard.

**Task:**
1. Invoice list on client detail, replacing the prompt 6 shell — live via `useInvoicesForClient`, each row showing number, dates, total, balance due, and a status badge from `displayStatus` (§6.1). Sort unpaid and overdue first, then date descending.
2. `/clients/[id]/invoices/new` — header fields (`invoice_number` pre-filled from `suggestNextNumber()` and editable, `currency` from the client, `issue_date`, `due_date`, public `notes`, private `internal_note`); a line-item editor with add, remove, and reorder showing live per-line and invoice totals; stacked rows on mobile, not a cramped table. Saves as `draft`. Non-blocking duplicate-number warning.
3. `/invoices/[id]` — client, dates, line items, total, amount paid, balance due, status badge; a payments section shell for prompt 8; `internal_note` clearly marked private. Actions conditional on state: Edit, Mark as sent, Void, Delete (draft only), plus placeholders for Record payment and Download PDF.
4. Lifecycle actions — Mark as sent (dialog capturing `issue_date` defaulting today and `due_date` defaulting issue + 14 days); Void (confirmation explaining exclusion from outstanding and earnings while the record is preserved); Delete (draft only, soft, confirmed).
5. Edit + locking UX driven by `canEditFinancials(invoiceId)`. When locked, render financial fields read-only with a short explanation that payments exist and corrections go via void + reissue or a payment reversal — do not hide the fields.

**Acceptance criteria:**
1. An invoice created offline with three line items computes totals correctly, saves locally, and syncs on reconnect.
2. Quantity `2.5` at unit price `3.33` gives a line total of `8.33`, with no float artifacts anywhere on screen.
3. A zero-decimal currency (JPY) renders without decimals.
4. The number pre-fills as next in sequence; entering a duplicate warns but still saves.
5. Mark as sent stores both dates and updates the badge.
6. A `sent` invoice past due with no payments displays **Overdue** while the database `status` column still reads `'sent'` — verify directly in Postgres.
7. With zero payments, editing line items on a `sent` invoice succeeds. This is the positive control for the locking rule; its negative half — the same edit blocked once a payment exists — is verified in Prompt 8, criterion 5. Note the pairing in your report.
8. `due_date` and `internal_note` are editable on a `sent` invoice.
9. Void excludes the invoice from outstanding but keeps it listed.
10. Delete is offered only for drafts.
11. Grep confirms `'paid'` and `'overdue'` are never written to `status`. **Control:** show the pattern matching the legitimate `'draft'` / `'sent'` / `'void'` writes, proving it inspects the right call sites.
12. The line-item editor is usable at 375px width.

**Output, in this order:**
1. The routes and components you'll create, and why — before writing any code.
2. The code.
3. Results for all twelve acceptance criteria, with observed behaviour for 2, 6, and 7.
4. Run `/review`, then `/qa` in a real browser including an offline invoice creation. Report findings and fix anything surfaced.
5. Update `prd_docs/PROJECT_STATE.md`; log decisions in `DECISIONS.md`.
6. Any deviation from this spec, with your reasoning.

---
---

# Prompt 8 — Payments ledger & reversals

**Role:** You are a senior engineer implementing an append-only financial ledger UI, where immutability and offline correctness are the defining requirements.

**Goal:** Ship manual payment recording (full and partial) and corrections via reversals, with balances and status derived live from the ledger.

**Current state:** Prompts 1–7 complete — schema with append-only `payment_events`, sync, derivation logic, repositories, auth, clients, and invoices with lifecycle and locking. The invoice detail page has an empty payments section shell.

**Constraints:**
- Read `prd_docs/clario-prd.md` §9 Epic 4 (payments), §5.2 (`payment_events`), §6.1 (derived status), §12.4 (payment method list).
- **The ledger is append-only and immutable.** There must be **no** edit-payment and **no** delete-payment UI anywhere. Corrections happen exclusively by appending a reversal. Any control labelled "Edit payment" or "Delete payment" is a design violation.
- **Payment currency is fixed to the invoice's** — display it as text, never offer a selector.
- **Method is a fixed list:** `cash`, `bank_transfer`, `card`, `mobile_money`, `other`, plus an optional free-text note.
- **Overpayment is legitimate** — warn, but do not block.
- **Balance and status are derived** from the ledger, never written to a column.
- Recording a payment offline must be instant and sync later.
- No payment-processor integration — manual recording only.
- Reversals must be visually distinguished by more than colour.
- Do not build: the dashboard, PDF, or PWA work.

**Task:**
1. Record payment dialog, triggered from invoice detail and from client detail (after choosing an invoice) — `amount` in major units (required, greater than zero), `occurred_at` (defaults today), `method` (fixed list), optional `note`. Shows invoice number, total, already paid, and balance due as context, plus a "Pay full balance" affordance. Submits via `PaymentRepo.record`.
2. Payments section on invoice detail — live list newest-first showing amount, date, method, and note per entry, with reversal entries clearly labelled. A live summary above shows total paid, balance due, and the derived status badge. Per-payment **Reverse** action on non-reversal entries not already reversed.
3. Reversal flow — confirmation explaining the original record is preserved and a correcting entry will be added; optional reason note; calls `PaymentRepo.reverse`. Afterwards the original is visibly marked reversed and its Reverse action disappears.
4. Client payment history, replacing the prompt 6 shell — all events across the client's invoices, newest first, reversals included and marked.
5. Ensure status badges across list and detail views update live on record and reverse.

**Acceptance criteria:**
1. A partial payment reduces the balance correctly and flips the badge to **Partially paid**, instantly.
2. A second payment settling the remainder gives **Paid** with a zero balance.
3. A payment recorded offline appears immediately, shows a pending upload, and syncs on reconnect.
4. Reversing produces a negative entry, returns the balance to its prior value, and leaves the original Postgres row byte-identical — compare `id`, `amount_minor`, and `created_at` before and after.
5. No UI exists to edit or delete a payment, and grep confirms no `UPDATE` or `DELETE` against `payment_events`. **Controls:** (a) show the grep pattern matching legitimate `UPDATE` statements on other tables; (b) confirm the **Reverse** action IS offered on a normal payment, so "no edit/delete control" isn't satisfied by a payments list that renders no actions at all. Also re-verify Prompt 7 criterion 7's negative half here: editing line items on an invoice that now has a payment must be blocked.
6. Reversing an already-reversed payment isn't offered and throws if forced programmatically. **Positive control:** reversing a normal, un-reversed payment succeeds in the same session.
7. Overpayment is permitted with a warning, showing **Paid** with a negative balance and no crash.
8. No currency selector appears in the payment form.
9. **Two browser profiles, both offline**, each recording a payment against the same invoice, then both brought online: **both** events survive and the balance equals their sum. No lost write. Report: (a) evidence both profiles were genuinely offline at record time — pending-upload counts of at least 1 on each; (b) the two specific event UUIDs, both present in Postgres afterwards; (c) the exact resulting balance, asserted equal to the arithmetic sum, not merely "non-zero" or a row count of 2.
10. The method select offers exactly: cash, bank transfer, card, mobile money, other.
11. Client payment history attributes each event to the correct invoice.

**Output, in this order:**
1. The components you'll create, and why — before writing any code.
2. The code.
3. Results for all eleven acceptance criteria, with **verbatim evidence** for 4 and 9 — criterion 9 is the core proof of the offline ledger design and must be executed with two real browser profiles, not simulated.
4. Run `/review`, then `/qa` in a real browser covering the offline concurrency scenario. Report findings and fix anything surfaced.
5. Update `prd_docs/PROJECT_STATE.md`; log decisions in `DECISIONS.md`.
6. Any deviation from this spec, with your reasoning.

---
---

# Prompt 9 — Client financial view

**Role:** You are a senior product engineer with a strong design sensibility, assembling the screen that defines this product's core value.

**Goal:** Turn the client detail page into an instant, zero-latency answer to "where do I stand with this client financially?"

**Current state:** Prompts 1–8 complete — the full data layer plus clients, document links, invoices with lifecycle, and the payments ledger. The client detail page has all its sections populated but hasn't been composed or refined as a whole.

**Constraints:**
- Read `prd_docs/clario-prd.md` §9 Epic 5 (client financial view), §6.2 (aggregates), §1 (positioning).
- **Money first, context second.** Financial state sits at the top; contact details, notes, and links sit below and read quieter. They are supporting context, not the reason the page is opened.
- **Zero-latency reads:** everything renders from local SQLite with no spinner on a warm cache and no layout shift while data resolves.
- **Never sum across currencies** — one line per currency, ordered with the profile's default first, then by amount descending.
- Mobile-first, verified at 375px, with the financial answer visible without scrolling for a typical client.
- Status conveyed by text as well as colour; keyboard navigable; labelled controls.
- This step is composition and refinement — avoid rebuilding what prompts 6–8 already ship.
- Do not build: the dashboard, PDF, or PWA work.

**Task:**
1. Financial header — name and company; **outstanding per currency**, prominent, with amount, invoice count, and overdue count where non-zero; a secondary line of total paid to date per currency. When nothing is owed, show a calm settled state rather than rows of zeros.
2. Invoices section — filter control (All · Outstanding · Overdue · Paid · Draft); default sort unpaid and overdue first then date descending; a per-row quick action to record a payment on unpaid `sent` invoices; a "New invoice" action; an inviting empty state.
3. Payment history section — all events across the client's invoices, newest first, reversals marked, each linking to its invoice. Collapse to the most recent 10 with a "Show all" affordance so a long history doesn't bury what follows.
4. Context section — contact details with tap-to-email and tap-to-call on mobile, notes, and document links, visually quieter than the financial content.
5. Layout and polish pass across the whole page.

**Acceptance criteria:**
1. With the network disabled, opening a client renders the full financial state instantly — no spinner, no layout shift.
2. A client with NGN and USD invoices shows two outstanding lines and no combined total anywhere. **Positive control:** report both amounts and confirm each is arithmetically correct — a page that failed to render also shows no combined total.
3. The profile's default currency sorts first even when another currency is larger.
4. Overdue counts are accurate — test with a past due date.
5. Recording a payment from the quick action updates the header, the invoice row, and the history live without a refresh.
6. All four filters return correct sets while offline. Each filter must be shown to **include** the invoices it should and **exclude** the ones it shouldn't; report counts for both halves. A filter returning nothing would otherwise appear to "exclude correctly."
7. A client with no invoices shows settled and empty states, not zeros or broken layout.
8. A client with 50+ invoices and 100+ payments renders quickly and the history collapses correctly.
9. At 375px the outstanding balance is visible without scrolling.
10. Voided invoices are excluded from outstanding but remain under the All filter.
11. A screen-reader pass confirms status badges announce their text label.

**Output, in this order:**
1. The components you'll create or refactor, and why — before writing any code.
2. The code.
3. Results for all eleven acceptance criteria, with observed behaviour for 2, 5, and 9.
4. Run `/review`, then `/design-review` to verify visual layout and polish at 375px, then `/qa` to confirm interactive behavior. Report findings and fix anything surfaced.
5. Update `prd_docs/PROJECT_STATE.md`; log decisions in `DECISIONS.md`.
6. Any deviation from this spec, with your reasoning.

---
---

# Prompt 10 — Multi-currency dashboard

**Role:** You are a senior engineer with a strong visual design background, working on a Next.js / Tailwind mobile-first PWA dashboard.

**Goal:** Ship the responsive dashboard showing outstanding invoices, recent payments, and earnings, sorted and grouped by currency according to progressive disclosure rules.

**Current state:** Prompts 1–9 complete — schema, sync, core logic, repositories, auth, clients, document links, invoices, payments, client view. The `/` dashboard page is a protected redirect placeholder.

**Constraints:**
- Read `prd_docs/clario-prd.md` §9 Epic 6 (dashboard), §6.2 (aggregates), §1 (positioning).
- **Never sum across currencies** — the dashboard groups and displays outstanding, recent payments, and earnings per currency. No conversions, no single reported total.
- **Progressive disclosure:** if a user only bills in USD, they see a clean dashboard with no multi-currency headers, no currency selectors, and no multi-currency dropdowns. The multi-currency layout discloses itself only when a second currency is introduced.
- **Never provide a currency filter that hides money** — hiding a currency hides debt.
- Default currency sorts first, then others by amount descending.
- Mobile-first, verified at 375px. Status conveyed by text as well as colour.
- Do not build: PDF or PWA installation prompts.

**Task:**
1. `/` (Dashboard) layout — grid or stack of cards showing: Outstanding total per currency; Earnings total per currency for a selectable period (last 30 days default, 90 days, 1 year, all-time); Recent payments (default 10) with client name and invoice number context.
2. Outstanding breakdown — each currency row shows: total outstanding, invoice count, and overdue count (where >0), with a drill-down action navigating to a pre-filtered client/invoice view.
3. Earnings period selector — a single select element that updates all currency earnings cards in unison. Earnings sums subtract reversal events occurring inside the window.
4. Recent payments — unified chronological list, no currency grouping (currencies are shown inline per item), showing amount, date, client name, and invoice number. Link to the invoice.
5. Currency overflow — with >3 currencies, display the top 3 by outstanding amount, and group the rest under a "+N more currencies" collapsible indicator.
6. Empty dashboard state — if the user has 0 clients and 0 invoices, display an encouraging onboarding layout ("Add your first client to start tracking payments") rather than empty cards or zero totals.

**Acceptance criteria:**
1. A dashboard with NGN and USD invoices shows two outstanding rows, default currency first, and no combined total.
2. Under single-currency use, no currency filters, "USD totals" dropdowns, or multi-currency UI indicators are visible. **Positive control:** with two currencies, those indicators do become visible.
3. Earnings selector updates the amount for both currencies live.
4. Reversals occurring within the selected earnings period reduce that period's total correctly. Reversals outside the period do not affect it.
5. Chronological recent payments display the client name and invoice number for each event.
6. The "+N more" overflow collapses 4+ currencies correctly.
7. An account with zero data renders onboarding actions rather than empty lists.
8. Navigation links from outstanding cards lead to correctly filtered lists.
9. Mobile layout is clear and fits within 375px without horizontal scrolling.
10. Screen reader reads the default currency and amounts cleanly.

**Output, in this order:**
1. The components you'll create or refactor, and why — before writing any code.
2. The code.
3. Results for all ten acceptance criteria, with observed behaviour for 1, 2, and 4.
4. Run `/review`, then `/design-review` focusing on the single-currency vs multi-currency transition, then `/qa`. Report findings and fix anything surfaced.
5. Update `prd_docs/PROJECT_STATE.md`; log decisions in `DECISIONS.md`.
6. Any deviation from this spec, with your reasoning.

---
---

# Prompt 11 — On-device invoice PDF

**Role:** You are a senior engineer specializing in client-side PDF generation in Next.js applications, working with `@react-pdf/renderer` or `pdf-lib`.

**Goal:** Implement on-device, offline-capable PDF generation for invoices, including business profile, client contact info, issue/due dates, line items, and totals in the invoice's currency.

**Current state:** Prompts 1–10 complete — schema, sync, repositories, auth, clients, document links, invoices, payments, client view, and dashboard. The invoice detail page has a download PDF placeholder button.

**Constraints:**
- Read `prd_docs/clario-prd.md` §9 Epic 7 (invoice PDF), §4.1 (stack), §12.3 (lazy-loading).
- **The PDF must be generated entirely on-device.** No server-side API, no external rendering service, and no remote fonts or images that would fail offline.
- **The PDF library must be lazy-loaded** (imported dynamically at generation time) to keep it out of the critical app shell bundle.
- **`internal_note` must never appear on the PDF.** This is a private field.
- The invoice PDF uses clean, professional typography and grids matching standard A4/Letter guidelines.
- (Logo is deferred — do not add image upload or local asset configuration to satisfy this).

**Task:**
1. PDF template design — layout featuring: freelancer name/address (from profile) in the header; invoice metadata (number, issue date, due date); client name/address/company; a table of line items (description, quantity, unit price, line total); a summary section showing total, amount paid (from ledger sum), and balance due.
2. Lazy-loaded PDF trigger — on `/invoices/[id]`, replace the PDF placeholder with a button that imports the generator, compiles the PDF locally, and triggers the browser's download dialog or opens the system sharing sheet.
3. View PDF action — allow the user to preview the generated PDF in an iframe or modal before downloading it.
4. Ensure the PDF works offline by testing it with the network disabled.

**Acceptance criteria:**
1. The PDF is successfully generated and downloaded with the network disabled.
2. The PDF contains correct totals, amount paid, and balance due.
3. `internal_note` is absent from the PDF. **Positive control:** verify the `internal_note` IS present on the `/invoices/[id]` screen, proving the field exists and is populated, but is excluded from the PDF.
4. Zero-decimal currencies (JPY) print without decimals in all totals and columns.
5. Quantities show up to 3 decimals (e.g. `2.500`) if fractional.
6. The bundle size of the initial page loads is unaffected by the PDF generation library (verified via dynamic import check).
7. Sharing sheet triggers correctly on mobile devices.

**Output, in this order:**
1. The components and dynamic loading strategy you'll use, and why — before writing any code.
2. The code.
3. Results for all seven acceptance criteria, with verbatim verification for 1 and 3.
4. Run `/review`, then `/qa` offline to confirm PDF generation. Report findings and fix anything surfaced.
5. Update `prd_docs/PROJECT_STATE.md`; log decisions in `DECISIONS.md`.
6. Any deviation from this spec, with your reasoning.

---
---

# Prompt 12 — PWA, offline hardening & ship

**Role:** You are a senior full-stack engineer and operations specialist, finalizing an offline-first Next.js PWA for production launch.

**Goal:** Configure the PWA manifest and service worker, clean up development diagnostics, run pre-flight security sweeps (RLS + sync rules), execute the end-to-end offline QA run, and ship to production.

**Current state:** Prompts 1–11 complete. The app is fully built but lacks service worker caching, has a temporary `/dev/sync` route, and needs final security/correctness validation.

**Constraints:**
- Read `prd_docs/clario-prd.md` §9 Epic 9 (PWA), §10 (non-functional), §11 (deployment).
- **The service worker caches static assets only.** It must **never** cache data queries or DB writes (PowerSync/SQLite owns persistence and replication).
- **Delete `/dev/sync` completely.** It is a development route that must not reach production.
- RLS and sync rules must be verified to prevent all cross-user data leakage.
- Run the full, literal offline QA checklist before landing.

**Task:**
1. PWA configuration — generate app icons (using prompt-image or standard placeholders); configure `public/manifest.json` (name, short_name, icons, start_url, display: standalone, theme_color, background_color); register a service worker in Next.js that pre-caches static assets and the HTML shell.
2. Clean diagnostics — delete the `/dev/sync` route folder and all its tests/references.
3. Pre-flight security review — run `/cso` against RLS policies in `supabase/migrations/` and the sync rules in `sync-rules.yaml`. Verify that no table permits inserts/updates/deletes on other users' records.
4. Execute the offline QA script:
   - (1) Sign in on network, let the initial sync complete.
   - (2) Turn network off.
   - (3) Create a new client, edit their name, add a doc link.
   - (4) Create an invoice with two line items.
   - (5) Record a partial payment.
   - (6) Reload the page while offline. Confirm the client, link, invoice, and payment are all visible and the sync indicator shows offline with pending updates.
   - (7) Turn network on. Confirm the sync indicator shifts to connected, pending drops to zero, and all records appear in the Supabase dashboard.
5. Clean up tests and run the full suite (`npm test`). Confirm typecheck passes.
6. Land and deploy: run `/ship` to commit, merge to main, deploy migrations, and run `/canary` on the production deployment.

**Acceptance criteria:**
1. Manifest parses with 0 errors in Chrome DevTools.
2. App is installable on desktop and mobile, launching standalone to `/`.
3. Offline reload works: with network disabled, refreshing the dashboard or client pages renders cached content immediately.
4. `/dev/sync` returns a 404.
5. All security checks pass (0 cross-user leakage paths, `payment_events` updates/deletes rejected).
6. The entire 7-step offline QA script is executed successfully, with exact verification hashes and counts recorded.
7. Test suite is green (100% pass, 0 skips).
8. Production build compiles successfully.

**Output, in this order:**
1. The deployment and PWA details you'll configure, and why — before writing code.
2. The manifest and registration code.
3. Results for all eight acceptance criteria, with the complete offline QA test report.
4. Run `/cso`, `/review`, `/design-review`, `/ship`, `/land-and-deploy`, then `/canary`. Report hashes, deploy status, and canary test outputs.
5. Update `prd_docs/PROJECT_STATE.md` marking the MVP complete; make a final entry in `DECISIONS.md`.
6. Any deviations, with reasoning.
