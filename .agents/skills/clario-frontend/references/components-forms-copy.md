# Components, forms and copy

Contents: 1. Buttons - 2. Status badges - 3. Tables and mobile cards - 4. Filters and search - 5. Row actions menu - 6. Metric cards - 7. Forms - 8. Payment and invoice forms - 9. Microcopy - 10. Icons

Values (colors, sizes, radii, variants) live in `DESIGN.md`; this file says how to use the pieces. Reuse what exists in the repo first. Where this file and `DESIGN.md` seem to disagree, see `known-divergences.md`.

A note on casing: action names elsewhere in these docs are written as names ("Record payment", "Payment recorded") for readability. How they render follows the product's convention in section 9.

## 1. Buttons

- **Prefer one clear primary action per surface** (page, drawer, dialog) unless the interaction genuinely requires multiple equally important actions. The primary is the next sensible step, not the most exciting one. If two things feel primary, check whether one of them is really secondary.
- Variants and sizes are exactly `DESIGN.md` section 4. Accounting adjustments (Void invoice, Reverse payment, Mark as sent) are **secondary**, never red. Destructive is only for Delete draft and Delete client.
- Label = verb + object (`Record payment`, `Add client`). A leading `+` on create actions matches `DESIGN.md`'s examples. Never `Submit`, `OK`, `Yes`.
- In a group, the primary sits last (rightmost); in a dialog footer, `Cancel` then primary, right-aligned.
- **Loading** keeps exact dimensions (inline spinner, label stays or is replaced by the same width), and the button ignores further clicks.
- **Disabled** is for "not available yet", and says why nearby in helper text (`Enter an amount to continue`). Do not leave a mystery-disabled primary.
- Icon-only buttons (`icon` size, 3-dot, close) always have an accessible name (`Actions for INV-0101`, `Close`), and a tooltip when the icon alone is ambiguous.
- Map shadcn's stock variant names to the Clario names in the one button file; do not scatter overrides at call sites.

## 2. Status badges

One `StatusBadge` component renders every status: a dot, a text label, the tinted pill from `DESIGN.md` section 2. The dot is decorative; the text carries the meaning. Badges are never interactive.

Use the exact status strings the code defines. Map them to tone like this (and do not add, rename or merge statuses):

| Domain | Status (as defined in code) | Tone |
|---|---|---|
| Invoice | Draft | Neutral (Draft / Inactive) |
| Invoice | Unpaid, Sent | Amber |
| Invoice | Overdue | Rose |
| Invoice | Paid | Emerald |
| Invoice | Void (if the code defines it) | Neutral |
| Payment | Completed, Received | Emerald |
| Payment | Pending | Amber |
| Payment | Failed, Reversal, Reversed | Rose |
| Client | Active | Emerald |
| Client | Inactive | Neutral |

- Derived states (for example "Overdue" from a due date) are computed once in shared code. Do not recompute them inline in a component.
- One badge per cell. Supporting facts (`12 days overdue`, `Balance due $400`) are text next to the badge, not a second badge.

## 3. Tables and mobile cards

**Desktop and tablet (`md` and up): a real `<table>`.**
- Header row on the secondary surface; sortable headers are buttons with an arrow icon, and the active column has `aria-sort`. Show the sort arrow affordance quietly; the active column is the only emphatic one.
- Numeric and money columns are right-aligned, header included, using the `Money` table variant.
- Identity cell: name (`text-sm font-medium`, primary) over a muted email/caption (`text-xs`). Truncate with an ellipsis and expose the full value in `title`; never truncate amounts.
- Row hover uses the secondary surface. A row link is a real anchor stretched over the row; the actions button sits above it and stops propagation.
- Do not add bulk-select checkboxes to a table that has no bulk action. Keep an existing select column working.
- Never render an empty table. Use the empty state for the domain (see `states-offline-and-feedback.md`).

**Mobile (below `md`): cards, one shared column definition.** Drive the table and the card list from the same column/row config so they can't drift.
- Card: client name top-left, amount top-right (largest text on the card), then invoice number and due date, then status badge. The whole card is the link; the 3-dot is a separate 44px control.
- Cards stack with `space-y-3`; no horizontal scroll inside or outside.
- Both layouts exist in the DOM; hide one with `hidden`/`md:hidden` so it leaves the accessibility tree.

