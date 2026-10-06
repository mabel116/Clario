# Screen patterns

Contents: 1. App shell - 2. Page header - 3. Dashboard - 4. Invoices list - 5. Invoice detail - 6. Payments list and drawer - 7. Clients list and drawer - 8. Add and edit modals - 9. Settings

These describe how Clario's screens are structured and how to extend them, as a complement to `DESIGN.md`. Reuse the repo's existing shared components and layouts where they fit. If an existing screen conflicts with `DESIGN.md`, follow `DESIGN.md` and see `known-divergences.md`. Screens `DESIGN.md` does not describe (dashboard, settings) follow the principles here and add nothing that was not asked for.

## 1. App shell

- **Sidebar:** logo and collapse toggle, then Dashboard, Invoices, Payments, Clients. Bottom group: plan card, dark mode toggle, Support & Help Center, Settings. Active item is a solid accent fill with white text and an icon in the same state.
- **Top bar:** page breadcrumb (icon plus label, for example `Invoices / View Invoice`), global search, notifications, avatar menu.
- **The plan card is the quietest thing in the shell.** It is dismissible, it never appears above the navigation on mobile, and it never interrupts a task (no upgrade prompts inside Record Payment or Create Invoice). It must not visually outrank a figure on the page.
- **Where sync status lives:** a small, quiet indicator in the shell (top bar or sidebar footer), see `states-offline-and-feedback.md`.
- **Below 1024px** the sidebar collapses behind the existing toggle or menu; do not invent a new navigation paradigm. Bottom tab bars and floating action buttons are not used, because they cover data.

## 2. Page header

Page title (24px bold, DESIGN.md), one line of muted description that says what the page is for, and the page's primary action at the right (`+ Create Invoice`, `+ Record Payment`, `+ Add New Client`). On mobile the header stacks: title and description first, then the primary action as a 44px button (full width when it is the only action). Prefer one clear primary action per screen.

## 3. Dashboard

`DESIGN.md` does not describe the dashboard, so stay conservative and build only what the request or PRD names.

- The **first thing seen is outstanding money**, then overdue, then received. Whatever metrics exist, the order encodes urgency: what is owed and late leads.
- Period control and currency selector sit together above the cards; the currency selector appears only for multi-currency accounts (see `money-and-currency.md`).
- Under the cards, work-oriented lists are more useful than decoration: "needs attention" (overdue invoices, most days late first) and recent payments, each row linking to its detail.
- When showing cached data, a muted snapshot badge (`Showing snapshot from 4 min ago`) sits beside the period control, and the swap to live data happens in place with no layout shift and no animation.
- A brand-new account gets the positive empty state with one clear action, never a wall of zeros.

## 4. Invoices list

Anatomy, top to bottom:

1. **Header** with `+ Create Invoice`.
2. **Four summary cards** (Total Outstanding, Overdue, Paid, Drafts). Each card is a quiet header strip (icon plus label) over a body with the figure and a count line (`15 invoices`). The figure is the metric-size `Money`. Below the cards a single info line, `Summary based on current filters`, makes it explicit that filters change the cards; keep it.
3. **Filter row:** search (invoice number, client name), then compact `Label: Value` dropdowns (Status, Currency, Issue Date, Due Date). On mobile, search stays visible and the dropdowns collapse into one `Filters` button that opens a bottom sheet and shows an active-filter count.
4. **Table** (desktop and tablet) with columns: select, Invoice #, Client (name over muted email), Amount (right-aligned), Currency, Issue Date, Due Date, Status, Action. Rows are 56px. Draft invoices show `—` for a missing due date.
5. **Mobile cards** replace the table below the table breakpoint: client name and status badge on the first line, invoice number and due date on the second, the amount large at top-right. The whole card is the link; the menu is a separate 44px button.

Row behavior:

- The row navigates to the invoice. Implement with a real link on the invoice number (or client name) stretched over the row so it works with keyboard, middle-click and screen readers; do not attach only an `onClick` to a `<tr>`.
- The 3-dot menu is a ghost icon button with an accessible name (`Actions for INV-0101`). Menu items depend on status. Defaults: **Unpaid/Overdue:** View invoice, Edit invoice, then a divider, Record payment, Send reminder. **Draft:** View, Edit, Mark as sent, then a divider and Delete draft (destructive, confirmed). **Paid:** View, Download PDF. Void invoice is a secondary-style item, never red. Check the codebase for the real status-to-action rules before changing them.
- Overdue: the due date takes the overdue tone with supporting text (`12 days overdue`). The row background never changes.
- Footer pagination: `Show [10] rows per page`, numbered pages with an ellipsis, Previous and Next. On mobile reduce to Previous, `Page 1 of 10`, Next.

