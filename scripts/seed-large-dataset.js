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

// SAFEGUARD: The script must only target the dev/local Supabase project
const EXPECTED_DEV_URL = 'https://ukjdwoldakcapojcpfas.supabase.co';
const EXPECTED_PROJECT_REF = 'ukjdwoldakcapojcpfas';

if (supabaseUrl.trim().replace(/\/$/, '') !== EXPECTED_DEV_URL) {
  console.error(`[SAFEGUARD BLOCKED] Running against configured Supabase URL: ${supabaseUrl}`);
  console.error(`[SAFEGUARD BLOCKED] Target Dev Project URL: ${EXPECTED_DEV_URL}`);
  console.error(`[SAFEGUARD BLOCKED] Accidental seeding of non-dev or production projects is strictly blocked.`);
  process.exit(1);
}

// Double-lock check against CLI linked project ref
const projectRefPath = path.resolve(__dirname, '../supabase/.temp/project-ref');
if (!fs.existsSync(projectRefPath)) {
  console.error("[ERROR] Missing supabase/.temp/project-ref file. Link your project first.");
  process.exit(1);
}
const linkedProjectRef = fs.readFileSync(projectRefPath, 'utf8').trim();
if (linkedProjectRef !== EXPECTED_PROJECT_REF) {
  console.error(`[SAFEGUARD BLOCKED] CLI is linked to project: ${linkedProjectRef}`);
  console.error(`[SAFEGUARD BLOCKED] Target Dev Project Reference: ${EXPECTED_PROJECT_REF}`);
  console.error(`[SAFEGUARD BLOCKED] CLI linked project must match the dev project.`);
  process.exit(1);
}


const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'KES', 'GHS', 'ZAR', 'CAD', 'AUD', 'INR', 'JPY', 'KRW'];

// SQL String escape helper
function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  return `'${val.toString().replace(/'/g, "''")}'`;
}

