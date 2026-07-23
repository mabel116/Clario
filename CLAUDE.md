# CLAUDE.md — Clario Agent Instructions
## Timeless. Do not edit for version changes. Update SCOPE.md instead.

---

## Project Identity
- **App name:** Clario
- **Purpose:** An offline-first workspace that reduces the friction of managing the *financial* side of freelance client work. The core job: let a solo creative freelancer answer, instantly and without app-hopping — *"Has this client paid? Which invoices are outstanding? How much do they still owe me?"* Client context (contacts, notes, document links) exists to serve that money workflow, not as an end in itself.
- **What Clario is not:** Not an invoicing app — invoicing is table stakes, an *input* to payment clarity. Not a generic client hub. Not an everything-app that absorbs WhatsApp, email, or banking.
- **v1 scope, locked:** Clients, invoices, manual payment recording, per-client financial view, dashboard, document links, offline-first sync, multi-currency. No file uploads, no AI reminders, no payment processing. See `prd_docs/clario-prd.md` §3 for the full in-scope / deferred list.
- **The differentiator:** Offline-first is the product, not a feature. The device is the source of truth; the app is instant and fully usable with no network; changes sync on reconnect. Cloud-first incumbents cannot cheaply retrofit this. Every architectural decision defends it.
- **Core data shape:** A per-user tree — Profile → Client → Invoice → Line Items — with an **append-only payment ledger** hanging off invoices, and a local SQLite replica that syncs to Postgres. Every screen is a derived view over that tree plus the ledger. Get the ledger, the derivations, and the RLS right first; everything else is UI.

---

## Repository Structure
```
clario/
├── .agents/skills/gstack/    # gstack agent skills
├── prd_docs/
│   ├── clario-prd.md          # Full product requirements — SINGLE SOURCE OF TRUTH
│   ├── clario-phase3-prompt-pack.md  # 12-step sequential build plan
│   ├── PROJECT_STATE.md       # Running build state — updated at the end of every prompt
│   ├── SCOPE.md               # Current version scope (update each sprint)
│   └── BACKLOG.md             # Deferred v2+ (file uploads, AI reminders, payment processors)
├── src/
│   ├── app/                   # Next.js App Router routes
│   ├── components/            # UI — never imports PowerSync or Supabase directly
│   ├── lib/
│   │   ├── sync/              # PowerSync client, schema, connector — SDK boundary
│   │   ├── data/              # Repositories + hooks — the app's API surface
│   │   ├── money/             # Money primitives — pure, no I/O
│   │   ├── derive/            # Balance / status / aggregate logic — pure, no I/O
│   │   └── auth/              # Supabase Auth calls only
├── supabase/
│   ├── migrations/            # Schema + RLS policies, numbered
│   └── powersync/             # sync-rules.yaml
├── CLAUDE.md                  # This file (timeless)
├── DECISIONS.md               # Load-bearing decisions + rationale, appended as you build
└── DESIGN.md                  # Design system (created post-MVP, see below)
```

**`prd_docs/clario-prd.md` is the single source of truth** for product, architecture, business rules, schema, and technical decisions. Read it before implementing anything. If this file and the PRD ever disagree, **the PRD wins** — say so rather than guessing.

Always read `prd_docs/PROJECT_STATE.md` at the start of every session — it is the ground truth for what's built, what's verified, and what's next. If a session loses context mid-build, re-read it before acting.

---

## Tech Stack (Locked)
| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js (App Router, TypeScript strict), PWA | Installable; mobile-first |
| UI | React + Tailwind + shadcn/ui | Radix underneath; pixel-perfect bar |
| Offline sync | PowerSync | Local SQLite replica ↔ Supabase Postgres; owns the upload queue, retries, reconnection |
| On-device store | SQLite via the PowerSync client SDK | The source of truth for the current session |
| Hosting | Vercel | Preview per PR, Production on `main` |
| Backend | Supabase (Postgres + Auth) | Postgres is where devices converge |
| Auth | Supabase Auth — email + password **and** Google | Identity linking on matching verified email |
| Security | Row-Level Security (RLS) | Enforced at the DB layer, not app code |
| PDF | `@react-pdf/renderer`, lazy-loaded | Generated **on-device**, works with zero network |
| Service worker | App shell + static assets only | Never caches app data — PowerSync owns persistence |
| Payments | None in v1 | Manual recording only. No Stripe/Paystack/Flutterwave, no payment links |

