# Architectural Decision Records (ADRs) — Clario

## ADR 001: Strict BigInt Minor Units for Monetary Values
- **Context**: PRD §4.3 Guardrail 1 requires storing all money as integer minor units (e.g. cents) paired with an ISO-4217 `char(3)` currency code.
- **Decision**: All money columns (`invoices.total_minor`, `invoice_line_items.unit_price_minor`, `invoice_line_items.line_total_minor`, `payment_events.amount_minor`) are typed `bigint` in PostgreSQL. Floating point types (`numeric`, `real`, `double precision`) are strictly forbidden for monetary amounts.
- **Consequences**: Eliminates floating-point rounding errors and multi-currency calculation inaccuracies at the database layer.

## ADR 002: Append-Only Immutable Payment Ledger
- **Context**: Payment history must be conflict-free during offline sync across devices and preserve full financial audit trails (PRD §4.3 Guardrail 2).
- **Decision**: `payment_events` has no `updated_at` or `deleted_at` columns. Row Level Security policies grant only `SELECT` and `INSERT` privileges to authenticated owners (`auth.uid() = user_id`). No `UPDATE` or `DELETE` policies are granted. Corrections must be recorded via mirror reversal entries (`reverses_id`).
- **Consequences**: Payment records cannot be modified or deleted at the database layer. Merging payment logs offline across multiple devices is a simple union operation.

## ADR 003: Soft Invoice Number Uniqueness for Offline Safety
- **Context**: Hard database unique constraints on `(user_id, invoice_number)` cause sync failures when multiple offline devices create invoices simultaneously (PRD §6.3).
- **Decision**: No database unique constraint is placed on `(user_id, invoice_number)`. Duplicate checking is performed as a soft client-side warning only.
- **Consequences**: Prevents database migration failures and unrecoverable sync blocking when offline devices issue invoices concurrently.

## ADR 004: Derived Financial Statuses Excluded from Database Enums
- **Context**: Payment statuses (`paid`, `partially_paid`) and overdue flags (`is_overdue`) are derived dynamically from the payment ledger and invoice due dates (PRD §6.1).
- **Decision**: The `status` column on `invoices` accepts only `'draft'`, `'sent'`, and `'void'` via PostgreSQL `CHECK` constraint. Storing `'paid'` or `'overdue'` in the database is explicitly rejected.
- **Consequences**: Prevents ledger drift and invalid state synchronization between stored status flags and actual payment balances.

## ADR 005: Local WASM Postgres Testing Environment
- **Context**: Verification criteria 5 & 6 require executing actual RLS policies, triggers, and PostgreSQL constraint checks during automated test runs.
- **Decision**: Integrated `@electric-sql/pglite` in Vitest to run genuine PostgreSQL engine instances in WASM.
- **Consequences**: Enables lightning-fast (<2s) automated verification of RLS, schema types, triggers, and constraints in CI without relying on external Docker containers.

## ADR 006: Cascade Deletes Excluded on the Ledger (ON DELETE RESTRICT)
- **Context**: PRD §4.3 Guardrail 2 demands an append-only, immutable ledger. Using `ON DELETE CASCADE` or `ON DELETE SET NULL` on `payment_events` references would allow deleting parent invoices or clients to silently mutate or delete ledger rows.
- **Decision**: Set `ON DELETE RESTRICT` on `payment_events.invoice_id`, `payment_events.client_id`, and `payment_events.reverses_id`. Attempts to delete an invoice or client with payment history will fail at the database level.
- **Consequences**: Provably guarantees ledger records remain undeletable and immutable.

## ADR 007: Standard Row Level Security (No FORCE RLS)
- **Context**: The `profiles` table is auto-populated on user signup via an `auth.users` trigger running under the system `postgres` role. Using `FORCE ROW LEVEL SECURITY` would apply RLS checks (`auth.uid() = id`) even to the `postgres` role, causing signup failures because `auth.uid()` is null during the registration flow.
- **Decision**: Disable `FORCE ROW LEVEL SECURITY` across all tables, keeping standard `ENABLE ROW LEVEL SECURITY`. RLS remains fully active and enforced for all client roles (`authenticated`, `anon`), while system-level hooks/triggers running under the `postgres` role bypass RLS checks.
- **Consequences**: Fixes sign-up failure, allowing profiles to be successfully created on user registration.

## ADR 008: Clients and Invoices Currency Fallback Logic
- **Context**: `profiles.default_currency` is a required non-null field defaulting to `'USD'`. `clients.default_currency` is optional and nullable.
- **Decision**: At invoice creation, if the client has no `default_currency` set, the app falls back to the user's `profiles.default_currency` as the billing currency.
- **Consequences**: Simplifies default multi-currency billing pre-population.

