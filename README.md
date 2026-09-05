# Clario

Offline-first workspace providing instant financial clarity and client management for solo creative freelancers.

## Stack
- **Framework**: Next.js (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Backend & Auth**: Supabase (Postgres + Auth + RLS)
- **Offline Engine**: PowerSync + SQLite
- **Testing**: Vitest + PGlite

## Prerequisites
- Node.js >= 20.x
- npm >= 10.x
- Supabase CLI (`npx supabase`)

## Getting Started

1. **Clone the repository and install dependencies**:
   ```bash
   git clone <repo-url>
   cd Clario
   npm install
   ```

2. **Set up environment variables**:
   Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```
   Fill in your Supabase project credentials and PowerSync service URL.

3. **Initialize & Run Database Migrations**:
   Using the Supabase CLI:
   ```bash
   npx supabase db reset
   ```

4. **Run Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the app.

5. **Run Tests & Verification**:
   ```bash
   npm run typecheck
   npm run build
   npm test
   ```

## Security & Architecture Invariants
1. **Per-User Isolation**: Enforced via Supabase Row-Level Security (RLS) policies on every table using `auth.uid() = user_id`.
2. **Immutable Payment Ledger**: The `payment_events` table is append-only at the database level. No `UPDATE` or `DELETE` RLS policies are granted. Corrections are recorded via mirror reversal entries.
3. **Money Representation**: Stored strictly as signed 64-bit integer minor units (`bigint`) with an ISO-4217 `char(3)` currency code.

## Local HTTPS Dev Server Setup (For Mobile/PWA Device Testing)
Mobile testing requires a secure browsing context (HTTPS) for `crypto.randomUUID()` and PowerSync's WASM SQLite engine to initialize.

1. **Create an OpenSSL Config File** at `certificates/openssl.conf`:
   ```ini
   [req]
   distinguished_name = req_distinguished_name
   x509_extensions = v3_req
   prompt = no

   [req_distinguished_name]
   C = US
   ST = California
   L = San Francisco
   O = Clario Dev
   OU = Development
   CN = localhost

   [v3_req]
   keyUsage = keyEncipherment, dataEncipherment, digitalSignature
   extendedKeyUsage = serverAuth
   subjectAltName = @alt_names

   [alt_names]
   DNS.1 = localhost
   IP.1 = 127.0.0.1
   IP.2 = <your-local-ip>
   ```

2. **Generate Self-Signed Certificates** using OpenSSL (if using Git for Windows, it is located at `C:\Program Files\Git\usr\bin\openssl.exe`):
   ```bash
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout certificates/key.pem -out certificates/cert.pem -config certificates/openssl.conf
   ```

3. **Start the Next.js Dev Server** using the generated keys:
   ```bash
   npx next dev --experimental-https --experimental-https-key certificates/key.pem --experimental-https-cert certificates/cert.pem -p 3001
   ```
   Open `https://localhost:3001` or `https://<your-local-ip>:3001` on your device.

