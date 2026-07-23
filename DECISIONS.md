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