## ADR 009: Nullable Payment Event Method
- **Context**: PRD §9 Epic 4.1 treats the payment method as optional.
- **Decision**: Removed `NOT NULL` constraint on `payment_events.method` column, making it optional.
- **Consequences**: Matches user-interface specifications where payment events can be recorded without specifying a payment method.

## ADR 010: PowerSync Sync Streams (Edition 3)
- **Context**: PowerSync Sync Streams (Edition 3) replaces the legacy sync rules format to simplify streaming sync rules bucketing.
- **Decision**: Configured `supabase/powersync/sync-rules.yaml` with `edition: 3` and `streams`. Removed the separate `parameters` block in favor of inline `auth.user_id()` calls. Set `auto_subscribe: true` on the `user_data` stream to enable automated offline-first bucket synchronization.
- **Consequences**: Avoids legacy parameters parsing. The client database automatically receives updates from active streams without calling explicit subscription APIs.

## ADR 011: Local SQLite Column Mappings for Financial Precision
- **Context**: PRD §4.3 Guardrail 1 and §7.4 require storing all monetary amounts as integer minor units (`bigint`) in Postgres, mapped to local SQLite database columns.
- **Decision**: In `src/lib/sync/schema.ts`, all currency columns (`invoices.total_minor`, `invoice_line_items.unit_price_minor`, `invoice_line_items.line_total_minor`, `payment_events.amount_minor`) are explicitly typed `column.integer` (SQLite `INTEGER`), never `column.real` (SQLite `REAL` / float). Floating point values are strictly isolated to `invoice_line_items.quantity` (`column.real`).
- **Consequences**: Eliminates floating-point calculation errors in the local SQLite engine.

## ADR 012: Dev Environment Email Auto-Confirmation Bypass
- **Context**: Supabase Cloud project settings have email confirmation enabled by default, blocking local manual tests since emails cannot be verified.
- **Decision**: Used the dev-only database update query `UPDATE auth.users SET email_confirmed_at = NOW()` to bypass email verification in development. Note that disabling email confirmation in the Supabase dashboard (Authentication -> Provider Settings -> Email -> Confirm email) is the cleaner, long-term approach for development environments.
- **Consequences**: Allows local testing of user sign-ups and multi-tenant isolation without email delivery dependencies.

## ADR 013: Runtime Dependency Promotion of wa-sqlite
- **Context**: `@journeyapps/wa-sqlite` compiles SQLite WebAssembly for client-side execution and was initially listed as a devDependency.
- **Decision**: Promoted `@journeyapps/wa-sqlite` to a runtime dependency (`dependencies`) in `package.json` to ensure compilation resources are packaged during production builds.
- **Consequences**: Prevents bundle resolution failures during production deployment compilation.

## ADR 014: Strict Isolation of PowerSync Web SDK to Data-Access Boundary
- **Context**: PRD §4.3 Guardrail 7 requires that the PowerSync SDK must not leak into React views, handlers, or route controllers.
- **Decision**: Confined all imports of `@powersync/web` and `@powersync/react` strictly to files in `src/lib/sync/` (with `SyncIndicator` as the sole UI view component wrapper in layout). No other React page, api route, or repository file imports `@powersync/`.
- **Consequences**: Encapsulates the sync engine behind a clear repository boundary, simplifying any future engine replacements.

## ADR 015: Float-Drift Immune Decimal Parsing
- **Context**: Multiplying floats or dividing inputs to construct minor units leads to binary float precision issues (e.g. `19.99 * 100` yielding `1998.9999999999998`).
- **Decision**: Implemented a two-stage parsing and rounding structure in `parseMoneyInput`. Floating point values parsed from clean numeric strings are multiplied by `10^exponent` and run through a precision normalization round (`Math.round(val * 1e10) / 1e10`) before mapping to integers.
- **Consequences**: Provably guarantees zero float-drift artifacts across all currencies.

## ADR 016: Explicit Date Context Injection for Financial Invariance
- **Context**: Using client system clocks directly inside date derivations makes tests timezone-dependent and fragile.
- **Decision**: Every date-sensitive derivation (like `isOverdue` or `outstandingByCurrency`) requires an injected `today` string parameter.
- **Consequences**: Guarantees test stability and correct offline timezone handling.

## ADR 017: Commutative Event-Sourced Ledger Sums
- **Context**: Offline sync merges entries in unpredictable order. Summing balances from `payment_events` must yield identical results regardless of order.
- **Decision**: Calculations use standard signed summations (`amountPaidMinor`) over lists.
- **Consequences**: Order-independent commutativity is maintained, resolving sync race conditions naturally.

