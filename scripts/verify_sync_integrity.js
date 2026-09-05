const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetEmail = process.argv[2] || 'mabelmarkus116@gmail.com';

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${val.toString().replace(/'/g, "''")}'`;
}

function runDbQuery(sql) {
  const tempDir = path.resolve(__dirname, "../supabase/.temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const tempFile = path.join(tempDir, `temp_verify_${Date.now()}.sql`);
  fs.writeFileSync(tempFile, sql, "utf8");

  const binaryPath = process.platform === "win32"
    ? path.resolve(__dirname, "../node_modules/.bin/supabase.cmd")
    : path.resolve(__dirname, "../node_modules/.bin/supabase");

  try {
    const output = execSync(`"${binaryPath}" db query --linked --file "${tempFile}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    try { fs.unlinkSync(tempFile); } catch (e) {}
    return output;
  } catch (err) {
    try { fs.unlinkSync(tempFile); } catch (e) {}
    console.error("[CLI ERROR]:", err.stdout || err.message);
    throw err;
  }
}

async function verifyCounts() {
  console.log(`\n--- SUPABASE POSTGRES BASELINE ROW COUNT VERIFICATION ---`);
  console.log(`Target Email: ${targetEmail}`);

  const userResult = runDbQuery(`SELECT id FROM auth.users WHERE email = '${targetEmail}';`);
  const uuidMatch = userResult.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!uuidMatch) {
    console.error(`User ${targetEmail} not found.`);
    process.exit(1);
  }
  const userId = uuidMatch[0];
  console.log(`User ID: ${userId}\n`);

  const query = `
    SELECT 'profiles' as tbl, count(*) as count FROM public.profiles WHERE id = '${userId}'
    UNION ALL
    SELECT 'clients' as tbl, count(*) as count FROM public.clients WHERE user_id = '${userId}'
    UNION ALL
    SELECT 'client_links' as tbl, count(*) as count FROM public.client_links WHERE user_id = '${userId}'
    UNION ALL
    SELECT 'invoices (total)' as tbl, count(*) as count FROM public.invoices WHERE user_id = '${userId}'
    UNION ALL
    SELECT 'invoices (Tier 1: active)' as tbl, count(*) as count FROM public.invoices WHERE user_id = '${userId}' AND status IN ('sent', 'draft')
    UNION ALL
    SELECT 'invoices (Tier 2: settled)' as tbl, count(*) as count FROM public.invoices WHERE user_id = '${userId}' AND status IN ('paid', 'void')
    UNION ALL
    SELECT 'invoice_line_items' as tbl, count(*) as count FROM public.invoice_line_items WHERE user_id = '${userId}'
    UNION ALL
    SELECT 'payment_events' as tbl, count(*) as count FROM public.payment_events WHERE user_id = '${userId}';
  `;

  const output = runDbQuery(query);
  console.log(output);
}

verifyCounts().catch(err => {
  console.error(err);
  process.exit(1);
});