## 4. Filters and search

- Search input first (grows), then compact `Label: Value` dropdowns that show the current value (`Status: All`).
- A non-default filter gets a subtle accent tint on its trigger so active filtering is visible at a glance. Show `Clear filters` only when at least one filter is active.
- Filters, sort and page live in the URL (`?status=overdue&currency=NGN`) so refresh, Back and shared links work. Currency uses the same param as the currency selector.
- Date filters offer presets (`Last 30 days`, `This month`, `This year`) plus `Custom`.
- Search uses `type="search"` with a visible or `aria-label` label, a clear button, and filters locally on the device (no spinner).
- Below `md`, search stays in view and the dropdowns collapse behind one `Filters` button that opens a bottom sheet with an active-count (`Filters (2)`) and an `Apply`/`Clear` footer.
- Summary cards respond to filters, and the line `Summary based on current filters` stays visible.

## 5. Row actions menu

Order encodes risk and frequency. Divider between groups:

1. Look and change: `View invoice`, `Edit invoice`
2. Next financial step: `Record payment`, `Send reminder`
3. Accounting adjustment (neutral, never red): `Void invoice` / `Reverse payment`
4. Permanent deletion (rose, confirmed): `Delete draft` / `Delete client`

Each item has an icon and a label. Items are sentence case. Menu items meet the 44px touch height on touch devices. Arrow-key navigation, Esc closes and returns focus to the trigger (use the shared menu primitive). Items shown depend on status; check the code for the real rules before changing them.

## 6. Metric cards

- Structure: quiet header strip (icon plus label) over a body with one metric-size `Money` figure and one count caption (`15 invoices`). No sparklines, trend arrows or percentage deltas unless asked for.
- Cards are not clickable by default. If a card filters the list, make it a real button with a focus ring and an active state, and say so in its label.
- Counts may be summed across currencies; money may not. In multi-currency views follow `DESIGN.md` section 5 and `money-and-currency.md` section 4; never show one blended figure.
- Layout: four across at `lg`, two by two at `sm`-`md`, and below `sm` a single stacked group of compact rows (label and count on the left, figure on the right at a smaller size). A large figure like `₦12,450,000.00` must never be clipped or force sideways scroll.
- The icon in a card says what the card is about: outstanding, overdue, paid, drafts. Don't reuse one icon for a different meaning.

## 7. Forms

**Anatomy**
- Label above the field (`text-sm font-medium`), always visible. Placeholders show an example and are visibly lighter than entered text; they are never the label and must not look like pre-filled values.
- Helper text below in muted caption size. An error replaces the helper in rose with a small icon and a text message, and is wired with `aria-describedby` and `aria-invalid`.
- Mark optional fields with `(Optional)` after the label, following Clario's existing convention. Do not add asterisks to required fields.
- Inputs use the nested-surface fill with hairline border and `rounded-lg`, `h-10`; on touch, 44px tall.
- Group related fields; pair short fields in two columns on desktop only (First/Last name, Email/Phone); one column on mobile. Field width should hint at content (an amount is narrower than an address).