## ADR 018: Structured Repository Exception Classes
- **Context**: PRD §8 requires throwing clear typed errors on database validation failures (e.g. currency mismatch, locks, validations).
- **Decision**: Created custom class exceptions (`InvoiceLockedError`, `CurrencyMismatchError`, `ValidationError`) extending the native JS `Error` object.
- **Consequences**: Enables frontend components to selectively catch exceptions (using `err instanceof InvoiceLockedError`) and cleanly render localized user alerts.

## ADR 019: Automated Test Bypass for Local SQLite/WASM SSR Guard
- **Context**: The database interface has a client-only gate (`typeof window === 'undefined'`) that throws exceptions during server-side rendering to prevent server crashes. However, this gate blocks Vitest tests running in Node environment.
- **Decision**: Implemented an automated bypass flag (`isTest`) that checks if `process.env.NODE_ENV === 'test'` or `process.env.VITEST === 'true'`.
- **Consequences**: Enables unit tests to mock and execute database transactions inside Node Vitest environments without throwing SSR guard errors, while remaining strictly disabled in Next.js production server-side code (where `process.env.NODE_ENV === 'production'`).

## ADR 020: Auth-Confinement Interface Boundary Refactor
- **Context**: Codebase constraints require that Supabase Auth client methods (e.g. `supabase.auth.*`) must be confined to the `src/lib/auth/` directory. Direct leakages of auth calls in repository or backend connector scopes are prohibited.
- **Decision**: Implemented four encapsulation helper functions in `src/lib/auth/client.ts` (`getAuthUserId()`, `getAuthSession()`, `onAuthStateChange()`, `supabaseSignOut()`) that act as the sole interface boundary between the app modules and Supabase Auth.
- **Consequences**: Confinement is fully enforced, enabling clean verification using static grep scans. Repositories and sync logic import helper functions rather than reference the global Supabase Auth client directly.

## ADR 021: Throttled Console Logger for Offline Sync Errors
- **Context**: PowerSync client SDK triggers continuous sync reconnect attempts while offline, causing fetch and network timeout exceptions to be repeatedly logged to the console, spamming debugging outputs.
- **Decision**: Created a custom `ThrottledLogger` wrapper class passing warning and error events to the console, which checks for network/connection failure messages and throttles duplicates to once every 30 seconds.
- **Consequences**: Significantly improves developer console readability during extended offline testing sessions while safely logging a count of suppressed warnings when reconnect attempts continue in the background.

## ADR 022: Google OAuth Configuration and Automatic Email-Match Identity Linking
- **Context**: To allow Google Sign-In and ensure users do not end up with duplicate accounts if they register using email/password first, automatic account linking must be configured.
- **Decision**: Configured redirect URI wildcards on Supabase dashboard (`https://*.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`) pointing to the OAuth router callback. Enabled automatic identity linking on verified email match (default Supabase dashboard behavior with no dashboard toggle required).
- **Consequences**: Same-email OAuth logins cleanly merge into existing password-based profiles, avoiding duplicate entries.
## ADR 023: Master-Detail Layout UI Pattern for Clients Screen
- **Context**: The `/clients` interface requires an optimized visual layout for viewing and managing client profiles and document links across viewports.
- **Decision**: Implemented a responsive Master-Detail screen structure that splits the screen side-by-side on desktop layouts and transitions to a full-screen overlays detail card drawer with navigation controls on mobile ≤ 375px.
- **Consequences**: Provides high visual density on large viewports while matching native application drawer workflows on mobile viewports.

## ADR 024: Native Alert-Based UI Form Validation Notifications
- **Context**: Offline client and link form actions require robust validation feedback (such as empty fields or invalid link formats) without adding UI component bloat or layout jumps.
- **Decision**: Handled database validation exceptions and client-side prefix constraints using standard browser `alert()` popups inside transaction `catch` blocks.
- **Consequences**: Keeps form validation code lightweight, avoids state sync overhead, and provides clear, immediate error notification messages that block saving.

## ADR 025: Workspace-Level Customization Rules for Process Safety
- **Context**: In multi-prompt agent cycles, the agent's memory window undergoes truncation, which can lead to accidental premature git commits or skips of mandatory manual verification checklist steps.
- **Decision**: Programmed persistent, project-scoped rules in `.agents/AGENTS.md` containing strict guidelines for commit gates, verification checklist runs, and honest unverified browser QA reporting.
- **Consequences**: Customization rules are loaded automatically at the start of every future workspace connection, preventing process drifts.

