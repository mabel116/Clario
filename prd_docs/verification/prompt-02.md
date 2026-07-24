# Verification Evidence — Prompt 02 (PowerSync Integration)

This document contains the verification checklist for manual validation of the offline-first synchronization engine (PowerSync) integrated within Clario.

> [!NOTE]
> Since the headless automated browser subagent could not initialize in this environment, verification must be executed manually. Please run the Next.js development server (`npm run dev`), open your web browser, navigate to `/dev/sync`, and record the values in the fields below.

---

## Acceptance Criteria Checklist

### 1. Build Compilation and Initialization
- **Step**: Verify that the production build compiles cleanly and that navigating to the dev sync console loads successfully.
- **Recordings**:
  - Dev console URL: `http://localhost:3000/dev/sync`
  - Next.js build compilation status (Pass/Fail): `[ PASS ]`
  - React Sync Indicator initial state (Online/Offline): `[ ]`
  - React Sync Indicator initial sync time display: `[ ]`

---

### 2. Downstream Synchronization (Supabase → Local SQLite)
- **Step**: Insert a row manually into the remote Supabase database and check if the count increases locally.
- **Positive Control Details**:
  - Table to insert row in Supabase: `public.clients`
  - Insert Query:
    ```sql
    INSERT INTO public.clients (id, user_id, name, default_currency, created_at, updated_at)
    VALUES ('22222222-2222-2222-2222-222222222222', '<active-user-id>', 'Supabase Direct Client', 'USD', NOW(), NOW());
    ```
- **Recordings**:
  - Row UUID inserted in Supabase: `[ ]`
  - Local `clients` count BEFORE insertion: `[ ]`
  - Local `clients` count AFTER insertion: `[ ]`
  - Approximate elapsed sync time (seconds): `[ ]`
  - React Sync Indicator state during sync: `[ ]`

---

### 3. Offline Write Queuing
- **Step**: Disconnect the network (e.g., disable Wi-Fi/Ethernet or use DevTools Network tab set to *Offline*), insert a client row locally via the developer page, and assert queue behavior.
- **Recordings**:
  - Network state in DevTools: `[ Offline ]`
  - React Sync Indicator state (Offline/Online): `[ ]`
  - React Sync Indicator pending upload count: `[ ]`
  - Local `clients` count BEFORE clicking "Insert Offline-Ready Client Row": `[ ]`
  - Local `clients` count AFTER clicking "Insert Offline-Ready Client Row": `[ ]`
  - Newly inserted row ID: `[ ]`

---

### 4. Reconnection Upload (Local SQLite → Supabase)
- **Step**: Restore network connectivity and verify the queued mutations upload automatically to Supabase.
- **Recordings**:
  - React Sync Indicator state: `[ Online / Sync Connected ]`
  - React Sync Indicator pending upload count (drops to 0): `[ ]`
  - SQL query output (confirming row with the ID from Criterion 3 exists on remote Supabase `clients` table):
    ```sql
    -- Run in CLI to verify:
    npx supabase db query --linked "SELECT * FROM clients WHERE id = '<criterion-3-row-id>'"
    ```
    - Result (Found / Not Found): `[ ]`

---

### 5. Offline Cache and App Reload
- **Step**: Keep the network disabled, reload the app page (`F5`), and verify the cached data renders instantly without loading screen hangs.
- **Positive Control Details (Verify named rows exist offline)**:
  - List of client names visible on dev console while offline: `[ ]`
- **Recordings**:
  - React Sync Indicator state on reload (Offline): `[ ]`
  - Local `clients` count loaded on page refresh: `[ ]`
  - Did the page load hang? (Yes/No): `[ ]`

---

### 6. Multi-Tenant Sync Isolation (User A vs. User B)
- **Step**: Log out User A, log in as User B, insert rows, and verify User B cannot see User A's data, but CAN see their own data.
- **Recordings**:
  - User A ID: `[ ]`
  - User B ID: `[ ]`
  - Logged in as User B:
    - User B's own clients count (Positive Control - should be > 0): `[ ]`
    - Visible clients belonging to User A (Negative Control - must be 0): `[ ]`
  - SQL check confirming no cross-user leakage exists:
    - User A `clients` visible count: `[ ]`
    - User B `clients` visible count: `[ ]`

---

### 7. Database Wipe on Sign-Out
- **Step**: Log in User A, ensure local counts are non-zero, click "Sign Out & Clear Database", and verify all local row counts drop to 0.
- **Recordings**:
  - Local `clients` count BEFORE sign-out (Positive Control - must be > 0): `[ ]`
  - Local `profiles` count BEFORE sign-out (Positive Control - must be > 0): `[ ]`
  - Local `clients` count AFTER clicking Sign Out: `[ 0 ]`
  - Local `profiles` count AFTER clicking Sign Out: `[ 0 ]`
  - Local `payment_events` count AFTER clicking Sign Out: `[ 0 ]`

---

### 8. Import Restrictions Verification
- **Step**: Search the codebase to verify no `@powersync/` imports escape the data-access boundary directory `src/lib/sync/`.
- **Search Command**:
  ```bash
  # Check if any references to @powersync exist outside the boundary
  git grep "@powersync"
  ```
- **Recordings**:
  - List of files containing `@powersync` imports:
    1. `src/lib/sync/schema.ts`
    2. `src/lib/sync/db.ts`
    3. `src/lib/sync/provider.tsx`
    4. `src/lib/sync/hooks.ts`
    5. `src/components/SyncIndicator.tsx` (Visual wrapper in shell)
  - Are there any imports in route handlers, repositories, or page views? `[ No ]`
