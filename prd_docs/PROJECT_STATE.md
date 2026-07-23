# Clario — Project State

## Current Phase
- **Phase**: 1 — Project Skeleton & Database Schema Definition
- **Status**: Complete & Verified

## What Was Built
1. **Next.js App Router Skeleton**:
   - Initialized Next.js 15 App Router with TypeScript (strict mode), Tailwind CSS, ESLint, and shadcn/ui theme configuration.
   - Configured `.env.local.example` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_POWERSYNC_URL`.
   - Added `README.md` documenting setup, migration commands, and architectural guardrails.
   - Integrated Vitest test runner with `@electric-sql/pglite` for local PostgreSQL/RLS test execution without Docker dependencies.

2. **Supabase CLI Configuration & Initial Migration**:
   - Initialized Supabase CLI (`supabase/config.toml`).
   - Created initial migration `supabase/migrations/20260722000000_initial_schema.sql` defining all six core tables per PRD §5.2:
     - `profiles`: Extends `auth.users`
     - `clients`: Soft-deletable client context
     - `client_links`: Document URLs attached to clients
     - `invoices`: Invoices header with derived status safety
     - `invoice_line_items`: Line items with minor unit prices and quantities
     - `payment_events`: Append-only, immutable payment ledger

3. **Core Database Security & Invariants**:
   - **Money Representation**: All monetary columns (`total_minor`, `unit_price_minor`, `line_total_minor`, `amount_minor`) stored strictly as signed 64-bit `bigint` minor units paired with ISO-4217 `char(3)` currency codes. Zero floats or decimals.
   - **Immutable Payment Ledger**: `payment_events` has no `updated_at` or `deleted_at` columns. RLS policies grant ONLY `SELECT` and `INSERT` to row owners; `UPDATE` and `DELETE` policies are omitted, causing all modification attempts to affect 0 rows or fail.
   - **Derived Status Protection**: `invoices.status` CHECK constraint strictly enforces `'draft' | 'sent' | 'void'`, rejecting `'paid'` and `'overdue'`.
   - **Offline-Safe Invoice Numbering**: Excluded unique DB constraint on `(user_id, invoice_number)` to prevent offline creation conflicts.
   - **Per-User Isolation**: RLS and FORCE RLS enabled on all 6 tables scoping access to `auth.uid() = user_id`.
   - **Indexes**: Added 8 performance indexes across user_id, client_id, invoice_id, and payment history ordering.
   - **Auth Trigger**: Added `handle_new_user()` trigger on `auth.users` insert auto-populating `profiles` with `default_currency = 'USD'`.

## What Was Verified
- `npm run typecheck`: Passed with 0 errors.
- `npm run lint`: Passed with 0 warnings or errors.
- `npm run build`: Successfully compiled Next.js production bundle.
- `npm test` (Vitest): 7/7 tests passed.
- `node scripts/verify_criteria.mjs`: All 9 acceptance criteria verified against PostgreSQL engine with verbatim logs captured.
- Grep scan: 0 service-role keys found in codebase or committed env files.

## What's Next
- Data-access / repository layer implementation (§8) with PowerSync local SQLite integration.
- Offline-first state management and reactive queries.