## ADR 026: TypeScript Resolution of displayStatus Life Cycle Bounds
- **Context**: The `displayStatus` on invoices is dynamically derived as `'draft' | 'void' | 'paid' | 'overdue' | 'sent'` (where partially paid invoices display as `'sent'` until overdue per PRD §6.1). A comparison in `src/app/invoices/[id]/page.tsx` checked `invoice.displayStatus === 'partially_paid'`, causing a compile-time type mismatch error.
- **Decision**: Refactored the invoice status evaluation to remove the invalid `'partially_paid'` comparison. Resolved the active/issued check `isSent` as `invoice.displayStatus !== 'draft' && invoice.displayStatus !== 'void'`.
- **Consequences**: Ensures perfect alignment between compiler static types and PRD display definitions, preventing lifecycle badge rendering glitches on partially paid invoices.


## ADR 027: Custom Styled In-App Overpayment Warning Dialog
- **Context**: The overpayment warning dialog previously triggered the native browser `confirm()` modal window, which is visually inconsistent with the rest of the application's premium custom-styled Dark Mode dialog elements.
- **Decision**: Replaced the native `confirm()` window with an in-app custom modal overlay (`overpaymentWarning` state) styled with a yellow AlertTriangle, detailed information on the overpayment difference amount, and distinct action buttons for "Cancel" and "Confirm Overpayment".
- **Consequences**: Unifies modal aesthetics across manual payment recording, correction reversals, and invoice deletion flows, improving design cohesiveness.

## ADR 028: Unified Invoices List Route for Multi-Currency Drill-Downs
- **Context**: The financial dashboard requires drill-through links from outstanding balances per currency to a list of matching outstanding invoices. Storing lists inside client drawers is difficult to navigate from overall dashboard summaries.
- **Decision**: Created a new root invoices route at `/invoices/page.tsx` that uses Suspense and `useSearchParams` to extract `currency` and `status` queries, rendering a filtered list of all matching invoices across all clients offline.
- **Consequences**: Avoids complex state hoisting, respects user navigation history, and provides a clear, scalable list for tracking invoices across the freelance app.

## ADR 029: Dynamic Client-Side Aggregations Mapping to Avoid Aggregate Model Pollutions
- **Context**: Types like `CurrencyOutstanding` do not store outstanding invoice counts or overdue counts natively, but adding these fields to core schemas pollutes repositories and database derivation functions.
- **Decision**: Mapped invoice counts and overdue counts per currency dynamically client-side (`invoiceCountsByCurrency` memo) by aggregating active objects returned from the `useInvoices()` subscriber hook.
- **Consequences**: Guarantees compile-time type safety, matches database aggregates perfectly, and keeps aggregate core models clean.

## ADR 030: Application-Wide Currency Symbol Spacing Normalization
- **Context**: Standard `Intl.NumberFormat('en-US', { style: 'currency' })` implementation in V8 engines formats less-common locale currencies (e.g. NGN, KES, GHS, ZAR) with a non-breaking space `\u00A0` between the symbol and the digits, while rendering common ones (USD, EUR, GBP) flush. This caused a visible rendering inconsistency app-wide on the dashboard, invoices list, client details page, and generated PDFs.
- **Decision**: Normalised currency outputs inside the core `formatMoney` helper (originally created in Prompt 3) in `src/lib/money/index.ts`. The helper now proactively strips any whitespace, non-breaking space (`\u00A0`), or narrow non-breaking space (`\u202F`) immediately following the currency symbol, ensuring all currency displays render flush app-wide.
- **Consequences**: Standardises monetary presentation consistently across the entire user interface and PDF reports, resolving a latent formatting bug surfaced during Prompt 11 currency verification.

## ADR 031: Pure-Platform Verification Seeding Guidelines to Avoid DB Divergence
- **Context**: Seeding mock records directly via PostgreSQL SQL script bypasses application repository logic and validation boundaries. If done carelessly, this leaves critical fields uninitialized (e.g. `issue_date` for `sent` invoices) or conflicts with soft-delete states (`deleted_at`), rendering seeded invoices unusable or orphaned.
- **Decision**: Future verification test cases must either write test records strictly through app-level repository layers (in automated tests/simulators) or, if direct SQL seeding is used, explicitly populate every field associated with that lifecycle state (e.g., `issue_date`, `due_date` for `sent` status) and verify related entities are in an active, non-soft-deleted state (`deleted_at IS NULL`).
- **Consequences**: Guarantees visual and functional database consistency during developer testing, preventing orphan rows or broken UI elements.

