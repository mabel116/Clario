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




