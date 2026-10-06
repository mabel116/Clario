# Money, currency and dates

Contents: 1. Formatting rules - 2. The Money component - 3. Alignment and hierarchy - 4. Multi-currency UI - 5. Reversals and negatives - 6. Money inputs - 7. Dates

Money display is where trust is won or lost. A freelancer who sees `$1100.00` in one place and `$1,200` in another starts to wonder which one is right. Consistency here is a feature.

## 1. Formatting rules

- **Format at the edge only.** Do arithmetic in whatever representation the repo already uses for amounts (use its existing helpers; if none exist, ask before inventing one) and convert to a display string only in the `Money` component. Never do arithmetic on formatted strings or floats.
- **Always use `Intl.NumberFormat` with `currencyDisplay: "narrowSymbol"`.** With the default display, `NGN` renders as the code "NGN 1,182.50" in `en-US`; `narrowSymbol` gives the expected `₦1,182.50`. USD, EUR and GBP render `$`, `€`, `£` either way.
- **Thousands separators everywhere.** `$1,182.50`, never `$1182.50`. Two decimals for any figure that can carry cents.
- **Never round silently.** A card may drop `.00` when the value is whole (`$12,450`), but a value with cents shows them (`$12,450.50`). Tables and totals always show two decimals so columns align.
- **Ambiguous symbols.** `$` is shared by USD, CAD, AUD and others. When two currencies with the same symbol can appear on one screen, show the ISO code alongside (`USD $1,200`). Otherwise the symbol alone is enough.
- **Cache formatters.** Constructing `Intl.NumberFormat` per row is slow on long lists; build one per currency and reuse it.
- **Never truncate money.** Names and emails may ellipsize; amounts wrap the layout instead.

## 2. The Money component

Reuse the repo's existing money display if there is one. If there is none, create a single component with this shape and use it everywhere (metric cards, table cells, drawers, invoice totals, toasts).

```tsx
type MoneyProps = {
  value: number;               // major units (1182.5); convert upstream from the stored representation
  currency: string;            // ISO 4217, e.g. "USD"
  variant?: "metric" | "table" | "inline";
  tone?: "default" | "muted" | "attention" | "overdue" | "positive";
  className?: string;
};

const formatters = new Map<string, Intl.NumberFormat>();
function fmt(currency: string, whole: boolean) {
  const key = `${currency}:${whole}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      ...(whole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    });
    formatters.set(key, f);
  }
  return f;
}

export function Money({ value, currency, variant = "table", tone = "default", className }: MoneyProps) {
  const whole = variant === "metric" && Number.isInteger(value);
  const parts = fmt(currency, whole).formatToParts(value);
  return (
    <span className={cn("tabular-nums", toneClass[tone], variantClass[variant], className)}>
      {parts.map((p, i) => (
        <span key={i} className={p.type === "currency" && variant === "metric" ? "text-muted" : undefined}>
          {p.value}
        </span>
      ))}
    </span>
  );
}
```

Signature detail (metric variant only): the currency symbol sits in the muted text color while the digits carry the primary text color. The eye lands on the number, and the symbol still reads clearly. Do not vary the symbol's size or baseline; it adds noise.

Tone mapping: `default` primary text; `muted` for zero balances and secondary figures; `attention` (amber-700 / dark amber-400) for an outstanding balance that is owed but not late; `overdue` (rose) for late balances; `positive` (emerald) only for received-money contexts. Tone is applied to the figure only when it carries that state. A row is never tinted.

## 3. Alignment and hierarchy

- Amounts are **right-aligned** in tables, and the column header is right-aligned too. `tabular-nums` (Inter supports tabular figures) so digits line up vertically.
- On mobile cards, the amount sits top-right of the card, in the largest text on the card, with the client name at top-left.
- Hierarchy on an invoice: **balance due** is the lead figure. The total is second. Line items and tax are supporting detail.
- A zero balance is quiet (`muted` tone, no dot). An owed balance gets its state color plus a small dot so it is not communicated by color alone; adjacent text or the row's status badge supplies the label.
- Do not animate figures (no count-up, no odometer). Numbers should simply be there. Animation on money reads as marketing.

## 4. Multi-currency UI

The rule that never bends: **amounts in different currencies are never summed, averaged or blended into one figure**, anywhere (cards, tables, footers, drawers, page titles, notifications, exports). Two currencies mean separate figures or a filtered view. The UI never converts either; there are no exchange rates.

For presentation, follow `DESIGN.md` section 1 (progressive currency disclosure) and section 5 (multi-currency summary rules) exactly:

- **Progressive disclosure.** Work out the distinct currencies from the user's data. With one currency, render the standard view with no selector and no multi-currency chrome. The currency selector, and any currency column or filter that exists only to tell currencies apart, appears only once a second currency is introduced.
- **Selector.** Build its options from the currencies actually present, not a hard-coded list. Selecting a currency updates the summary cards to that currency's sums and filters the list below, as `DESIGN.md` describes.
- **Anything `DESIGN.md` does not specify** (for example exactly how the `All` choice is laid out in a summary card) is not yours to invent. Follow the existing product decisions and shared components. If nothing exists, choose the most conservative presentation that keeps currencies visibly separate (one figure per currency, each labelled with its code), and flag it in your report as a design decision to confirm. Do not introduce new interaction patterns, expanders or controls for this.
- **Elsewhere amounts might combine** (a client's financial summary, drawers, exports) apply the same rule: group by currency. A client with invoices in USD and NGN gets one financial summary block per currency, each labelled with its code.
- **Filters.** A Currency filter filters; it never converts.
- Counts (for example `15 invoices`) are not money and may be totalled across currencies.

## 5. Reversals and negatives

- A reversal is a new entry, shown in the list with the rose "Reversal" badge (DESIGN.md) and its amount with a true minus sign (`−$1,200.00`, U+2212), not a hyphen.
- The original payment stays visible. Its state may update (for example noting it was reversed) but the row is never removed.
- Do not make negative numbers red by default. Red is a status, not a sign.

## 6. Money inputs

- Use `type="text"` with `inputMode="decimal"`. Do not use `type="number"`: the scroll wheel silently changes values, spinners appear, and locale handling is poor.
- Show the currency as a non-editable prefix adornment inside the field (`$`, `₦`), or the ISO code when the symbol is ambiguous.
- Accept pasted values with commas or spaces; keep the raw text while typing; format to two decimals on blur; right-align the text.
- Validate: greater than zero for payments and line items, decimal places allowed for that currency, and an upper sanity bound with a clear message. On payments, warn (do not block) when the amount exceeds the invoice's balance due, and say by how much.
- The currency of a payment always equals the invoice's currency. Show it, do not offer a select.

## 7. Dates

- **Display format is `12 Jan 2026` everywhere** (day, short month, year, no comma). Use one shared formatter. Never mix `12 Jan, 2026`.
- Issue and due dates are **calendar dates, not instants.** `new Date("2026-01-12")` parses as UTC midnight and can display the previous day in some time zones. Parse date-only strings into a local calendar date (or format with `timeZone: "UTC"`) so a due date never shifts by one day.
- Pair absolute dates with relative status where it helps decisions: `Due in 3 days`, `12 days overdue`, `Due today`. The relative phrase is supporting text under or beside the date, in muted or overdue tone.
- Missing dates render as an em dash (`—`), never blank and never "N/A" (drafts often have no due date).
- Timestamps for sync or snapshot ("4 min ago") use relative time and expose the absolute time in a `title` or tooltip.