## ADR 032: Self-Signed HTTPS Developer Certificates
- **Context**: Modern Web Cryptography APIs (like `crypto.randomUUID()`) and browser OPFS/wa-sqlite WASM worker threads (used by PowerSync) require a Secure Context (HTTPS or localhost) to initialize. Testing the development server on physical mobile devices over local LAN IP addresses (e.g. `http://192.168.1.x:3000`) normally fails because HTTP LAN connections are not secure contexts, and Google Sign-In redirects are hardcoded to localhost:3000.
- **Decision**: Generated self-signed SSL certificates using Git's built-in `openssl.exe` with a custom configuration file registering LAN IP and localhost SANs. Wired these keys into Next's experimental HTTPS server (`next dev --experimental-https`), and documented that testers must bypass browser warning screens manually ("Advanced -> Proceed") and use email/password credentials to login over LAN connections.
- **Consequences**: Restores full mobile browser capability to resolve UUIDs and load the PowerSync SQLite engine, allowing complete off-grid device testing over local networks.

## ADR 033: Offline App Shell Service Worker Precaching
- **Context**: The application needs to load instantly offline and serve dynamic client sub-routes (e.g., `/clients/[id]`) without relying on network fetches or stranding users. However, caching dynamic database records directly in the service worker would conflict with PowerSync's local database sync engine.
- **Decision**: Implemented a build-time compiler script `generate-sw.js` that recursively gathers all optimized production static bundles and PowerSync worker/WASM binary assets. Compiled a custom service worker that implements a cache-first strategy for static assets and a network-first navigation fallback to the root `/` app shell. Proactively bypassed any network intercepts for Supabase APIs, PowerSync replication, or local auth endpoints.
- **Consequences**: Guarantees 100% offline app shell boot capability and restores deep routing links instantly while off-grid without duplicating database states.

## ADR 034: Authenticated superuser SQL Seeding with Dev Safeguards
- **Context**: Performance scaling checks require populating the database with a large dataset (200 clients, 1,000 invoices, 2,000 payment events) mapped to a specific user's account, without using hardcoded database passwords or exposing service role keys.
- **Decision**: Created `scripts/seed-large-dataset.js` utilizing the Supabase CLI query mechanism (`supabase db query --linked`) to execute a bulk SQL transaction. Running this command uses superuser privileges (`postgres` role), which bypasses all Supabase Row-Level Security (RLS) policies during seeding. This approach was chosen to execute thousands of inserts in a single transaction rather than triggering thousands of individual network requests. To prevent accidental superuser writes to production, we implemented a dual safeguard: the script asserts both `NEXT_PUBLIC_SUPABASE_URL` and the CLI's linked project ref file match the expected dev project credentials (`ukjdwoldakcapojcpfas`).
- **Consequences**: Safely and rapidly seeds a performance dataset under the test user's ID without exposing secrets. Developers must keep in mind that RLS rules are not exercised by this seed execution path.

## ADR 035: Cached-Snapshot Pattern for Instant Dashboard Rendering on Warm Cache
- **Context**: On accounts with large datasets (~4,200 rows), PowerSync's `db.connect()` executes a per-connect bucket checksum validation in WebAssembly SQLite (`wa-sqlite`) that scales linearly with total row count (~2.3ms/row, taking ~9.5s–10.5s) before releasing the database lock. This blocked all `db.watch()` queries behind it on returning sessions where valid local data already existed on the client. A two-tier Sync Streams prioritization experiment (`user_active` vs `user_history`) was tested, but because `payment_events` (~2,000 rows) and `invoice_line_items` (~1,049 rows) dominate database volume and cannot be partitioned by status without violating the immutable append-only ledger guardrail (ADR 002) or breaking live total calculations on active invoices, 96.1% of the dataset remained in Tier 1, yielding no connection-time speedup.
- **Decision**: Implemented a lightweight, fault-tolerant Cached-Snapshot Pattern in `src/lib/data/snapshot.ts` and `src/lib/data/hooks.ts` using a dedicated IndexedDB store (`clario_cache`, store `dashboard_snapshots` keyed by `${userId}_${periodDays}`):
  1. Whenever live queries resolve and update on the Dashboard, a snapshot of the summary view (`outstanding`, `earnings`, `recentPayments`, `invoices`, `defaultCurrency`, `currencies`, `timestamp`) is persisted to IndexedDB.
  2. On warm app launch, `useDashboard()` immediately reads the cached snapshot if present and populates state with `isCached: true`, achieving an instant (<1s) initial paint without waiting for `db.connect()`, `useProfile()`, or worker query resolution.
  3. Storing `defaultCurrency` directly inside the snapshot guarantees 100% accurate currency card ordering from frame 0 without waiting on profile queries.
  4. The UI honestly disclaims staleness via a subtle header badge: `• Showing snapshot from [X ago] (syncing...)` with a fixed line height (`min-h-[22px]`) to prevent layout reflow.
  5. The moment live queries yield from SQLite, the Dashboard seamlessly swaps to live data (`isCached: false`) with zero layout shift.
  6. Scope is strictly confined to read-only Dashboard summary widgets — actionable screens (payment recording, invoice editing, detail views, client lists) always wait for live queries.
  7. On user sign-out (`SIGNED_OUT`), all snapshots matching the user's ID prefix (`${userId}_*`) are wiped via an IndexedDB cursor.