---

## Architecture Rules (Non-Negotiable)
These never change regardless of version or feature. If a task seems to require breaking one, **stop and ask**.

1. **Money is integer minor units.** Every monetary value is a `bigint`/integer in minor units (kobo, cents) paired with an ISO-4217 `char(3)` currency. Never floats, never `numeric` for money. Conversion to a human string happens only at the display edge. A `numeric` money column is a bug, not a style choice.
2. **The payment ledger is append-only and immutable.** `payment_events` rows are never updated and never deleted — no `updated_at`, no `deleted_at`. A correction is a new **reversal** row with `reverses_id` set. There must be no UI control and no code path that edits or deletes a payment event. This is enforced at the database (no update/delete policy) *and* in the upload connector.
3. **Payment state is derived, never stored.** The invoice `status` column holds only the user-driven lifecycle: `draft | sent | void`. `paid`, `partially_paid`, and `overdue` are always computed from the ledger sum and the due date. Writing `'paid'` or `'overdue'` to a column breaks ledger integrity.
4. **Never sum across currencies.** Every aggregate — outstanding, earnings, client balance — returns a per-currency breakdown. No FX, no conversion, no combined total, no "all currencies" figure. Two currencies means two figures on screen.
5. **Ledger sums must be order-independent.** Balance is the signed sum of payment events, and summing must be commutative. Two offline devices each appending a payment must union cleanly on sync with no lost write. This property is why offline sync is tractable here — never introduce logic that depends on event order.
6. **All primary keys are client-generated UUIDs.** Records must be creatable offline without a server round-trip. Never use `serial` or DB-side identity for user data.
7. **Soft deletes everywhere except the ledger.** Every user-mutable table has a nullable `deleted_at`; deleting sets the timestamp. No hard deletes from the client. `payment_events` is exempt — it is append-only, and a payment is "removed" only via a reversal.
8. **Every synced row carries `user_id`.** RLS policies and PowerSync sync rules both scope strictly to `auth.uid()`. One freelancer reading another's clients or invoices is the breach that matters most — it must fail at the database, not the frontend.
9. **The PowerSync dependency is confined to `src/lib/sync/` and `src/lib/data/`.** No component, route handler, or business-logic module imports the SDK. Swapping the sync engine later (or self-hosting the Open Edition) must touch only these directories.
10. **Reads never block on the network.** All reads come from local SQLite as live queries; all writes land locally first and sync in the background. No screen may show an unresolving spinner, an error, or a blank state while offline on a warm cache.
11. **Invoice financial fields lock on the first payment event, not on `sent`.** With zero payments, line items, amounts, currency, number, and issue date stay editable even in `sent` — Clario never transmits the invoice, so `sent` is self-declared and edits recompute cleanly. Once any payment exists, those fields lock; corrections go via void + reissue or a payment reversal. `due_date` and `internal_note` are **always** editable.
12. **`internal_note` never reaches the client.** It must not appear on the PDF or any other client-facing output. This gets an automated test, not a visual check.
13. **Derived logic lives in `src/lib/derive/` and is pure.** No React, no PowerSync, no Supabase, no I/O. `today` is always an injected parameter, never read from the system clock inside a derivation.
14. **Backend validates everything.** Never trust client-side data. RLS re-enforces ownership regardless of what the UI already filtered.
15. **Never commit `.env` files.** Never hardcode Supabase keys in source. The **service-role key never touches client code** under any circumstance.
16. **Migrations are additive.** New features add tables/columns via numbered migrations. Existing tables are altered, never dropped, without an explicit decision logged in `PROJECT_STATE.md`.
17. **Test before ship.** Type-check and the test suite must both pass before `/ship`.

---

## Environment Pipeline
Three environments, always in this order: local → preview → production.

| Environment | Purpose | Branch | Backend |
|---|---|---|---|
| Local | Dev + unit tests | `feature/*` | Local Supabase (`supabase db reset`) + dev PowerSync instance |
| Preview | QA, offline testing, review | PR → Vercel Preview | Dev Supabase project + dev PowerSync instance |
| Production | Live | `main` | Production Supabase project + production PowerSync instance |

