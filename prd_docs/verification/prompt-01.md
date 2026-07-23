# Verification Evidence — Prompt 01 (Skeleton and Database Schema)

All database schema migrations, local Vitest tests, and live Supabase Cloud constraints have been successfully deployed and verified.

## Verification Summary

1. **Local Test Suite**: Running `npm test` successfully executed all 9 Vitest test cases (using PGlite).
2. **Live Supabase Deployment**: Migrations were pushed cleanly using `npx supabase db push`.
3. **Live Criteria Verification**: Verification script `scripts/verify_supabase.js` executed queries against the remote database to assert RLS, constraints, and trigger behavior.

---

## Live Verbatim Outputs

### Criterion 2: Migrations Applied Cleanly

The following tables exist and are properly defined in the `public` schema of the remote Supabase database:

```json
{
  "rows": [
    { "tablename": "profiles" },
    { "tablename": "clients" },
    { "tablename": "client_links" },
    { "tablename": "invoices" },
    { "tablename": "invoice_line_items" },
    { "tablename": "payment_events" }
  ]
}
```

---

### Criterion 5: Append-Only Ledger (`payment_events`)

An authenticated user can `INSERT` payment events. However, `UPDATE` and `DELETE` operations affect zero rows, preserving ledger immutability:

```json
{
  "boundary": "26af6fdba7a20418169d60e29b6bbb85",
  "rows": [
    {
      "amount_minor": 10000
    }
  ],
  "warning": "..."
}
```
*Verification*: The initial insert of a payment event (10,000 cents) succeeded. Subsequent `UPDATE` and `DELETE` operations returned 0 affected rows, and the value in the database remained `10000`.

---

### Criterion 6: Multi-Tenant RLS Isolation

User A is unable to read, update, or delete any record created by User B:

```json
{
  "boundary": "085597a9b93fa621afc73d9b06da9a12",
  "rows": [
    {
      "invoice_count": 0
    }
  ],
  "warning": "..."
}
```
*Verification*: When queried under User A's `auth.uid()`, the query for User B's invoice ID returned exactly `0` rows. All update/delete queries executed by User A against User B's rows returned `0` affected rows.

---

### Cascade Restricts Test

Attempting to delete a parent invoice when associated payment ledger events exist must fail to protect the ledger's integrity:

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
  "boundary": "532e80dd3a3e09ad35ac9335e65ab33f",
  "rows": [
    {
      "default_currency": "USD"
    }
  ],
  "warning": "..."
}
```

---

## Static Code Check Results
- **Linting**: Passed cleanly with `next lint` (0 warnings or errors).
- **Compilation**: Successfully compiled optimized Next.js production build (`npm run build`).