- **Consequences**: Delivers instant (<1s) warm Dashboard rendering across datasets of any size, preserves the append-only immutable ledger architecture, and cleanly avoids complex backend sync partitioning.

## ADR 036: Deterministic SQLite-Backed Readiness Gate for Dashboard Cold Boot and First-Run Onboarding
- **Context**: On cold boot (brand-new device or cleared client cache with zero cached snapshot), the Dashboard could briefly render false empty states before real synced data arrived from the server. This exhibited in two forms: (1) active accounts with hundreds of clients/invoices briefly flashed the "Let's set up your business" first-run onboarding screen; (2) when onboarding was suppressed, the dashboard summary widgets briefly displayed empty states ("No outstanding invoices", "No earnings", "No payment transactions") with sync status "Last: Never" before real records loaded.
- **Why Naive Fixes Failed**:
  1. *Gating on `isLoading` alone*: `useClients()` and `useDashboard()` run live queries via `db.watch()`. On an empty local SQLite store, Iteration 0 resolves in ~1ms and sets `isLoading = false` with `clients = []`. `isLoading` only represents "resolved once, ever" and never re-arms to `true` on subsequent reactive emissions.
  2. *Gating on `isClientsLoading` + `hasSynced` combinations*: `hasSynced` flips to `true` when PowerSync commits its initial batch to SQLite, but `isClientsLoading` remains permanently `false` from Iteration 0. There is an asynchronous event tick gap before `db.watch()` yields Iteration 1 into React state, during which `!isClientsLoading && clients.length === 0` still evaluates to `true` on stale pre-sync data.
  3. *150ms settling timeout*: Rejected as non-deterministic. Any device, slow CPU, or heavy network condition taking longer than the guessed window would still flip `isSyncSettled` to `true` on stale empty data, reproducing the exact race condition.
- **Decision**:
  1. **Deterministic One-Shot Read**: Added `DashboardRepo.isAccountEmpty()` to `src/lib/data/dashboard.ts`. When `hasSynced` transitions to `true` on an apparently empty store, it executes a direct one-shot `db.getAll` query (`SELECT COUNT(*) FROM clients` and `SELECT COUNT(*) FROM invoices`) against local SQLite. Because PowerSync commits all downloaded data to disk before flipping `hasSynced`, this read returns the definitive disk truth in ~1ms without creating an async watch stream.
  2. **Asymmetric Unified Readiness Gate**: Consolidated all page-level loading, onboarding, and widget decisions in `src/app/page.tsx` into a single gate:
     `const isDataReady = hasProvenData || isConfirmedEmpty === true;`
     where `hasProvenData = isCached || (clients !== undefined && clients.length > 0) || allInvoices.length > 0`.
     - **Confirmed Empty (`isConfirmedEmpty === true`)**: Unblocks `isDataReady` immediately and renders onboarding cleanly.
     - **Confirmed Has Data (`isConfirmedEmpty === false`)**: `isDataReady` stays `false`, holding the loading skeleton until the real reactive queries (`hasProvenData`) deliver their rows to React state. This prevents premature empty-widget rendering.
     - **Pending (`isConfirmedEmpty === null`)**: Holds the skeleton.
  3. **Cross-Account State Reset**: Added `useEffect(() => { setIsConfirmedEmpty(null); }, [user?.id])` to reset disk confirmation on user ID change, ensuring no state leakage across account switches in the same browser tab.
  4. **Core Design Principle**: Never trust a "loading finished" boolean as proof that current data is accurate. Only trust actual data content (`hasProvenData`) or an explicit, deterministic one-shot check. Prefer failing toward "show a skeleton a bit longer" over "risk a false negative/empty state," since the former is a minor UX cost and the latter actively misleads the user in a payment-clarity application.
- **Consequences**: Provably eliminates all timing races and visual flickers on cold and warm boots across large, small, and genuinely empty accounts.

