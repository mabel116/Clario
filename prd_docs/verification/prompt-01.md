# Verification Evidence — Prompt 01 (Skeleton and Database Schema)

All database schema migrations, local Vitest tests, and live Supabase Cloud constraints have been successfully deployed and verified.

## Verification Summary

1. **Local Test Suite**: Running `npm test` successfully executed all 9 Vitest test cases (using PGlite), which includes the new cascade restrict and signup trigger tests.
2. **Live Supabase Deployment**: Migrations were pushed cleanly using `npx supabase db push`.
3. **Live Criteria Verification**: Verification script `scripts/verify_supabase.js` executed queries against the remote database to assert RLS, constraints, and trigger behavior with explicit positive and negative controls.

---

## Live Verbatim Outputs

### Criterion 2: Migrations Applied Cleanly

The following tables exist and are properly defined in the `public` schema of the remote Supabase database:

```json
{
  "boundary": "786ff45458f4711590a07f02070de4bc",
  "rows": [
    {
      "tablename": "profiles"
    },
    {
      "tablename": "clients"
    },
    {
      "tablename": "client_links"
    },
    {
      "tablename": "invoices"
    },
    {
      "tablename": "invoice_line_items"
    },
    {
      "tablename": "payment_events"
    }
  ]
}
```

---

### Criterion 3: Money Columns are bigint

All monetary columns are verified to be typed as `bigint` (signed 64-bit integers) in the database schema:

```json
{
  "boundary": "f711a0eff501f5ab2726ab97e33553cf",
  "rows": [
    {
      "column_name": "total_minor",
      "data_type": "bigint",
      "table_name": "invoices"
    },
    {
      "column_name": "unit_price_minor",
      "data_type": "bigint",
      "table_name": "invoice_line_items"
    },
    {
      "column_name": "line_total_minor",
      "data_type": "bigint",
      "table_name": "invoice_line_items"
    },
    {
      "column_name": "amount_minor",
      "data_type": "bigint",
      "table_name": "payment_events"
    }
  ]
}
```

---

### Criterion 4: payment_events columns

Asserts that no `updated_at` or `deleted_at` columns exist on the `payment_events` table (which must remain strictly append-only):

```json
{
  "boundary": "ed44a716e05ae894b36bf249e732a846",
  "rows": []
}
```

---

### Criterion 5: Append-Only Ledger (`payment_events`) with Positive Control

We run a transaction as the `authenticated` role simulating User A. An insert is performed, followed by attempts to update and delete the record. We check:
1. `acting_user`: confirms `auth.uid()` evaluates to User A (positive control) and is not null.
2. `payment_row_exists`: confirms the insert under the authenticated role succeeded (positive control).
3. `final_amount_minor`: confirms subsequent update and delete attempts did not mutate or remove the ledger row (ledger immutability).

```json
{
  "boundary": "426b65db07a0b3b2c2beba4c207cd347",
  "rows": [
    {
      "acting_user": "11111111-1111-1111-1111-111111111111",
      "final_amount_minor": 10000,
      "payment_row_exists": 1
    }
  ]
}
```

---

### Criterion 6: Multi-Tenant RLS Isolation (Positive & Negative Controls)

We assert that User A can successfully query their own records (positive control) but is completely isolated from User B's records (negative control):
1. `acting_user`: User A's UUID.
2. `own_clients_count` / `own_invoices_count`: confirms User A sees their own records (positive control).
3. `client_b_visible_count` / `invoice_b_visible_count`: confirms User A sees exactly `0` of User B's records (negative control).
4. Attempts by User A to `UPDATE` or `DELETE` User B's records return `0` affected rows.

```json
{
  "boundary": "1b2c1ec833e91c8958b2fde3387cff01",
  "rows": [
    {
      "acting_user": "11111111-1111-1111-1111-111111111111",
      "client_b_visible_count": 0,
      "invoice_b_visible_count": 0,
      "own_clients_count": 1,
      "own_invoices_count": 1
    }
  ]
}
```

---

### Cascade Restricts Test

Asserts that attempts to hard delete a parent invoice when associated payment ledger events exist must fail to protect the ledger's integrity:

```
[VERIFY CASCADE RESTRICT] Attempt hard delete on invoice with payment events...
PASS: Invoice delete failed as expected:
 Exit code 1. Error: update or delete on table "invoices" violates foreign key constraint "payment_events_invoice_id_fkey" on table "payment_events"
```

---

### Trigger-Level Sign-Up Test
*(Note: This is verified at the database trigger layer; full end-to-end API signup verification is deferred to Prompt 5).*

Inserting a user into `auth.users` automatically creates the matching `public.profiles` row with a default billing currency of `USD` (running under `postgres` bypass context):

```json
{
  "boundary": "eb4827701803eefd537082318cf838b6",
  "rows": [
    {
      "default_currency": "USD"
    }
  ]
}
```

---

## Static Code Check Results
- **Linting**: Passed cleanly with `next lint` (0 warnings or errors).
- **Compilation**: Successfully compiled optimized Next.js production build (`npm run build`).
