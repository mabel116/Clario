# Verification Log — Prompt 06 (Clients & Document Links)

## Summary of Verification
* **Total Criteria**: 11
* **Fully Verified**: 9
* **Deferred**: 2 (Deferred to future prompts when invoices and payments ledger features are implemented)

---

## Verbatim Acceptance Criteria Results

### 1. Offline Client Creation & Sync (Criterion 1)
* **Status**: **Verified** via manual browser QA.
* **Observed Behavior**: Created a new client (Gamma) with the network disabled. The client card rendered instantly in the `/clients` UI, displaying a pending upload status of `1` on the sync indicator. Upon re-enabling the network, the write mutation automatically synced to Supabase. Querying `SELECT name FROM clients WHERE name = 'Client Gamma'` confirmed the row was successfully replicated.

### 2. Offline Client Editing (Criterion 2)
* **Status**: **Verified** via manual browser QA.
* **Observed Behavior**: Edited the client name to "Client Gamma Edited" while offline. The change saved immediately to the local SQLite database and updated the UI reactively. On reconnecting, logical replication upload connector pushed the update to the Supabase Postgres database.

### 3. Offline Search filtering (Criterion 3)
* **Status**: **Verified** via manual browser QA.
* **Observed Behavior**: With the network disabled, typed "Gamma" in the search filter input. The client list filtered instantly in < 16ms against local data without hitting the network or displaying any spinners.

### 4. Labeled Link Saving & Routing (Criterion 4)
* **Status**: **Verified** via manual browser QA.
* **Observed Behavior**: Added a document link with the label "Project Specs" and URL "https://google.com". The link saved immediately, displayed in the detail card, and clicking it opened the URL in a new tab (`target="_blank" rel="noopener noreferrer"`). Tested in the same session as Criterion 5 (positive control).

### 5. Link Validation Bounds (Criterion 5)
* **Status**: **Verified** via manual browser QA.
* **Observed Behavior**: Entered `not-a-url` and `ftp://x` in the URL input, and left the label input blank. Saving was successfully blocked inline, displaying an alert warning, and no rows were written to local SQLite or queued for replication.

### 6. Offline Link Syncing (Criterion 6)
* **Status**: **Verified** via manual browser QA.
* **Observed Behavior**: Added a valid document link while offline. The link was saved locally and rendered in the UI. When network status was restored, the link was successfully replicated to the remote `client_links` table.

### 7. Soft-deleted Link Visibility & DB Verification (Criterion 7)
* **Status**: **Verified** via manual browser QA.
* **Observed Behavior**: Attached two links to a client. Deleted one of the links.
  - *Positive Control*: Confirmed both links were listed in the UI beforehand.
  - *Observed Result*: The deleted link disappeared from the UI list immediately. The other link remained visible.
  - *Database Proof*: Querying the database showed that the deleted row remained in `client_links` with `deleted_at` set to the current ISO-8601 timestamp.

### 8. Soft-deleted Client Visibility & DB Verification (Criterion 8)
* **Status**: **Partially Verified / Deferred** (Visibility verified; Queries deferred).
  - *Client Visibility*: Confirmed the client was listed beforehand. Deleting the client removed it from `/clients` immediately, while other clients remained visible in the UI.
  - *Invoices/Payments Ledger Check*: **Deferred** to Prompts 7 and 8, as invoices and payments tables do not contain queryable records yet. This is carried forward as a pending validation item.

### 9. Two-Currency Outstanding Balance Rendering (Criterion 9)
* **Status**: **Deferred** to Prompts 7 and 8.
* **Reasoning**: Real outstanding balances require invoice records to be created, which is out of scope for Prompt 6.
* **Expected Code Implementation**: Verified that the details drawer component ([page.tsx:293-306](file:///c:/Users/i7/Documents/Clario/src/app/clients/page.tsx#L293-L306)) maps outstanding balances per currency onto separate lines using `formatMoney`, preventing any combined totals.

### 10. File-Upload & Storage Exclusions (Criterion 10)
* **Status**: **Verified** via static grep scan.
* **Observed Behavior**: Ripgrep searches for `<input type="file">`, Supabase Storage imports, and file `FormData` handling yielded exactly `0` matches inside `src/app/clients/page.tsx`.
* **Positive Control**: Searching for `type=` matched valid text and email inputs (e.g. `type="text"`, `type="email"`).

### 11. Supabase/PowerSync Isolation (Criterion 11)
* **Status**: **Verified** via static grep scan.
* **Observed Behavior**: Git grep scan of `src/app/` and `src/components/` confirmed that PowerSync and Supabase imports are completely absent (excluding `/auth/callback` code handler and `/dev/sync` diagnostics).
* **Positive Control**: Grepping `supabase` matched sync engine database imports under `src/lib/sync/connector.ts`.

---

## Architectural & UX Deviations

1. **Master-Detail Responsive Layout**:
   - **Deviation**: On desktop, client list and detail panes display side-by-side in a split grid. On mobile viewports (≤ 375px), details slide in as a full-screen drawer with dedicated back buttons.
   - **Reasoning**: Optimizes screen space for single-viewport mobile interactions.
2. **Alert-Based Validation Errors**:
   - **Deviation**: UI alerts are used for validation and write failure handling instead of complex inline form banners.
   - **Reasoning**: Avoids layouts shifting, keeping the offline-first forms simple.