function runDbQuery(sql) {
  const tempDir = path.resolve(__dirname, "../supabase/.temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const tempFile = path.join(tempDir, "temp_seed_query.sql");
  fs.writeFileSync(tempFile, sql, "utf8");

  const binaryPath = process.platform === "win32"
    ? path.resolve(__dirname, "../node_modules/.bin/supabase.cmd")
    : path.resolve(__dirname, "../node_modules/.bin/supabase");

  try {
    const output = execSync(`"${binaryPath}" db query --linked --file "${tempFile}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    try {
      fs.unlinkSync(tempFile);
    } catch (e) {}
    return output;
  } catch (err) {
    try {
      fs.unlinkSync(tempFile);
    } catch (e) {}
    console.error("[CLI ERROR STDOUT]:", err.stdout);
    console.error("[CLI ERROR STDERR]:", err.stderr);
    throw new Error(`CLI query execution failed. Message: ${err.message}`);
  }
}


async function seed() {
  console.log("Resolving user ID for mabelmarkus116@gmail.com from linked project...");
  const userResult = runDbQuery("SELECT id FROM auth.users WHERE email = 'mabelmarkus116@gmail.com';");
  
  // Parse output to find UUID
  const uuidMatch = userResult.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!uuidMatch) {
    console.error("[ERROR] User mabelmarkus116@gmail.com not found in auth.users. Output was:\n", userResult);
    process.exit(1);
  }

  const userId = uuidMatch[0];
  console.log(`[AUTH] Target User ID successfully resolved: ${userId}`);

  // Generate 200 Clients
  console.log("[SEEDING] Generating 200 clients...");
  const clients = [];
  for (let i = 1; i <= 200; i++) {
    const id = crypto.randomUUID();
    const currency = SUPPORTED_CURRENCIES[i % SUPPORTED_CURRENCIES.length];
    clients.push({
      id,
      user_id: userId,
      name: `Seeded Client ${i.toString().padStart(3, '0')}`,
      company: `Freelancer Client Partner ${i.toString().padStart(3, '0')} LLC`,
      email: `contact-client-${i}@example.com`,
      phone: `+1 555-010-${i.toString().padStart(3, '0')}`,
      default_currency: currency,
      notes: `Seeded profile details for test client index ${i}.`,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + i * 60 * 1000).toISOString()
    });
  }

  // Generate 1,000 Invoices & matching line items (5 per client)
  console.log("[SEEDING] Generating 1,000 invoices & matching line items...");
  const invoices = [];
  const lineItems = [];
  const invoiceStatuses = ['draft', 'sent', 'paid', 'partially_paid', 'overdue', 'void'];

  for (let c = 0; c < 200; c++) {
    const client = clients[c];
    for (let i = 1; i <= 5; i++) {
      const invId = crypto.randomUUID();
      const invIndex = c * 5 + i;
      const status = invoiceStatuses[invIndex % invoiceStatuses.length];
      const currency = client.default_currency;

      // Integrity rules per ADR 031:
      // If NOT draft, we must populate issue_date & due_date. If draft, they must be NULL.
      // For overdue invoices, the due_date must be in the past to trigger displayStatus overdue derivation.
      const isDraft = status === 'draft';
      const isOverdue = status === 'overdue';
      const issueDate = isDraft ? null : new Date(Date.now() - (isOverdue ? 30 : 15) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const dueDate = isDraft ? null : new Date(Date.now() + (isOverdue ? -10 : 15) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const unitPriceMinor = 10000 + (invIndex * 100); // 100.00 to 1100.00
      const quantity = 1 + (invIndex % 3); // 1, 2, 3
      const totalMinor = unitPriceMinor * quantity;

      invoices.push({
        id: invId,
        user_id: userId,
        client_id: client.id,
        invoice_number: `INV-SEED-${invIndex.toString().padStart(4, '0')}`,
        status: (status === 'draft' || status === 'void') ? status : 'sent',
        intendedStatus: status,
        currency,
        issue_date: issueDate,
        due_date: dueDate,
        notes: `Seed invoice notes for index ${invIndex}.`,
        total_minor: totalMinor,
        created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000 + invIndex * 60 * 1000).toISOString()
      });

      lineItems.push({
        id: crypto.randomUUID(),
        user_id: userId,
        invoice_id: invId,
        description: `Consulting Services - Milestone ${i}`,
        quantity,
        unit_price_minor: unitPriceMinor,
        line_total_minor: totalMinor,
        position: 0
      });
    }
  }

  // Generate 2,000 Payment Events
  console.log("[SEEDING] Generating 2,000 payment events...");
  const paymentEvents = [];

  for (let invIndex = 0; invIndex < invoices.length; invIndex++) {
    const inv = invoices[invIndex];
    const status = inv.intendedStatus;

    if (status === 'draft' || status === 'void') continue;

    if (status === 'paid') {
      paymentEvents.push({
        id: crypto.randomUUID(),
        user_id: userId,
        invoice_id: inv.id,
        client_id: inv.client_id,
        amount_minor: inv.total_minor,
        currency: inv.currency,
        occurred_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        method: 'bank_transfer',
        reverses_id: null,
        note: `Full payment received for ${inv.invoice_number}`
      });
    }

    if (status === 'partially_paid') {
      paymentEvents.push({
        id: crypto.randomUUID(),
        user_id: userId,
        invoice_id: inv.id,
        client_id: inv.client_id,
        amount_minor: Math.floor(inv.total_minor / 2),
        currency: inv.currency,
        occurred_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        method: 'bank_transfer',
        reverses_id: null,
        note: `Partial payment received for ${inv.invoice_number}`
      });
    }
  }

  const targetReversals = 2000 - paymentEvents.length;
  const pairsNeeded = Math.floor(targetReversals / 2);
  console.log(`[SEEDING] Adding ${pairsNeeded} payment & reversal pairs for immutable ledger testing...`);

  const eligibleInvoices = invoices.filter(inv => inv.status !== 'draft' && inv.status !== 'void');
  for (let r = 0; r < pairsNeeded; r++) {
    const inv = eligibleInvoices[r % eligibleInvoices.length];
    const amount = 5000; // $50
    const originalEventId = crypto.randomUUID();
    const reversalEventId = crypto.randomUUID();
    const occurredAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 + r * 60 * 1000).toISOString().split('T')[0];

    paymentEvents.push({
      id: originalEventId,
      user_id: userId,
      invoice_id: inv.id,
      client_id: inv.client_id,
      amount_minor: amount,
      currency: inv.currency,
      occurred_at: occurredAt,
      method: 'cash',
      reverses_id: null,
      note: `Mistaken duplicate transaction ${r}`
    });

    paymentEvents.push({
      id: reversalEventId,
      user_id: userId,
      invoice_id: inv.id,
      client_id: inv.client_id,
      amount_minor: -amount,
      currency: inv.currency,
      occurred_at: occurredAt,
      method: 'cash',
      reverses_id: originalEventId,
      note: `Reversal correction for mistaken duplicate transaction ${r}`
    });
  }

  // Construct raw SQL transaction block to run
  console.log("[SEEDING] Compiling SQL transaction scripts...");
  let sql = 'BEGIN;\n';
  sql += `-- Idempotent cleanup of prior seeded data to prevent duplicates\n`;
  sql += `DELETE FROM public.payment_events WHERE note LIKE 'Full payment received for INV-SEED-%' OR note LIKE 'Partial payment received for INV-SEED-%' OR note LIKE 'Mistaken duplicate transaction%' OR note LIKE 'Reversal correction for mistaken duplicate%';\n`;
  sql += `DELETE FROM public.invoice_line_items WHERE description LIKE 'Consulting Services - Milestone %';\n`;
  sql += `DELETE FROM public.invoices WHERE invoice_number LIKE 'INV-SEED-%';\n`;
  sql += `DELETE FROM public.clients WHERE name LIKE 'Seeded Client %';\n`;

  // Append Clients SQL
  clients.forEach(c => {
    sql += `INSERT INTO public.clients (id, user_id, name, company, email, phone, default_currency, notes, created_at) VALUES (${escapeSql(c.id)}, ${escapeSql(c.user_id)}, ${escapeSql(c.name)}, ${escapeSql(c.company)}, ${escapeSql(c.email)}, ${escapeSql(c.phone)}, ${escapeSql(c.default_currency)}, ${escapeSql(c.notes)}, ${escapeSql(c.created_at)}) ON CONFLICT (id) DO NOTHING;\n`;
  });

  // Append Invoices SQL
  invoices.forEach(inv => {
    sql += `INSERT INTO public.invoices (id, user_id, client_id, invoice_number, status, currency, issue_date, due_date, notes, total_minor, created_at) VALUES (${escapeSql(inv.id)}, ${escapeSql(inv.user_id)}, ${escapeSql(inv.client_id)}, ${escapeSql(inv.invoice_number)}, ${escapeSql(inv.status)}, ${escapeSql(inv.currency)}, ${escapeSql(inv.issue_date)}, ${escapeSql(inv.due_date)}, ${escapeSql(inv.notes)}, ${inv.total_minor}, ${escapeSql(inv.created_at)}) ON CONFLICT (id) DO NOTHING;\n`;
  });

  // Append Line Items SQL
  lineItems.forEach(li => {
    sql += `INSERT INTO public.invoice_line_items (id, user_id, invoice_id, description, quantity, unit_price_minor, line_total_minor, position) VALUES (${escapeSql(li.id)}, ${escapeSql(li.user_id)}, ${escapeSql(li.invoice_id)}, ${escapeSql(li.description)}, ${li.quantity}, ${li.unit_price_minor}, ${li.line_total_minor}, ${li.position}) ON CONFLICT (id) DO NOTHING;\n`;
  });

  // Append Payment Events SQL
  paymentEvents.forEach(pe => {
    sql += `INSERT INTO public.payment_events (id, user_id, invoice_id, client_id, amount_minor, currency, occurred_at, method, reverses_id, note) VALUES (${escapeSql(pe.id)}, ${escapeSql(pe.user_id)}, ${escapeSql(pe.invoice_id)}, ${escapeSql(pe.client_id)}, ${pe.amount_minor}, ${escapeSql(pe.currency)}, ${escapeSql(pe.occurred_at)}, ${escapeSql(pe.method)}, ${escapeSql(pe.reverses_id)}, ${escapeSql(pe.note)}) ON CONFLICT (id) DO NOTHING;\n`;
  });

  sql += 'COMMIT;\n';

  console.log("[SEEDING] Executing SQL via Supabase CLI...");
  const executionOutput = runDbQuery(sql);
  console.log("[SEEDING] Seeding complete! CLI Output:\n", executionOutput);
}

seed().catch(err => {
  console.error("Seeding operation failed:", err.message);
  process.exit(1);
});
