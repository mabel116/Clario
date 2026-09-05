const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Parse .env.local for credentials
const envPath = path.resolve(__dirname, '../.env.local');
if (!fs.existsSync(envPath)) {
  console.error("[ERROR] Missing .env.local file.");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
if (!supabaseUrl) {
  console.error("[ERROR] Missing NEXT_PUBLIC_SUPABASE_URL in .env.local");
  process.exit(1);
}

const EXPECTED_DEV_URL = 'https://ukjdwoldakcapojcpfas.supabase.co';
const EXPECTED_PROJECT_REF = 'ukjdwoldakcapojcpfas';

if (supabaseUrl.trim().replace(/\/$/, '') !== EXPECTED_DEV_URL) {
  console.error(`[SAFEGUARD BLOCKED] Running against configured Supabase URL: ${supabaseUrl}`);
  process.exit(1);
}

const projectRefPath = path.resolve(__dirname, '../supabase/.temp/project-ref');
if (!fs.existsSync(projectRefPath)) {
  console.error("[ERROR] Missing supabase/.temp/project-ref file.");
  process.exit(1);
}
const linkedProjectRef = fs.readFileSync(projectRefPath, 'utf8').trim();
if (linkedProjectRef !== EXPECTED_PROJECT_REF) {
  console.error(`[SAFEGUARD BLOCKED] CLI is linked to project: ${linkedProjectRef}`);
  process.exit(1);
}

const targetEmail = process.argv[2] || 'small-test@example.com';
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'ZAR', 'CAD', 'AUD', 'INR', 'JPY', 'KRW'];

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${val.toString().replace(/'/g, "''")}'`;
}

function runDbQuery(sql) {
  const tempDir = path.resolve(__dirname, "../supabase/.temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const tempFile = path.join(tempDir, `temp_seed_small_${Date.now()}.sql`);
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
    console.error("[CLI ERROR STDOUT]:", err.stdout);
    console.error("[CLI ERROR STDERR]:", err.stderr);
    throw new Error(`CLI query execution failed: ${err.message}`);
  }
}

async function seedSmall() {
  console.log(`Resolving user ID for ${targetEmail}...`);
  const userResult = runDbQuery(`SELECT id FROM auth.users WHERE email = '${targetEmail}';`);
  const uuidMatch = userResult.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!uuidMatch) {
    console.error(`[ERROR] User ${targetEmail} not found in auth.users. Please sign up or create this user first.`);
    process.exit(1);
  }

  const userId = uuidMatch[0];
  console.log(`[AUTH] Target User ID resolved: ${userId}`);

  // Create Profile if not exists
  const profileSql = `
    INSERT INTO public.profiles (id, business_name, default_currency, created_at, updated_at)
    VALUES (${escapeSql(userId)}, 'Small Scale Studio', 'USD', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET business_name = 'Small Scale Studio', default_currency = 'USD';
  `;
  runDbQuery(profileSql);

  // 10 Clients
  console.log("[SEEDING] Generating 10 clients...");
  const clients = [];
  for (let i = 1; i <= 10; i++) {
    const id = crypto.randomUUID();
    const currency = SUPPORTED_CURRENCIES[(i - 1) % SUPPORTED_CURRENCIES.length];
    clients.push({
      id,
      user_id: userId,
      name: `Small Client ${i.toString().padStart(2, '0')}`,
      company: `Partner Company ${i} Ltd`,
      email: `client${i}@smallscale.test`,
      phone: `+1 555-100-${i.toString().padStart(4, '0')}`,
      default_currency: currency,
      notes: `Test client notes for client ${i}.`,
      created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000 + i * 3600000).toISOString()
    });
  }

  // 20 Invoices (2 per client)
  console.log("[SEEDING] Generating 20 invoices & line items...");
  const invoices = [];
  const lineItems = [];
  let invoiceCounter = 1;

  for (let c = 0; c < 10; c++) {
    const client = clients[c];
    for (let i = 1; i <= 2; i++) {
      const invId = crypto.randomUUID();
      const num = `INV-S${invoiceCounter.toString().padStart(4, '0')}`;
      invoiceCounter++;

      const itemQty = 2;
      const unitPriceMinor = 50000; // $500.00
      const totalMinor = itemQty * unitPriceMinor; // $1,000.00
      
      const issueDate = new Date(Date.now() - (25 - c) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const dueDate = new Date(Date.now() + (i === 1 ? -5 : 15) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      invoices.push({
        id: invId,
        user_id: userId,
        client_id: client.id,
        invoice_number: num,
        status: 'sent',
        currency: client.default_currency,
        issue_date: issueDate,
        due_date: dueDate,
        total_minor: totalMinor,
        notes: 'Thank you for your business.',
        created_at: new Date(Date.now() - (25 - c) * 24 * 60 * 60 * 1000).toISOString()
      });

      lineItems.push({
        id: crypto.randomUUID(),
        user_id: userId,
        invoice_id: invId,
        description: `Professional Consulting Phase ${i}`,
        quantity: itemQty,
        unit_price_minor: unitPriceMinor,
        line_total_minor: totalMinor,
        position: 0,
        created_at: new Date(Date.now() - (25 - c) * 24 * 60 * 60 * 1000).toISOString()
      });
    }
  }

  // 40 Payment Events (2 per invoice)
  console.log("[SEEDING] Generating 40 payment events...");
  const payments = [];
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    
    // First payment: 40% ($400)
    payments.push({
      id: crypto.randomUUID(),
      user_id: userId,
      invoice_id: inv.id,
      client_id: inv.client_id,
      amount_minor: 40000,
      currency: inv.currency,
      method: 'bank_transfer',
      note: 'Initial deposit',
      occurred_at: inv.issue_date,
      reverses_id: null,
      created_at: new Date(new Date(inv.created_at).getTime() + 86400000).toISOString()
    });

    // Second payment: 30% ($300)
    payments.push({
      id: crypto.randomUUID(),
      user_id: userId,
      invoice_id: inv.id,
      client_id: inv.client_id,
      amount_minor: 30000,
      currency: inv.currency,
      method: 'cash',
      note: 'Milestone progress payment',
      occurred_at: inv.issue_date,
      reverses_id: null,
      created_at: new Date(new Date(inv.created_at).getTime() + 172800000).toISOString()
    });
  }

  // Clean any previous test records for this user
  let sql = 'BEGIN;\n';
  sql += `DELETE FROM public.payment_events WHERE user_id = ${escapeSql(userId)};\n`;
  sql += `DELETE FROM public.invoice_line_items WHERE user_id = ${escapeSql(userId)};\n`;
  sql += `DELETE FROM public.invoices WHERE user_id = ${escapeSql(userId)};\n`;
  sql += `DELETE FROM public.clients WHERE user_id = ${escapeSql(userId)};\n`;

  // Clients
  clients.forEach(c => {
    sql += `INSERT INTO public.clients (id, user_id, name, company, email, phone, default_currency, notes, created_at) VALUES (${escapeSql(c.id)}, ${escapeSql(c.user_id)}, ${escapeSql(c.name)}, ${escapeSql(c.company)}, ${escapeSql(c.email)}, ${escapeSql(c.phone)}, ${escapeSql(c.default_currency)}, ${escapeSql(c.notes)}, ${escapeSql(c.created_at)}) ON CONFLICT (id) DO NOTHING;\n`;
  });

  // Invoices
  invoices.forEach(inv => {
    sql += `INSERT INTO public.invoices (id, user_id, client_id, invoice_number, status, currency, issue_date, due_date, notes, total_minor, created_at) VALUES (${escapeSql(inv.id)}, ${escapeSql(inv.user_id)}, ${escapeSql(inv.client_id)}, ${escapeSql(inv.invoice_number)}, ${escapeSql(inv.status)}, ${escapeSql(inv.currency)}, ${escapeSql(inv.issue_date)}, ${escapeSql(inv.due_date)}, ${escapeSql(inv.notes)}, ${inv.total_minor}, ${escapeSql(inv.created_at)}) ON CONFLICT (id) DO NOTHING;\n`;
  });

  // Line items
  lineItems.forEach(li => {
    sql += `INSERT INTO public.invoice_line_items (id, user_id, invoice_id, description, quantity, unit_price_minor, line_total_minor, position) VALUES (${escapeSql(li.id)}, ${escapeSql(li.user_id)}, ${escapeSql(li.invoice_id)}, ${escapeSql(li.description)}, ${li.quantity}, ${li.unit_price_minor}, ${li.line_total_minor}, ${li.position}) ON CONFLICT (id) DO NOTHING;\n`;
  });

  // Payments
  payments.forEach(p => {
    sql += `INSERT INTO public.payment_events (id, user_id, invoice_id, client_id, amount_minor, currency, occurred_at, method, reverses_id, note) VALUES (${escapeSql(p.id)}, ${escapeSql(p.user_id)}, ${escapeSql(p.invoice_id)}, ${escapeSql(p.client_id)}, ${p.amount_minor}, ${escapeSql(p.currency)}, ${escapeSql(p.occurred_at)}, ${escapeSql(p.method)}, ${escapeSql(p.reverses_id)}, ${escapeSql(p.note)}) ON CONFLICT (id) DO NOTHING;\n`;
  });

  sql += 'COMMIT;\n';

  console.log("[SEEDING] Executing SQL via Supabase CLI...");
  const executionOutput = runDbQuery(sql);
  console.log("[SEEDING] Seeding complete! CLI Output:\n", executionOutput);
  console.log(`[SEEDING COMPLETE] Successfully seeded small dataset for ${targetEmail}: 10 clients, 20 invoices, 20 line items, 40 payment events.`);
}

seedSmall().catch(err => {
  console.error("[FATAL ERROR]:", err);
  process.exit(1);
});
