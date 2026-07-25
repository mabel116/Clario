# Prompt 2 Verification — PowerSync Wiring, Local Schema & Sync Status

## Status: blocker resolved, manual criteria pending

---

## Post-mortem: the "Sync Offline | Last: Never" bug

### Symptom
After sign-in succeeded and a valid session existed, the sync indicator never moved off
`Sync Offline | Last: Never`. All six local SQLite tables stayed at 0 rows indefinitely.
No error was ever thrown or logged.

### Root cause
`PowerSyncDatabase` needs a Web Worker to run its SQLite/WASM engine off the main thread.
When no explicit `worker` path is supplied, the SDK resolves the worker script via
`new URL('./worker.js', import.meta.url)`. Under Next.js App Router's client bundling, this
resolved to a path under `/_next/static/chunks/` where no such file exists — so the browser's
`Worker()` constructor received a Next.js 404 HTML page instead of a JavaScript file.

The browser does not reject a same-origin `Worker()` call for wrong content-type. It silently
attempts to execute the 404 page as a script, never sends a ready signal, and the Promise
returned by `db.init()` never resolves and never rejects. Every symptom traced back to this
single unhandled hang:
- no thrown error (the failure happened inside a worker thread, invisible to a page-level `try/catch`)
- no `.wasm` network request (the worker never got far enough to request it)
- `db.connect()` hanging indefinitely, since it awaits `db.init()` internally

### Why it took multiple rounds to isolate
Two plausible-looking causes were investigated and ruled out with direct evidence before the
real cause was found, each confirmed rather than assumed:
1. **Missing Next.js WASM webpack config** — real and necessary (`asyncWebAssembly`,
   `topLevelAwait`, the `.wasm` asset rule), but insufficient on its own. Fixed first;
   did not resolve the hang.
2. **Concurrent `db.init()`/`db.connect()` calls deadlocking each other** — a real latent bug
   (React Strict Mode's double-mount plus multiple `onAuthStateChange` events could fire
   overlapping calls), fixed with module-level promise guards. Confirmed via console log that
   the guard worked correctly (only one connect flow ever started) — and the hang persisted
   regardless, which is what ruled this out as the primary cause.

Both fixes were worth keeping regardless of the outcome — the webpack config is required by
PowerSync's own Next.js documentation, and the concurrency guard prevents a real (if
secondary) race condition. Neither was the root cause.

The actual cause was found by checking DevTools → Network filtered to `wasm`: zero requests,
ever. That ruled out a slow or failing network call and pointed at the asset never being
requested in the first place — which led to inspecting the worker resolution path directly.

### The fix
1. Ran `npx @powersync/web copy-assets -o public` to copy the worker script and WASM binaries
   into `public/@powersync/` and `public/@powersync/assets/`, so they're served as static
   files at a stable, predictable URL.
2. Added `"postinstall": "powersync-web copy-assets -o public"` to `package.json` so the
   assets are re-copied automatically on every fresh `npm install` (verified against
   `@powersync/web`'s own `package.json`, which maps the `powersync-web` bin to
   `bin/powersync.cjs`).
3. Explicitly set `worker: '/@powersync/worker.js'` in both the `database` and `sync` options
   of the `PowerSyncDatabase` constructor in `src/lib/sync/db.ts`, so the SDK is told exactly
   where to find the worker rather than relying on automatic `import.meta.url` resolution.

### Confirmation
- Console: `db.init completed successfully` → `db.connect flow completed successfully`,
  with real status transitions in between (`connecting: true` → `connected: true`).
- Network tab: `worker.js` now appears as a genuine request (previously absent entirely).
- Sync indicator: `SYNC CONNECTED | Last: 3m ago`.
- Local SQLite state matched seeded data exactly: `profiles: 1`, `clients: 3`.

### Open question for later
Whether this is a known, documented gap in PowerSync's Next.js App Router support, or
specific to how this project's `next.config.ts` diverges from PowerSync's reference
`demos/example-nextjs`. Worth a note in the README so a future SDK upgrade that silently
reintroduces this doesn't cost another multi-round investigation.

