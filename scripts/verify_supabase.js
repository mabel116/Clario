import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";

console.log("=== RUNNING REMOTELY AGAINST LIVE SUPABASE INSTANCE ===\n");

function runDbQuery(sql) {
  return new Promise((resolve, reject) => {
    // Write query to a temp SQL file to avoid Windows command line character escaping issues
    const tempDir = path.resolve("supabase", ".temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = path.join(tempDir, "temp_query.sql");
    fs.writeFileSync(tempFile, sql, "utf8");

    const binaryPath = process.platform === "win32"
      ? path.resolve("node_modules", ".bin", "supabase.cmd")
      : path.resolve("node_modules", ".bin", "supabase");

    const child = spawn(binaryPath, ["db", "query", "--linked", "--file", tempFile], {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data;
    });

    child.stderr.on("data", (data) => {
      stderr += data;
    });

    child.on("close", (code) => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {}

      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Exit code ${code}. Error: ${stderr}`));
      }
    });
  });
}

async function verifyAll() {
  try {
    // 1. Criterion 2: Schema Applied Cleanly
    console.log("[VERIFY CRITERION 2] Check public tables...");
    const tablesOutput = await runDbQuery("SELECT tablename FROM pg_tables WHERE schemaname = 'public';");
    console.log(tablesOutput);

    // 2. Criterion 3: Money Columns are bigint
    console.log("[VERIFY CRITERION 3] Check money columns (*_minor)...");
    const moneyColsOutput = await runDbQuery(
      "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND column_name LIKE '%_minor';"
    );
    console.log(moneyColsOutput);

    // 3. Criterion 4: payment_events columns
    console.log("[VERIFY CRITERION 4] Check payment_events columns...");
    const peColsOutput = await runDbQuery(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'payment_events' AND column_name IN ('updated_at', 'deleted_at');"
    );
    console.log(peColsOutput.trim() ? peColsOutput : "No updated_at/deleted_at columns (PASS)\n");

    // 4. Criterion 5: payment_events append-only RLS
    console.log("[VERIFY CRITERION 5] Append-only payment_events tests...");
    const criterion5Sql = `
      BEGIN;
      INSERT INTO auth.users (id, email) VALUES ('11111111-1111-1111-1111-111111111111', 'usera@example.com') ON CONFLICT DO NOTHING;
      INSERT INTO public.profiles (id, default_currency) VALUES ('11111111-1111-1111-1111-111111111111', 'USD') ON CONFLICT DO NOTHING;
      
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

      INSERT INTO public.clients (id, user_id, name) VALUES ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Client A') ON CONFLICT DO NOTHING;
      INSERT INTO public.invoices (id, user_id, client_id, invoice_number, currency) VALUES ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'INV-001', 'USD') ON CONFLICT DO NOTHING;

      -- Attempt INSERT payment_events (succeeds)
      INSERT INTO public.payment_events (id, user_id, invoice_id, client_id, amount_minor, currency, method)
      VALUES ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 10000, 'USD', 'bank_transfer')
      RETURNING id, amount_minor;

      -- Attempt UPDATE (should affect 0 rows)
      UPDATE public.payment_events SET amount_minor = 20000 WHERE id = 'a0000000-0000-0000-0000-000000000003';

      -- Attempt DELETE (should affect 0 rows)
      DELETE FROM public.payment_events WHERE id = 'a0000000-0000-0000-0000-000000000003';

      -- Verify final row amount
      SELECT amount_minor FROM public.payment_events WHERE id = 'a0000000-0000-0000-0000-000000000003';
      ROLLBACK;
    `;
    const c5Output = await runDbQuery(criterion5Sql);
    console.log(c5Output);

    // 5. Criterion 6: Multi-tenant RLS isolation
    console.log("[VERIFY CRITERION 6] Multi-tenant RLS isolation tests...");
    const criterion6Sql = `
      BEGIN;
      INSERT INTO auth.users (id, email) VALUES ('11111111-1111-1111-1111-111111111111', 'usera@example.com') ON CONFLICT DO NOTHING;
      INSERT INTO auth.users (id, email) VALUES ('22222222-2222-2222-2222-222222222222', 'userb@example.com') ON CONFLICT DO NOTHING;
      
      SET ROLE postgres;
      INSERT INTO public.profiles (id, default_currency) VALUES ('11111111-1111-1111-1111-111111111111', 'USD') ON CONFLICT DO NOTHING;
      INSERT INTO public.profiles (id, default_currency) VALUES ('22222222-2222-2222-2222-222222222222', 'USD') ON CONFLICT DO NOTHING;
      INSERT INTO public.clients (id, user_id, name) VALUES ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Client B Private') ON CONFLICT DO NOTHING;
      INSERT INTO public.invoices (id, user_id, client_id, invoice_number, currency) VALUES ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'INV-B-SECRET', 'USD') ON CONFLICT DO NOTHING;
      
      -- Switch to User A
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

      -- SELECT User B records (should yield 0 rows)
      SELECT COUNT(*) as client_count FROM public.clients WHERE id = 'b0000000-0000-0000-0000-000000000001';
      SELECT COUNT(*) as invoice_count FROM public.invoices WHERE id = 'b0000000-0000-0000-0000-000000000002';

      -- UPDATE User B records (should affect 0 rows)
      UPDATE public.clients SET name = 'HACKED' WHERE id = 'b0000000-0000-0000-0000-000000000001';
      UPDATE public.invoices SET invoice_number = 'HACKED' WHERE id = 'b0000000-0000-0000-0000-000000000002';

      -- DELETE User B records (should affect 0 rows)
      DELETE FROM public.clients WHERE id = 'b0000000-0000-0000-0000-000000000001';
      DELETE FROM public.invoices WHERE id = 'b0000000-0000-0000-0000-000000000002';

      ROLLBACK;
    `;
    const c6Output = await runDbQuery(criterion6Sql);
    console.log(c6Output);

    // 6. Cascade restricts test
    console.log("[VERIFY CASCADE RESTRICT] Attempt hard delete on invoice with payment events...");
    const cascadeSql = `
      BEGIN;
      INSERT INTO auth.users (id, email) VALUES ('11111111-1111-1111-1111-111111111111', 'usera@example.com') ON CONFLICT DO NOTHING;
      INSERT INTO public.profiles (id, default_currency) VALUES ('11111111-1111-1111-1111-111111111111', 'USD') ON CONFLICT DO NOTHING;
      
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

      INSERT INTO public.clients (id, user_id, name) VALUES ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Client A') ON CONFLICT DO NOTHING;
      INSERT INTO public.invoices (id, user_id, client_id, invoice_number, currency) VALUES ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'INV-001', 'USD') ON CONFLICT DO NOTHING;
      INSERT INTO public.payment_events (id, user_id, invoice_id, client_id, amount_minor, currency, method)
      VALUES ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 10000, 'USD', 'bank_transfer') ON CONFLICT DO NOTHING;

      -- Attempt hard delete of invoice
      DELETE FROM public.invoices WHERE id = 'a0000000-0000-0000-0000-000000000002';
      ROLLBACK;
    `;
    try {
      await runDbQuery(cascadeSql);
      console.log("FAIL: Invoice delete succeeded unexpectedly.\n");
    } catch (err) {
      console.log("PASS: Invoice delete failed as expected:\n", err.message);
    }

    // 7. End-to-end signup trigger test
    console.log("[VERIFY SIGN-UP TRIGGER] Mock end-to-end signup trigger...");
    const signupSql = `
      BEGIN;
      INSERT INTO auth.users (id, email) VALUES ('33333333-3333-3333-3333-333333333333', 'triggeruser@example.com') RETURNING id;
      SELECT default_currency FROM public.profiles WHERE id = '33333333-3333-3333-3333-333333333333';
      ROLLBACK;
    `;
    const signupOutput = await runDbQuery(signupSql);
    console.log(signupOutput);

  } catch (err) {
    console.error("Verification failed:", err);
  }
}

verifyAll();