Each environment has its own Supabase project, its own PowerSync instance connected to that project's Postgres, and its own `.env`. Sync rules are deployed per environment — a schema migration that isn't matched by a sync-rules deploy will silently fail to reach devices. Google OAuth redirect URIs are registered per environment, with Vercel preview URLs covered by the Supabase redirect allow-list.

---

## Database Schema (Grows, Never Rewrites)
Core tables from the first migration — the Profile → Client → Invoice → Line Item tree, plus the ledger:

- `profiles` — id (= `auth.users.id`), business_name, business_address, default_currency
- `clients` — id, user_id, name, email, phone, company, notes, default_currency, deleted_at
- `client_links` — id, user_id, client_id, label, url, deleted_at — **labeled URLs, not file uploads**
- `invoices` — id, user_id, client_id, invoice_number, status (`draft|sent|void`), currency, total_minor, issue_date, due_date, notes *(on the PDF)*, internal_note *(never on the PDF)*, deleted_at
- `invoice_line_items` — id, user_id, invoice_id, description, quantity, unit_price_minor, line_total_minor, position, deleted_at
- `payment_events` — id, user_id, invoice_id, client_id, amount_minor *(signed)*, currency, method, note, occurred_at, reverses_id, created_at — **no `updated_at`, no `deleted_at`**

`user_id` appears on every table below `profiles`, even where derivable through the parent chain, specifically so RLS policies stay one-liners and PowerSync sync rules bucket cleanly per user. `client_id` is denormalized onto `payment_events` for per-client history queries — any write path must keep it consistent with the invoice's client.

**No hard unique constraint on `(user_id, invoice_number)`.** Uniqueness is a soft, client-side warning only; a hard constraint would break offline creation.

---

## Payment Ledger Lifecycle — Permanent Context
Clario never processes money. A "payment" is a freelancer's manual record that money arrived — the app has no visibility into any bank or processor.

Flow:
1. The freelancer records a payment → a **positive** `payment_events` row is inserted into local SQLite with a client-generated UUID
2. Balance and display status recompute immediately from the ledger sum — **nothing is written to the invoice**
3. PowerSync queues the insert and uploads it to Postgres on reconnect; the sync indicator shows pending count
4. A correction appends a **negative mirror** event with `reverses_id` set. The original row is never touched
5. Two devices offline simultaneously both append; on sync the events union, and because the sum is order-independent, the balance is correct with no lost write
6. Overpayment is legitimate — warn, never block. Balance simply goes negative and status reads Paid

This lifecycle is the financial integrity core of the product. Treat every change to it as correctness-critical and security-relevant. Never add a second write path to `payment_events`.

---

## Derived Read Model — Permanent Spec
Computed in `src/lib/derive/`, never stored authoritatively. Full definitions in PRD §6.1–§6.2.

```
amount_paid    = SUM(payment_events.amount_minor)        // signed; reversals reduce
balance_due    = invoice.total_minor - amount_paid
payment_status = paid | partially_paid | unpaid          // from the above
is_overdue     = status == 'sent' AND balance_due > 0 AND due_date < today
display_status = draft → void → paid → overdue → sent    // precedence order
```

Aggregates (`outstandingByCurrency`, `earningsByCurrency`, `clientOutstandingByCurrency`) each return a per-currency array, ordered with the profile's `default_currency` first, then by amount descending. No function in the codebase may return a single scalar total across mixed currencies.

---

## Data Access Contract Patterns
There is **no REST API for app data** — the app is local-first, so the typed repository layer in `src/lib/data/` *is* the API surface.

- All reads are **live queries** against local SQLite; the UI re-renders on local change
- All writes land locally first (optimistic, instant) and return a client-generated UUID
- Repositories throw **typed errors** for validation failures (invalid URL, currency mismatch, locked invoice) — components surface them inline, never as raw exception strings
- `PaymentRepo` exposes exactly two write methods: `record` (positive) and `reverse` (negative mirror). Both `INSERT` only
- `InvoiceRepo.canEditFinancials(id)` is a live query — the UI reflects the locking rule rather than duplicating it
- Recording a payment whose currency differs from its invoice **throws**
- Components consume repository hooks (`useClients`, `useInvoice`, `usePaymentsForInvoice`, …) and never import PowerSync or Supabase

