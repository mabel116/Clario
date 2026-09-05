const fs = require('fs');
const path = require('path');
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

// SAFEGUARD: The script must only target the dev Supabase project
const EXPECTED_DEV_URL = 'https://ukjdwoldakcapojcpfas.supabase.co';
const EXPECTED_PROJECT_REF = 'ukjdwoldakcapojcpfas';

if (supabaseUrl.trim().replace(/\/$/, '') !== EXPECTED_DEV_URL) {
  console.error(`[SAFEGUARD BLOCKED] Running against configured Supabase URL: ${supabaseUrl}`);
  console.error(`[SAFEGUARD BLOCKED] Target Dev Project URL: ${EXPECTED_DEV_URL}`);
  process.exit(1);
}

const projectRefPath = path.resolve(__dirname, '../supabase/.temp/project-ref');
if (!fs.existsSync(projectRefPath)) {
  console.error("[ERROR] Missing supabase/.temp/project-ref file. Link your project first.");
  process.exit(1);
}
const linkedProjectRef = fs.readFileSync(projectRefPath, 'utf8').trim();
if (linkedProjectRef !== EXPECTED_PROJECT_REF) {
  console.error(`[SAFEGUARD BLOCKED] CLI is linked to project: ${linkedProjectRef}`);
  console.error(`[SAFEGUARD BLOCKED] Target Dev Project Reference: ${EXPECTED_PROJECT_REF}`);
  process.exit(1);
}

console.log("[SAFEGUARD PASSED] Target Dev Project:", EXPECTED_PROJECT_REF);

const TARGET_EMAIL = 'mabelmarkus116@gmail.com';
const NEW_PASSWORD = 'Password123!';

// 1. Inspect before state
console.log(`\n--- Inspecting current auth state for ${TARGET_EMAIL} ---`);
const checkSql = `SELECT id, email, (encrypted_password IS NOT NULL AND encrypted_password != '') as has_password, email_confirmed_at, raw_app_meta_data->>'provider' as primary_provider FROM auth.users WHERE email = '${TARGET_EMAIL}';`;
const beforeResult = execSync(`npx.cmd supabase db query --linked "${checkSql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
console.log(beforeResult);

// 2. Perform password update
console.log(`\n--- Updating password for ${TARGET_EMAIL} ---`);
const updateSql = `UPDATE auth.users SET encrypted_password = extensions.crypt('${NEW_PASSWORD}', extensions.gen_salt('bf')), email_confirmed_at = COALESCE(email_confirmed_at, NOW()), updated_at = NOW() WHERE email = '${TARGET_EMAIL}';`;
execSync(`npx.cmd supabase db query --linked "${updateSql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });

// 3. Inspect after state
console.log(`\n--- Verification after password update ---`);
const afterResult = execSync(`npx.cmd supabase db query --linked "${checkSql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
console.log(afterResult);