## 5. Invoice detail

Reads like a calm, printed document with a clear action bar above it.

- **Top row:** ghost `Back` button and breadcrumb.
- **Title row:** invoice number and status badge, with the **amount visible at primary weight** (do not render the amount in muted gray beside the number). Directly beneath, one supporting line of the money story: `Balance due $1,182.50 - due 31 Jan 2026` (or `Paid in full on 12 Jan 2026`).
- **Actions:** the main next step is the primary action. For an unpaid invoice that is `Record payment`. `Download PDF`, `Edit invoice`, `Send reminder` are secondary. Overflow (3-dot) holds Void invoice and Mark as sent. On mobile: primary button full width, others in a `More` menu.
- **Document card:** From, Billed To and Invoice Details as three columns on desktop, stacked on mobile. Details are label/value pairs (`<dl>`), labels muted.
- **Line items:** table on desktop (Description, Quantity, Unit Price, Total; numeric columns right-aligned). On mobile each line becomes a stacked row (description, then `5 x $150.00`, total at right).
- **Totals block** (right-aligned, narrow): Sub-total, VAT with its rate (`VAT (7.5%)`), Discount, then **Total** emphasized, then **Paid** and **Balance due** when payments exist. Balance due is the emphasized figure once any payment has been recorded.
- **Payment history** below the document when payments exist: each entry (date, method, amount, reversal marker) in append-only order.
- **Notes** at the bottom in muted body text.
- The rendered PDF/print layout is a separate concern; do not restyle the on-screen page to serve it.

## 6. Payments list and drawer

- **List columns:** Invoice #, Client, Date, Method (small pill with icon: Bank Transfer, Card), Amount (right-aligned), Status badge. Filters: Status, Method, Date, Currency. Footer pagination as above.
- **Status vocabulary:** use exactly the payment statuses the code defines. Do not mix invoice words (`Paid`) into payment rows or invent new ones.
- **Drawer (right sheet, shared width token):**
  1. Amount at metric size, with the status badge beneath it.
  2. Actions: `Reverse payment` as a secondary button (with a confirm dialog, see the states reference). A recorded payment has no Delete.
  3. Details as a `<dl>`: Client, Invoice (`View` link plus number), Payment date, Method, Reference, Note. Empty values show `—`.
- Row click opens the drawer, Esc closes it and returns focus to the row. The list behind stays put and is inert while the drawer is open.

## 7. Clients list and drawer

- **List columns:** select, Client (initials avatar plus name), Contact (email over phone), Last invoice, Outstanding (right-aligned), Action. Filters: search, Type. **Outstanding** is the money column: tinted by state with a small dot when owed (amber owed, rose overdue), muted `0.00` when settled. A client's list row shows the outstanding in the invoice currency; a client with several currencies shows one line per currency.
- **Drawer collapse:** when the profile drawer is open on desktop, the Contact and Last invoice columns hide so nothing scrolls horizontally (DESIGN.md). The drawer must therefore expose that contact information itself.
- **Drawer order (money first):** identity header (name, email) with actions; **Financial summary** (Total invoiced, Total paid, Balance due, Last invoice date), **one block per currency**; then Client info (status, type, phone, address, added on); then tabs (Invoices, Payments, Notes).
- **Actions:** `Create invoice` is the primary button in the drawer; `Edit` is secondary; overflow holds Delete client (destructive, confirmed, states plainly what is deleted).
- Tabs hold compact tables that reuse the same row and badge components as the main lists.
- Below 1024px the drawer becomes a full-screen sheet with a back button instead of a side panel.

## 8. Add and edit modals

- Title, one line saying what the modal does (`Add someone you invoice.`), then the form. Client Type (`Individual` / `Business`) is the first control and changes the fields below it (Business adds company name). Footer: `Cancel` (secondary) and the primary submit (`Add client`), right-aligned, primary last.
- Forms follow `components-forms-copy.md`. Two columns for short paired fields on desktop, one column on mobile. On mobile the modal becomes a full-height bottom sheet with a sticky footer holding the buttons.
- Focus lands on the first field on open; Esc and Cancel close it; if fields were edited, closing asks for confirmation, otherwise it closes immediately.
- `Record payment` is the most important modal in the product: invoice pre-selected when opened from an invoice, currency shown as fixed text, amount field first, balance due displayed beside it, date defaulting to today, method, optional reference and note.

## 9. Settings

`DESIGN.md` does not describe Settings. Reuse the card, table and form patterns. Group settings into sections with section headers (18px semibold), one save action per section, and clear labels for anything that affects money display (default currency, VAT rate, invoice numbering). Do not add settings that were not requested.