---

## Design Quick Reference
No `DESIGN.md` yet — the design system is deferred until after the MVP build. When that phase starts, create `DESIGN.md`.

Permanent UI rules that apply from day one:
- **Mobile-first**, verified at 375px. The financial answer is visible without scrolling
- **Money first, context second** on the client detail page — contacts, notes, and links sit below and read quieter
- **Progressive disclosure for currency:** a single-currency user must see an ordinary dashboard with no currency selector, no "all currencies" label, and no multi-currency chrome
- **Never a currency filter that hides money** — a hidden currency could conceal an unpaid invoice, the exact failure this product exists to prevent
- Status is conveyed by **text label as well as colour**; every control is labelled and keyboard-navigable
- Empty states are an invitation, not an apology. Never a wall of zeros

---

## gstack Skills
Installed at `.agents/skills/gstack/`. Check the `SKILL.md` file inside each skill's own folder for how it works.

### Browsing Rule
Use `/browse` for ALL web browsing. Never use `mcp__claude-in-chrome__*` tools.

### Skills Reference
| Skill | When to Use |
|---|---|
| `/plan-eng-review` | Validating schema, sync rules, data flow, or architecture before writing migrations or the data layer |
| `/review` | After EVERY Prompt Pack step — before any commit |
| `/codex` | Independent second opinion on the money core (prompts 3–4) and the sync/upload connector. A rounding, sign, or currency-mismatch error is cheap to catch here and expensive later |
| `/investigate` | Before fixing anything broken — root cause first, no fixes without it |
| `/qa` | After every major feature. **Test with the network disabled** — creating a client, invoice, and payment offline, then reconnecting and confirming clean sync, is the test that matters |
| `/cso` | Before any production deployment, and specifically against RLS policies and the PowerSync sync rules — cross-user data leakage is the primary risk surface. Also verify the append-only enforcement on `payment_events` |
| `/design-review` | Active for prompts 9, 10, and 12 (client financial view, dashboard, final polish) — the PRD sets a pixel-perfect bar |
| `/careful` | Before any migration, RLS policy change, sync-rules deploy, or destructive command |
| `/learn` | After any non-obvious bug or decision — keeps it known across the rest of the 12-step build without re-explaining |
| `/document-release` | After shipping a step — keeps README, DECISIONS, and PROJECT_STATE current |
| `/setup-deploy` | **One-time**, before the first `/land-and-deploy`. Detects platform, production URL, deploy commands |
| `/ship` | Reviewed + QA-passed — runs tests, commits, opens PR |
| `/land-and-deploy` | After PR approved — merges, waits for CI, verifies production health |
| `/canary` | Immediately after `/land-and-deploy` — watches for console errors and page failures post-deploy |
| `/office-hours` | Any new feature idea, v1 or later — **when the human invokes it**. Never reopen settled PRD decisions unprompted or widen scope mid-prompt. New scope follows the path in Hard Rules below |
| `/retro` | Periodic check on velocity and test health. Optional |

### Standard Sprint Order
```
Build → /review → /qa (major features) → /cso (pre-deploy)
→ /ship → /land-and-deploy → /canary
```

### Hard Rules
- Run `/review` after every Prompt Pack step before moving to the next one
- Never carry a bug into the next step — fix and re-verify first
- Run `/investigate` before any fix attempt on something broken
- Run `/careful` before touching any migration, RLS policy, or sync-rules file
- Run the prompt's own **Verify** checklist and report **actual output** — several verifications require attempting a forbidden operation (updating a `payment_events` row, editing a locked invoice, reading another user's data) and demonstrating it fails. An assertion that it "should fail" is not a verification
- **Adding scope mid-build follows one path:** `/office-hours` to pressure-test the idea → amend `prd_docs/clario-prd.md` (scope, schema, invariants, acceptance criteria) → adjust the affected prompts in the Prompt Pack → log the decision in `DECISIONS.md` → only then build it. Never append a new feature to an in-flight prompt, and never implement scope that isn't yet in the PRD — the PRD and the code must not drift apart
- Update `prd_docs/PROJECT_STATE.md` at the end of every prompt — this is the agent's memory across the build, not the chat context
- Append load-bearing decisions and their rationale to `DECISIONS.md` as they are made