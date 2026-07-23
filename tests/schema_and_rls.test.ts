import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";

describe("Clario Database Schema & RLS Security Suite", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();

    // Create auth schema, auth.users table mock, and non-superuser role
    await db.exec(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE
      );

      -- Mock auth.uid() function simulating Supabase RLS context
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      -- Create Supabase-like authenticated role (non-superuser to enforce RLS)
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
      END
      $$;
    `);

    // Load and apply initial migration
    const migrationPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260722000000_initial_schema.sql"
    );
    const migrationSql = fs.readFileSync(migrationPath, "utf8");
    await db.exec(migrationSql);

    // Grant schema and table permissions to authenticated role
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
    `);
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  it("Criterion 2: Migration applies cleanly to a fresh database instance", async () => {
    const res = await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
    );
    const tableNames = res.rows.map((r) => r.tablename);
    expect(tableNames).toContain("profiles");
    expect(tableNames).toContain("clients");
    expect(tableNames).toContain("client_links");
    expect(tableNames).toContain("invoices");
    expect(tableNames).toContain("invoice_line_items");
    expect(tableNames).toContain("payment_events");
  });

  it("Criterion 3: Querying information_schema.columns shows every *_minor column as bigint, and zero money columns as numeric/real/double precision", async () => {
    const res = await db.query<{
      table_name: string;
      column_name: string;
      data_type: string;
    }>(
      `SELECT table_name, column_name, data_type 
       FROM information_schema.columns 
       WHERE table_schema = 'public' AND column_name LIKE '%_minor';`
    );

    expect(res.rows.length).toBeGreaterThan(0);
    for (const col of res.rows) {
      expect(col.data_type).toBe("bigint");
    }

    const invalidMoneyCols = await db.query(
      `SELECT table_name, column_name, data_type 
       FROM information_schema.columns 
       WHERE table_schema = 'public' 
         AND column_name LIKE '%_minor' 
         AND data_type IN ('numeric', 'real', 'double precision');`
    );
    expect(invalidMoneyCols.rows.length).toBe(0);
  });

  it("Criterion 4: payment_events has no updated_at and no deleted_at column", async () => {
    const res = await db.query<{ column_name: string }>(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_schema = 'public' 
         AND table_name = 'payment_events' 
         AND column_name IN ('updated_at', 'deleted_at');`
    );
    expect(res.rows.length).toBe(0);
  });

  it("Criterion 5: As an authenticated test user, inserting a payment_events row succeeds, while updating and deleting both fail or affect zero rows", async () => {
    const userAId = "11111111-1111-1111-1111-111111111111";

    // Setup base user & profile as postgres superuser
    await db.exec(`SET ROLE postgres;`);
    await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${userAId}', 'usera@example.com') ON CONFLICT DO NOTHING;`);

    // Switch to authenticated non-superuser role & set session GUC request.jwt.claim.sub
    await db.exec(`SET ROLE authenticated;`);
    await db.exec(`SET request.jwt.claim.sub = '${userAId}';`);

    const clientId = "a0000000-0000-0000-0000-000000000001";
    const invoiceId = "a0000000-0000-0000-0000-000000000002";
    const paymentId = "a0000000-0000-0000-0000-000000000003";

    await db.exec(`
      INSERT INTO public.clients (id, user_id, name) VALUES ('${clientId}', '${userAId}', 'Client A');
      INSERT INTO public.invoices (id, user_id, client_id, invoice_number, currency) VALUES ('${invoiceId}', '${userAId}', '${clientId}', 'INV-001', 'USD');
    `);

    // 1. Insert payment_events succeeds
    const insertRes = await db.query(
      `INSERT INTO public.payment_events (id, user_id, invoice_id, client_id, amount_minor, currency, method)
       VALUES ('${paymentId}', '${userAId}', '${invoiceId}', '${clientId}', 10000, 'USD', 'bank_transfer')
       RETURNING id;`
    );
    expect(insertRes.rows.length).toBe(1);

    // 2. Attempt UPDATE on payment_events
    const updateRes = await db.query(
      `UPDATE public.payment_events SET amount_minor = 20000 WHERE id = '${paymentId}';`
    );
    expect(updateRes.affectedRows ?? 0).toBe(0);

    // 3. Attempt DELETE on payment_events
    const deleteRes = await db.query(
      `DELETE FROM public.payment_events WHERE id = '${paymentId}';`
    );
    expect(deleteRes.affectedRows ?? 0).toBe(0);

    // Verify row remains untouched in database
    const selectRes = await db.query<{ amount_minor: string | number }>(
      `SELECT amount_minor FROM public.payment_events WHERE id = '${paymentId}';`
    );
    expect(String(selectRes.rows[0].amount_minor)).toBe("10000");

    await db.exec(`SET ROLE postgres;`);
  });

  it("Criterion 6: User A cannot select, update, or delete any of User B's clients or invoices", async () => {
    const userAId = "11111111-1111-1111-1111-111111111111";
    const userBId = "22222222-2222-2222-2222-222222222222";

    await db.exec(`SET ROLE postgres;`);
    await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${userBId}', 'userb@example.com') ON CONFLICT DO NOTHING;`);

    // User B creates records as authenticated user B
    await db.exec(`SET ROLE authenticated;`);
    await db.exec(`SET request.jwt.claim.sub = '${userBId}';`);
    const clientBId = "b0000000-0000-0000-0000-000000000001";
    const invoiceBId = "b0000000-0000-0000-0000-000000000002";

    await db.exec(`
      INSERT INTO public.clients (id, user_id, name) VALUES ('${clientBId}', '${userBId}', 'Client B');
      INSERT INTO public.invoices (id, user_id, client_id, invoice_number, currency) VALUES ('${invoiceBId}', '${userBId}', '${clientBId}', 'INV-B01', 'USD');
    `);

    // Switch context to User A
    await db.exec(`SET request.jwt.claim.sub = '${userAId}';`);

    // User A SELECT User B's client & invoice -> 0 rows
    const selectClients = await db.query(`SELECT * FROM public.clients WHERE id = '${clientBId}';`);
    expect(selectClients.rows.length).toBe(0);

    const selectInvoices = await db.query(`SELECT * FROM public.invoices WHERE id = '${invoiceBId}';`);
    expect(selectInvoices.rows.length).toBe(0);

    // User A UPDATE User B's client & invoice -> 0 rows affected
    const updateClient = await db.query(`UPDATE public.clients SET name = 'Hacked' WHERE id = '${clientBId}';`);
    expect(updateClient.affectedRows ?? 0).toBe(0);

    const updateInvoice = await db.query(`UPDATE public.invoices SET invoice_number = 'HACKED' WHERE id = '${invoiceBId}';`);
    expect(updateInvoice.affectedRows ?? 0).toBe(0);

    // User A DELETE User B's client & invoice -> 0 rows affected
    const deleteClient = await db.query(`DELETE FROM public.clients WHERE id = '${clientBId}';`);
    expect(deleteClient.affectedRows ?? 0).toBe(0);

    const deleteInvoice = await db.query(`DELETE FROM public.invoices WHERE id = '${invoiceBId}';`);
    expect(deleteInvoice.affectedRows ?? 0).toBe(0);

    await db.exec(`SET ROLE postgres;`);
  });

  it("Criterion 7: Two invoices for the same user can share an invoice_number without a database error", async () => {
    const userAId = "11111111-1111-1111-1111-111111111111";
    await db.exec(`SET ROLE authenticated;`);
    await db.exec(`SET request.jwt.claim.sub = '${userAId}';`);

    const clientId = "a0000000-0000-0000-0000-000000000001";
    const inv1 = "a0000000-0000-0000-0000-000000000010";
    const inv2 = "a0000000-0000-0000-0000-000000000011";

    await db.exec(`
      INSERT INTO public.invoices (id, user_id, client_id, invoice_number, currency) VALUES ('${inv1}', '${userAId}', '${clientId}', 'INV-999', 'USD');
      INSERT INTO public.invoices (id, user_id, client_id, invoice_number, currency) VALUES ('${inv2}', '${userAId}', '${clientId}', 'INV-999', 'USD');
    `);

    const res = await db.query<{ invoice_number: string }>(
      `SELECT invoice_number FROM public.invoices WHERE invoice_number = 'INV-999';`
    );
    expect(res.rows.length).toBe(2);

    await db.exec(`SET ROLE postgres;`);
  });

  it("Criterion 8: The status CHECK rejects 'paid' and 'overdue'", async () => {
    const userAId = "11111111-1111-1111-1111-111111111111";
    const clientId = "a0000000-0000-0000-0000-000000000001";
    await db.exec(`SET ROLE authenticated;`);
    await db.exec(`SET request.jwt.claim.sub = '${userAId}';`);

    await expect(
      db.exec(
        `INSERT INTO public.invoices (user_id, client_id, invoice_number, status, currency) VALUES ('${userAId}', '${clientId}', 'INV-BAD1', 'paid', 'USD');`
      )
    ).rejects.toThrow();

    await expect(
      db.exec(
        `INSERT INTO public.invoices (user_id, client_id, invoice_number, status, currency) VALUES ('${userAId}', '${clientId}', 'INV-BAD2', 'overdue', 'USD');`
      )
    ).rejects.toThrow();

    await db.exec(`SET ROLE postgres;`);
  });
});