---

## Acceptance criteria — manual verification

Instructions: clear site data for `localhost` before starting (Application → Storage →
Clear site data), to confirm the tables above reflect a genuinely clean sync rather than
leftover state from earlier debugging. Then work through each criterion below and fill in
the blanks with what you actually observe — not what's expected.

### Criterion 1 — Sign in shows connected status
Steps: sign in as User A.
- Indicator text observed: SYNC CONNECTED
- Last-synced time shown: Last: 8s ago
- [x] PASS / [ ] FAIL

### Criterion 2 — Remote insert appears locally
Steps: while signed in as A, insert a new client row directly via the Supabase SQL editor
for A's `user_id`. Do not refresh the page.
- Local `clients` count before:3
- Local `clients` count after (no refresh):4
- Time elapsed until it appeared:7 seconds
- [x] PASS / [ ] FAIL

### Criterion 3 — Offline write queues locally
Steps: DevTools → Network → Offline. Click "Insert Offline-Ready Client Row."
- Local count incremented immediately? Yes
- Sync indicator state:SYNC OFFLINE
- Pending uploads shown:1
- [x] PASS / [ ] FAIL

### Criterion 4 — Reconnect syncs the queued write
Steps: re-enable the network.
- Pending uploads after reconnect:0
- Row confirmed present in Supabase (query result):confirmed (two previously-stuck rows recovered, one from the original bug session)
- [x] PASS / [ ] FAIL

### Criterion 5 — Offline reload renders cached data (positive control)
Steps: go offline, then hard-reload the page.
- Specific client names visible:Local Client 4:52:50 PM, Local Client 4:00:27 AM
Criterion 2 Test Client, Client A - Stripe, Client A - Acme Corp, Client A - Hooli
- Any spinner or hang observed? No
- [x] PASS / [ ] FAIL

### Criterion 6 — User isolation with positive control
Steps: sign out, sign in as User B.
- Count of User A's rows visible to B:0
- Count of User B's own rows visible:2 (Stark Industries, Wayne Enterprises)
- [x] PASS / [ ] FAIL

### Criterion 7 — Sign-out clears local database
Steps: note counts while signed in, then sign out.
- Counts immediately before sign-out (must be non-zero):Profiles: 1, Clients: 2
- Counts immediately after sign-out:Profiles: 0,Clients: 0
- [x] PASS / [ ] FAIL

### Criterion 8 — PowerSync import boundary
Already verified via `git grep -n "@powersync" -- src/`: imports confined to
`src/lib/sync/`, with the sole exception of the dev-only `/dev/sync` diagnostic route (deleted in Prompt 12). PASS.

---

## Outstanding items before Prompt 2 is fully closed

These were raised during the build and are not yet resolved — carry them forward, do not
drop them:

1. **`connector.ts` data-loss bugs** (flagged, not yet fixed): `uploadData`'s catch block
   calls `transaction.complete()` on permanent errors, silently discarding failed writes
   instead of surfacing them; and it calls `supabase.auth.signOut()` on auth errors, which
   triggers `disconnectAndClear()` and wipes unsynced local data on a transient failure.
   Both must be fixed before Prompt 8 (payments ledger) is trustworthy.
2. Confirm whether the two `worker` options (under `database` and `sync`) are serving
   distinct purposes or duplicating one path — verify this isn't masking a second missing
   asset.

   ## Note for Prompt 12

Chrome DevTools' Network "Offline" throttle does not reliably block all of Clario's network traffic. Observed a full successful page load (all requests 200, real byte sizes, ~1.5s load time) while "Offline" was selected in the DevTools dropdown — PowerSync's worker-based connection appears to bypass the page-level throttle in some cases.

True offline testing for this app requires disabling the network adapter at the OS level (Windows Network Settings), not just the DevTools Offline checkbox. Confirmed: with the adapter disabled, the sync indicator correctly showed SYNC OFFLINE and local data remained rendered.

Prompt 12's offline QA script should specify OS-level disconnection explicitly, so this isn't rediscovered as a confusing intermittent bug during that step.