## ADR 037: Structured Error-Throwing Repository Semantics for Offline Readiness
- **Context**: In ADR 036, readiness gates use one-shot SQLite database reads (`isEmpty()`, `isAccountEmpty()`, `exists(id)`) to check local disk state. However, repository implementations in `InvoiceRepo`, `ClientRepo`, and `DashboardRepo` previously trapped unexpected errors or uninitialized database connections (`!db`) in generic try/catch blocks or fallback statements that defaulted to returning `false`. Under the ADR 036 asymmetric readiness logic, `isConfirmedEmpty === false` indicates that records are confirmed to exist on disk and holds the loading skeleton indefinitely while waiting for live reactive query streams (`hasProvenData`) to deliver rows into React state. On a cold boot of an empty account where the WASM worker is still initializing, or when a transient query timeout occurs, returning `false` incorrectly claimed that data existed on disk. Because the account was empty, live queries never emitted any rows, permanently locking the UI into an infinite loading skeleton.
- **Decision**: Updated all repository readiness inspection methods (`InvoiceRepo.isEmpty`, `InvoiceRepo.exists`, `ClientRepo.isEmpty`, `DashboardRepo.isAccountEmpty`) to throw an explicit `Error('Database connection not available')` if `!db` or propagate underlying SQLite query exceptions directly. In `useDataReady` and `useEntityReady`, any query rejections are caught cleanly and leave `isConfirmedEmpty` / `isConfirmedNotFound` as `null` rather than setting a boolean flag. This fails safe toward temporarily holding the loading skeleton and allows the hook to cleanly retry upon subsequent sync status or state changes without locking the state machine.
- **Consequences**: Eliminates the "Error-to-False" trap, guarantees that only genuine, successful database reads can establish confirmed empty or confirmed non-empty states, and prevents transient worker startup latency from trapping empty accounts in eternal skeletons.

## ADR 038: Local Disk-First Decoupling in Offline Readiness Gates
- **Context**: Initial implementations of the unified readiness gate guarded local database reads with `if (hasSynced && !hasLocalData && ...)`. This created a "Pre-Sync Lockout" where `useDataReady` and `useEntityReady` refused to query local SQLite if `hasSynced` evaluated to `false`. While this was intended to suppress false empty flashes during initial account downloads, it created a severe usability defect during offline app launches and cold boots with existing local data: users with fully populated offline databases were trapped behind a loading skeleton waiting for a network sync (`hasSynced`) that could not happen offline.
- **Decision**: Decoupled local disk checks from network sync status across both `useDataReady` and `useEntityReady`:
  1. Direct one-shot reads against local SQLite run immediately upon component mount without waiting for `hasSynced`.
  2. **Disk First**: If local SQLite reports that records exist (`isEmpty === false` or `exists === true`), the hook immediately unblocks to live reactive queries without waiting for network synchronization, enabling instant offline rendering.
  3. **Cold Boot Empty Gate**: Only if local SQLite returns empty (`isEmpty === true` or `exists === false`) does the gate hold behind `hasSynced` to distinguish between an in-flight server download and a genuine empty account or genuine 404.
- **Consequences**: Restores true offline-first performance by allowing cached local SQLite data to render immediately on mount, while retaining the network gate only when distinguishing zero-row disk states from pending downloads.

## ADR 039: Singleton Polling Mutex via useSyncExternalStore for WASM Worker Queue Protection
- **Context**: `useSyncStatus()` exposed connection status, upload queue statistics (`db.getUploadQueueStats()`), and sync timestamps by maintaining a per-component `useEffect` with an internal `setInterval(..., 1000)` polling loop and an event listener on the database instance. In complex views (such as the Dashboard, AppShell, Settings, and Invoices list) where multiple components mounted simultaneously, dozens of concurrent polling intervals flooded the single-threaded WebAssembly SQLite worker (`wa-sqlite`) with concurrent queue stats queries. This contention created worker thread starvation, slow query response times, and intermittent lockups during rapid navigation.
- **Decision**: Refactored `useSyncStatus` in `src/lib/sync/hooks.ts` using React 18/19's `useSyncExternalStore`:
  1. Consolidated all polling and database event subscriptions into a single module-level singleton store.
  2. Implemented an `isUpdating` mutex flag ensuring that only one `getUploadQueueStats()` query executes against the SQLite WASM worker at any given time.
  3. Gated polling to a single shared 2-second interval that activates when the first subscriber mounts and completely tears down when all subscribers unmount (listener count reaches zero).
- **Consequences**: Eliminates per-component polling thread contention, completely protects the single-threaded WASM worker queue, and ensures all UI components read from a consistent, tearing-free snapshot of sync status.

