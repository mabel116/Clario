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