**Behavior**
- **Validate on blur, then on change** once a field has an error, so the message clears the moment it's fixed. Never validate while someone is still typing their first attempt.
- Messages are specific and fixable: `Enter an amount greater than 0`, `Due date can't be before the issue date`, `Enter an email like name@example.com`.
- On submit failure: keep every value, set focus on the first invalid field, and show a short inline alert at the top only if three or more fields failed.
- Submit shows loading immediately and ignores repeat clicks. Enter submits single-line forms.
- **Dirty guard:** closing a dialog or sheet with unsaved changes asks `Discard changes?`; closing a pristine form closes at once.
- Use `autocomplete` attributes (`name`, `email`, `tel`, `street-address`) and the right `inputmode`.
- Selects for currency show code and name (`USD - US Dollar`); long lists are searchable comboboxes. A client picker shows the initials avatar and name.
- Phone: country selector (default from the person's locale) beside the number, following the existing product pattern.
- Date fields are date-only values with `min`/`max` set where a rule exists. Display and parse follow `money-and-currency.md` section 7.

## 8. Payment and invoice forms

**Record payment** (opened from an invoice or from Payments)
- Invoice pre-selected when opened from an invoice. Currency is fixed text taken from the invoice; there is no currency select.
- Amount first, with the invoice's balance due shown beside it (`Balance due $1,182.50`). Defaults to the balance due for a quick full payment, selected for easy overtyping.
- If the amount exceeds the balance due, warn without blocking and say by how much.
- Then date (default today), method, optional reference and note. Primary: `Record payment`.

**Invoice editor**
- Invoice-level fields first: client, currency, issue date, due date. Then line items, then VAT rate and discount, then notes.
- Line-item rows: Description (grows), Quantity (narrow), Unit price (money input), Total (read-only, computed). `Add item` is a secondary/ghost button. Each row has a remove icon button named `Remove item 2`.
- The totals block updates live with tabular figures and matches the invoice view exactly, so nothing surprises the person after saving.
- **Changing the currency reformats; it never converts.** Entered numbers stay the same, and a short helper says `Amounts keep their values; nothing is converted.`
- `Save` is primary. Saving a draft versus sending follows the existing flow and statuses.

## 9. Microcopy

**Voice.** Plain, calm, specific. The product sounds like a careful bookkeeper: exact verbs, no hype, no filler. No exclamation marks, no emoji, no "Oops", "Awesome", "Congrats", no "Welcome back" greetings. Describe what happens, not how the system works ("saved on this device", not "persisted to IndexedDB").

**Casing.** Match the product as built:
- **Title Case** for button labels (`Create Invoice`, `Record Payment`, `Add New Client`), page and panel headings (`Invoice Details`), and column/field labels (`Issue Date`).
- **Sentence case** for menu items, descriptions, helper text, error messages, toasts, dialog body copy and empty-state text.
- Do not "fix" the mix in passing. If you think the convention should be unified, raise it (see `known-divergences.md`).

**One action, one name** from button to dialog to toast: `Record Payment` -> `Payment recorded`; `Add New Client` -> `Client added`; `Reverse Payment` -> `Payment reversed`; `Void Invoice` -> `Invoice voided`.

**Vocabulary** (use these words consistently; pick no synonyms):

| Term | Means |
|---|---|
| Outstanding | Money still owed, unpaid plus overdue |
| Overdue | Past the due date and not paid in full |
| Balance due | What remains on one invoice or for one client |
| Total invoiced / Total paid | Client and period sums, per currency |
| Record payment | Add a received payment to an invoice |
| Reverse payment | Add a reversal entry; the original stays in history |
| Void invoice | Cancel an invoice while keeping the record |
| Send reminder | Nudge a client about an unpaid invoice |
| Client, Invoice | Never "customer", "bill" |

**Errors:** what happened, then what to do. `Couldn't save this payment. Check the amount and try again.` No blame, no apology, no technical jargon. See `states-offline-and-feedback.md` for where errors appear.

**Numbers and dates in prose:** use `Money` and the shared date formatter even inside sentences, so formatting never diverges.

## 10. Icons

Use the icon set already in the repo (shadcn's default is `lucide-react`). One icon, one meaning, across the whole product. Sizes: 16px in buttons, menus and badges; 20px in navigation. Keep one stroke width. Decorative icons are `aria-hidden`.

| Meaning | Icon idea |
|---|---|
| View | Eye |
| Edit | Pencil (only for editing) |
| Download PDF | Download |
| Send reminder | Bell or alarm clock |
| Record payment | Banknote or credit card |
| Delete | Trash |
| More actions | Vertical dots |
| Close / Back | X / Chevron left |
| Sort / Filter | Up-down arrows / Filter |
| Metric: outstanding / overdue / paid / drafts | Receipt-or-wallet / alarm clock / check-circle / file-pen |

If you are about to reuse a pencil for anything other than editing, stop and pick the right icon.