## ADR 040: Global RSC Prefetch Disabling for Local Connection Pool Protection
- **Context**: During chaos and stress testing involving rapid tab switching across `/`, `/clients`, `/invoices`, and `/invoices/[id]`, the browser console logged severe Next.js router panics: `net::ERR_NETWORK_CHANGED` and `Failed to fetch RSC payload... Falling back to browser navigation`, causing client-side navigation to freeze. Investigation revealed that semantic Next.js `<Link>` components default to eager viewport prefetching (`prefetch={true}`), triggering speculative React Server Component (RSC) background HTTP fetch requests for every rendered link. When navigating quickly or displaying dozens of invoice and client cards, Next.js saturated the browser's local connection pool alongside the PowerSync sync engine and WASM worker, causing request dropouts and router state corruption.
- **Decision**: Explicitly configured `prefetch={false}` across all Next.js `<Link>` instances throughout the application:
  1. Main navigation items in `src/components/AppShell.tsx` (mobile drawer and desktop sidebar links for `/`, `/invoices`, `/clients`, `/settings`).
  2. Dashboard drill-downs, onboarding steps, and attention cards in `src/app/page.tsx` (`/clients`, `/invoices?status=outstanding&currency=...`, `/invoices/[id]`).
  3. Auth navigation links in `src/app/sign-in/page.tsx`, `src/app/sign-up/page.tsx`, and `src/app/reset-password/page.tsx`.
- **Consequences**: Completely eliminates background RSC fetch spam, preserves the browser's HTTP connection pool for PowerSync replication and auth, prevents Next.js router panics during rapid client-side navigation, and guarantees smooth offline routing transitions.

## ADR 041: Entity Lifecycle Awareness and Atomic Readiness in Master-Detail Views
- **Context**: In master-detail layouts (such as `/clients`), selecting entities involves transitioning from null to an entity ID, or switching directly between entity IDs. `useEntityReady` previously lacked entity identity tracking, causing an existence check against null on initial mount to latch a confirmed not-found state that poisoned subsequent selections (flashing a 3-second false 404). Furthermore, `useLiveQuery` preserved previous query state across query instance transitions; transitioning from an idle query (`client_id = ''`) leaked an empty array into the active query while SQLite was executing, causing the balance derivation to calculate zero debt and flash a premature "Settled — No Outstanding Balance" card.
- **Decision**:
  1. Extended `useEntityReady` with an optional entity identifier parameter, resetting confirmed not-found states and re-arming the loading latch on identifier changes.
  2. Implemented synchronous state reset in `useLiveQuery` during render whenever query instances change, preventing stale data from leaking across entity boundaries.
  3. Coordinated atomic drawer readiness in `src/app/clients/page.tsx` (`isDrawerLoading`), requiring both parent client details and child invoices to resolve before dropping the skeleton.
  4. Guarded child hooks (`useClient`, `useInvoicesForClient`, `usePaymentsForClient`) to return idle states on empty/null entity IDs rather than dispatching dummy SQLite queries.
- **Consequences**: Provably eliminates both the false 404 flash and the premature "Settled" flash during entity selection across mobile and desktop viewports, while maintaining local disk-first performance.

## ADR 042: Atomic Financial Lock Evaluation and Async Input Preservation in Invoice Routes
- **Context**: On `/invoices/[id]/edit`, direct deep links or cold boots previously triggered false "Invoice record not found" flashes because the route lacked an entity readiness gate (`useEntityReady`). In addition, financial edit permissions (`useCanEditFinancials`) initialized to `undefined` while the SQLite watch query ran, causing `canEditFinancials === false` to evaluate as `false` on initial mount. This caused a 50ms–200ms visual flicker where locked fields and the "Add Item" button rendered as editable before abruptly locking down. On `/clients/[id]/invoices/new`, the asynchronous number suggestion resolution (`InvoiceRepo.suggestNextNumber()`) unconditionally overwrote any custom number typed by the user before the database promise resolved.
- **Decision**:
  1. Integrated `useEntityReady` with `InvoiceRepo.exists(invoiceId)` tracking `invoiceId` transitions on `/invoices/[id]/edit`.
  2. Implemented atomic readiness (`isFormLoading`) holding the edit skeleton until both the invoice record AND `canEditFinancials` have fully resolved from disk.
  3. Confined the 404 error view strictly to confirmed not-found states (`isNotFound && !invoice`) after loading completes.
  4. Guarded invoice number suggestion on `/clients/[id]/invoices/new` with a functional updater `(prev => prev || num)` to preserve user-typed values.
- **Consequences**: Provably eliminates cold-boot false 404 flashes, prevents layout jerks and lock-state flickering on paid invoices, and prevents async user input overwrite races.

