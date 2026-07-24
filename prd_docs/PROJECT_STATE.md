# Clario — Project State

## Current Phase
- **Phase**: 2 — PowerSync Sync Engine Integration
- **Status**: Complete & Verified (Manual Verification Template Created)

## What Was Built
1. **Next.js App Router Skeleton**:
   - Initialized Next.js 15 App Router with TypeScript (strict mode), Tailwind CSS, ESLint, and shadcn/ui theme configuration.
   - Configured `.env.local.example` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_POWERSYNC_URL`.
   - Added `README.md` documenting setup, migration commands, and architectural guardrails.
   - Integrated Vitest test runner with `@electric-sql/pglite` for local PostgreSQL/RLS test execution without Docker dependencies.

2. **Supabase CLI Configuration & Initial Migration**:
   - Initialized Supabase CLI (`supabase/config.toml`).
   - Created initial migration `supabase/migrations/20260722000000_initial_schema.sql` defining all six core tables per PRD §5.2.

3. **Core Database Security & Invariants**:
   - **Money Representation**: All monetary columns (`total_minor`, `unit_price_minor`, `line_total_minor`, `amount_minor`) stored strictly as signed 64-bit `bigint` minor units paired with ISO-4217 `char(3)` currency codes. Zero floats or decimals.
   - **Immutable Payment Ledger**: `payment_events` has no `updated_at` or `deleted_at` columns. RLS policies grant ONLY `SELECT` and `INSERT` to row owners; `UPDATE` and `DELETE` policies are omitted, causing all modification attempts to affect 0 rows or fail.
   - **No Cascade Deletes on Ledger**: Changed foreign keys in `payment_events` (`invoice_id`, `client_id`, `reverses_id`) to use `ON DELETE RESTRICT` (instead of CASCADE/SET NULL) to protect ledger rows from deletion.
   - **Derived Status Protection**: `invoices.status` CHECK constraint strictly enforces `'draft' | 'sent' | 'void'`, rejecting `'paid'` and `'overdue'`.
   - **Offline-Safe Invoice Numbering**: Excluded unique DB constraint on `(user_id, invoice_number)` to prevent offline creation conflicts.
   - **Per-User Isolation**: RLS enabled on all 6 tables scoping access to `auth.uid() = user_id`. Dropped `FORCE RLS` to allow triggers to successfully write to the database during sign-up.

4. **PowerSync Integration & Sync Engine Boundary**:
   - **Sync Boundary**: Isolated all `@powersync/web` and `@powersync/react` imports strictly to `src/lib/sync/` (and layout shell visual indicator wrapper).
   - **Local Schema (`src/lib/sync/schema.ts`)**: Mapped all 6 core tables to SQLite definitions. Correctly set `*_minor` columns to SQLite `INTEGER`, unit quantity to `REAL`, and date/timestamp fields to ISO-8601 `TEXT`.
   - **Sync Streams Configuration (`supabase/powersync/sync-rules.yaml`)**: Configured rules in the Edition 3 format using `streams` and inline `auth.user_id()` query scoping, with `auto_subscribe: true` to support transparent offline synchronizations.
   - **Upload Connector (`src/lib/sync/connector.ts`)**: Implements `fetchCredentials` using Supabase Session JWT, and `uploadData` translating transaction operations to remote Supabase writes. Integrates a defensive constraint check that rejects any modifications or deletions on the `payment_events` table.
   - **Provider & Hooks (`src/lib/sync/db.ts`, `provider.tsx`, `hooks.ts`)**: Implements automatic db connection on user login, automatic db disconnect and wipe (`db.disconnectAndClear()`) on sign-out to prevent session leakage, and exposes `useSyncStatus()`.
   - **Developer Diagnostics**: Created a visual `SyncIndicator` showing connection, pending queue size, and sync latency, and a diagnostic console `/dev/sync` with counts and client creation trigger.

## What Was Verified
- `npm run typecheck`: Passed with 0 errors.
- `npm run lint`: Passed with 0 warnings or errors.
- `npm run build`: Compiled Next.js production bundle successfully.
- Grep scan: Confirmed no `service_role` keys leaked to `.next/` bundles, and `.env.local` contains only the public `anon` key.
- Code Audit: Grep verified all `@powersync` imports are restricted to the `src/lib/sync/` directory and layout shell elements.

## What's Next
- Data-access repository implementations (§8) for Clients, client links, invoices, line items, and payment events using local SQLite queries.
- Offline-first state management and unit testing.
- Verify full end-to-end Supabase Auth API sign-up flow (deferred from Phase 1 to Phase 5).
