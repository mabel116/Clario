# Known divergences and open decisions

Contents: 1. How to use this file - 2. Divergences with a default - 3. Open decisions to raise with the owner - 4. Placeholder data is not canonical - 5. Not yet specified - 6. Resolved

This file documents differences that were observed between `DESIGN.md` and the design/implementation decisions around it. It is a record, not a set of things to go and look at: you never need the original design files or screenshots, and nothing here asks you to consult them. `DESIGN.md` is the visual source of truth.

## 1. How to use this file

- Read it before building or changing a screen. If you are about to touch something listed here, follow the stated **default** and mention it in your report in one sentence.
- Source priority applies (see `SKILL.md`): product rules, then `DESIGN.md`, then existing shared components, then this skill. An existing screen is not visual authority, so where it differs from `DESIGN.md`, follow `DESIGN.md`. Don't restyle untouched screens as a drive-by; fix what you are already changing.
- Do not silently pick a side, and do not edit `DESIGN.md` to settle a conflict. Open decisions are for the owner.
- When the owner decides something, move the item to section 6 with the date and the decision, and update `DESIGN.md` only if they ask you to.
- Keep this file short and current. Remove an item once the code and `DESIGN.md` agree.

## 2. Divergences with a default

| # | Area | Observed in the current design/implementation | What governs | Default to follow |
|---|---|---|---|---|
| 1 | Payment details | A red **Delete** action on a recorded payment | `DESIGN.md` section 4 (Reverse Payment is a calm secondary action; destructive is only Delete Draft / Delete Client) and the append-only ledger | Offer **Reverse payment** (secondary, confirmed). No Delete on recorded payments. |
| 2 | Client financial summary | Totals shown in one currency while the client's invoices are in another | `DESIGN.md` section 1 (strict currency isolation) | One Financial summary block per currency, built from the client's real invoices. Never one blended block. |
| 3 | Client drawer order | Client info placed above the Financial summary | `DESIGN.md` section 1 (money first, context second) | Identity header, then Financial summary, then Client info, then tabs. |
| 4 | Invoice summary cards | A single figure per card over a list that spans several currencies | `DESIGN.md` sections 1 and 5 | Single-currency account: one figure per card. Multi-currency: follow `DESIGN.md` section 5 and `money-and-currency.md` section 4. Never one blended figure. How `All` is laid out is not specified; see open decision 9. |
| 5 | Currency controls | A Currency filter in the filter row, while `DESIGN.md` also specifies an inline currency selector | `DESIGN.md` section 5 | Both controls, if both exist, read and write the same state. Do not build two independent currency filters. |
| 6 | Currency list | `DESIGN.md` lists `All, USD, EUR, NGN` as an example; data can contain others (for example GBP) | Data | Build the selector from the currencies actually present, never a hard-coded list. |
| 7 | Invoice detail header | Amount in muted gray beside the number; Record Payment drawn as a secondary button | `DESIGN.md` section 1 (money first) and section 4 (Record Payment is a primary action) | Amount at primary weight; Record Payment is the primary action on an unpaid or overdue invoice (`screen-patterns.md` section 5). |
| 8 | Amount formatting | Some amounts without thousands separators (`$1100.00`) next to grouped ones (`$1,200`) | Consistency | One `Money` component, grouped thousands everywhere (`money-and-currency.md` section 1). |
| 9 | Amount alignment | Amount columns left-aligned in some lists | `DESIGN.md` section 5 (right-aligned monetary amounts) | Right-align amounts and their headers in any table you build or change. |
| 10 | Breakpoints | `DESIGN.md` says desktop is 1024px and up but writes the table/card switch with `md:` classes (768px) | `DESIGN.md` section 5 | Cards below `md`; table from `md` with secondary columns dropped until `lg` (`accessibility-responsive-motion.md` section 2). |
| 11 | Icon meaning | A pencil used on Send Reminder and Record Payment (Edit's icon); a clock on a Paid card and a dollar sign on an Overdue card | One icon, one meaning | Follow the table in `components-forms-copy.md` section 10. |
| 12 | Add New Client copy | Subtitle `Select an invoice to continue`; address placeholder `e.g. TRX-00182`; name placeholders that look like entered values | Plain copy | Subtitle `Add someone you invoice.`; a street-address example; placeholders visibly lighter than entered text. |
| 13 | Navigation copy | `Dasboard` | Spelling | `Dashboard`. Fix it when you touch the nav and mention it. |
| 14 | Payment status words | `Paid` in one row, `Completed` in others | `DESIGN.md` section 2 uses Paid / Received for the emerald tone | Use the exact payment status strings the code defines; do not mix invoice words into payment rows. |
| 15 | Outstanding colors | Orange and red text with a dot | `DESIGN.md` section 2 tokens | Amber tone for owed and not late, rose for overdue, from the tokens. Dot plus supporting text, never color alone. |
| 16 | Drawer width | Different widths for different drawers, wider than specified | `DESIGN.md` section 5 (about 450px) | One shared drawer width token, using `DESIGN.md`'s value unless the repo already defines one. |

## 3. Open decisions to raise with the owner

Do not resolve these inside unrelated work. If a task needs one answered, ask, giving the default you would otherwise use.

1. **Table header casing.** The current implementation uses normal-case headers; `DESIGN.md` section 3 specifies uppercase with wide tracking. *Default:* follow `DESIGN.md` for any table you build or change, and flag it.
2. **Pending and Failed payments.** The current design shows `Pending`, `Failed` and a `Card` method, but v1 records payments manually with no processor. Are these real concepts and do they affect balances? *Default:* render only statuses the code defines; build nothing that implies card processing.
3. **Editing a recorded payment.** An `Edit` action exists on payment details. With an append-only ledger an edit is presumably a correction entry. *Default:* keep the existing behavior and wording; add no new edit flows.
4. **Deleting a client with history.** `Delete Client` is destructive in `DESIGN.md`. Check the PRD for what happens to their invoices and payments before writing confirmation copy. *Default:* confirm exactly what the code does and no more.
5. **Casing convention.** `DESIGN.md`'s examples use Title Case for primary buttons; menus and prose are sentence case in the current product. *Default:* follow `DESIGN.md` and the shared components (`components-forms-copy.md` section 9), and flag if you think it should be unified.
6. **Row height.** `DESIGN.md` says 56px rows; two-line identity cells may want more. *Default:* 56px per `DESIGN.md`; flag it if content doesn't fit.
7. **Primary action on a Draft invoice view.** `DESIGN.md` lists Mark as Sent as secondary. *Default:* a Draft has no primary button on the view page; Edit and Mark as sent are secondary.
8. **Balance due on lists.** Whether list rows for partially paid invoices should also show balance due. *Default:* total in the Amount column; balance due in the detail view.
9. **The `All` currency view.** `DESIGN.md` lists `All` in the selector but doesn't define how summary cards present it. *Default:* follow whatever the product already does; if nothing exists, show one figure per currency labelled with its code and flag it. Never blend.

## 4. Placeholder data is not canonical

The original design placeholder data contained inconsistencies (an invoice header amount that differed from its own total, a payment linked to a different invoice number than its row, a client with invoices in one currency and totals in another, differing emails for the same person). Treat any such data as illustrative. Never copy it into components, fixtures or tests as if it were true, and never let a screen show a header amount that disagrees with its own total.

## 5. Not yet specified

`DESIGN.md` does not describe the dashboard, settings, onboarding, or detailed mobile layouts beyond its section 5 rules. Build them from `DESIGN.md` and the patterns in this skill, add nothing that wasn't asked for, and for anything larger than a small change write a short plan (focal figure, layout sketch, states, mobile behavior) and surface it before building. Clario's current product scope decides which screens exist; do not add pages.

## 6. Resolved

None yet. Format: `- 2026-MM-DD - #<n> <topic>: <decision> (decided by the owner)`.
