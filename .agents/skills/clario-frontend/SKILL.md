---
name: clario-frontend
description: Frontend design and implementation guide for Clario, the offline-first workspace where solo creative freelancers manage clients, invoices, payments and outstanding balances (Next.js App Router, TypeScript, Tailwind, shadcn/ui). Use this skill for ANY UI work in the Clario codebase - building or changing screens (dashboard, invoices, invoice detail, payments, clients, settings), components, tables, drawers, modals, forms, empty/loading/offline/error states, dark mode, mobile and responsive layouts, accessibility, motion, microcopy, or reviewing UI code for consistency. Trigger whenever the task touches Clario, DESIGN.md, invoices, payments, clients, balances, currencies, status badges or how money is displayed, even if the request is only "add a page", "fix this layout" or "make this look right" and never mentions design. Complements DESIGN.md, which stays the source of truth for tokens and financial invariants.
---

# Clario frontend

Clario helps a solo freelancer see exactly where their money stands: who owes what, what has been paid, what is late. It is offline-first, so the interface must also be honest about what the device knows right now. Every UI decision should make money and its state easier to read, or get out of the way.

## How this skill and DESIGN.md fit together

`DESIGN.md` is the **specification**: palette (light and dark), type scale, spacing, radii, button variants, badge semantics, financial invariants. This skill deliberately does not restate those values, so they cannot drift apart. It supplies what a spec cannot: the order of work, judgment calls, per-screen patterns, state handling, offline honesty, accessibility and QA.

When sources disagree on a UI or design decision, use this priority:

1. **Product requirements and product/data rules** (PRD, `DECISIONS.md`, `CLAUDE.md`, `.agents/AGENTS.md`, if present). A UI must never promise something the product or data layer does not do. Clario's current product scope is the source of truth for what exists: do not add pages, metrics or features that are not in it.
2. **`DESIGN.md`**, Clario's design specification and the visual source of truth.
3. **Existing approved shared components and implementation patterns.** Reuse them where they fit. They are technical context, not visual authority: an existing screen that conflicts with `DESIGN.md` does not outrank it.
4. **This skill.** How to approach, implement, review and refine UI inside that system.

If an existing screen conflicts with `DESIGN.md`, follow `DESIGN.md` and say so in one sentence in your final report. `references/known-divergences.md` documents differences already observed between `DESIGN.md` and the current design/implementation, with a default for each. You never need any original design files or screenshots to use this skill; `DESIGN.md` is the written form of those visual decisions.

`DESIGN.md` is not repeated here beyond the rules that matter most for implementation. Read it; don't rely on this skill's summaries of it.

## Design stance: a ledger, not a dashboard

Aim for the feeling of a well-kept ledger translated into modern UI: calm, exact, unhurried.

- **Quiet chrome.** White surfaces, hairline borders, generous space. The blue accent is reserved for the primary action, active navigation, links and focus. Nothing else earns it.
- **Numbers are the typography.** Amounts are tabular, aligned and consistent everywhere. The figure is the loudest thing on any screen; everything around it is quieter.
- **Color means state, never decoration.** Emerald, amber and rose appear only on status badges and on figures that carry that status. No gradient washes, no tinted rows, no icon-in-a-colored-circle stat cards.
- **Spend boldness in one place.** One dominant figure per screen. If a second element competes for attention, quiet it.
- **Honesty is the brand.** Plain words, exact verbs, no exclamation marks, no fake urgency, no animation that dresses up a number.

Avoid the templated-dashboard look. Resist the usual reflexes: identical rounded cards for everything, decorative gradients, hover-lift, count-up numbers, icon-in-a-colored-circle tiles. In Clario a large figure over a small label is earned because money *is* the product, so earn it further by getting the details right (tabular figures, consistent alignment, real states) rather than adding ornament.

## Workflow

1. **Read before writing.** Read `DESIGN.md`, then the repo docs relevant to the task, then the nearest existing screen and the shared components it uses. Search the codebase for what already exists (money display, status badge, button variants, sheet/drawer, data table, empty state, data/readiness handling) and reuse it. Creating a parallel version of an existing component is the most common way a design system decays.
2. **State the screen's job in two sentences:** what is the single most important figure, and what is the primary action (if there is one)? If you cannot, the layout is not ready to build.
3. **Design the states first:** loading, account-empty, filtered-empty, error, offline, live. The happy path is the easy part. See `references/states-offline-and-feedback.md`.
4. **Build with the existing tokens and components.** No raw hex values, no one-off spacing, no restyled buttons. If a needed variant does not exist, add it to the shared component, not to the call site.
5. **Verify** at 375px wide, at desktop width, in dark mode, by keyboard only, and offline (see the checklist below).
6. **Critique before finishing.** Remove one accessory: the decoration, badge, border or line of copy that does not help someone understand their money.
7. **Report** in plain language (see "Reporting").

## The rules that carry the product

**1. Money first, context second.** On every screen the totals, balance due and payment state take the top of the hierarchy; contact details, notes and secondary metadata sit below and read quieter. If a layout puts an email address above a balance, reorder it.

**2. Currencies never blend.** Never add, average or compare amounts in different currencies as one figure, including in footers, totals and "All" filters. Two currencies means separate lines or a filtered view. Single-currency users see no multi-currency chrome at all. Where `DESIGN.md` does not specify how a multi-currency view is presented, follow the established design system and existing product decisions rather than inventing a new pattern. Details: `references/money-and-currency.md`.

**3. The UI never lies about the data's state.** Show a skeleton, not `$0.00`, until the figure is real. Distinguish "nothing here yet" from "nothing matches your filters" from "still loading". Show snapshot, offline and sync states quietly and truthfully. Never show a spinner that can outlive the data being ready.

**4. The ledger only appends.** Payments are history. The interface offers *Reverse*, never *Delete*, for a recorded payment; reversals appear as visible entries. Accounting adjustments (Void invoice, Reverse payment) use the calm secondary style, not red. Red-toned destructive styling is strictly for permanent deletion (Delete draft, Delete client).

**5. The baseline is non-negotiable.** Every screen works at 375px with no horizontal scroll, every tap target is at least 44px, every action is reachable by keyboard with a visible focus ring, status is never conveyed by color alone, and both themes are correct. Details: `references/accessibility-responsive-motion.md`.

**6. Stay inside the brief.** Do not add, rename, merge or re-color invoice or payment statuses; use the status type the codebase already defines. Do not add navigation items, metrics or features that were not asked for. If `DECISIONS.md` records deliberate choices that affect the UI (for example around link prefetching), respect them and check before changing them.

## Implementation conventions

- **Stack:** Next.js App Router, TypeScript, Tailwind, shadcn/ui primitives. Extend primitives through variants (for example `cva`) rather than long `className` overrides at call sites.
- **Data lives on the device.** Clario is offline-first: screens read from local data, so reuse Clario's existing data, readiness and sync architecture for loading, empty and not-found handling, and avoid introducing parallel patterns (a second loading flag, network-shaped fallbacks, ad-hoc fetching). Find how the repo already does it and follow that.
- **Tokens:** use the semantic tokens or Tailwind classes that already encode DESIGN.md. Where DESIGN.md gives light and dark pairs (badges, buttons), define each pair once inside the shared component so call sites never write `dark:` classes for them.
- **Centralize meaning:** one `StatusBadge`, one `Money`, one date formatter, one `EmptyState`. Screens compose them; they do not reimplement them.
- **Icons:** `lucide-react`, one meaning per icon across the product (Edit = pencil, Send reminder = bell or alarm, Download = download, View = eye).
- **Files:** follow the repo's existing folder conventions; do not reorganize as a side effect of a UI task.

## Reference index

Read only what the task needs. Each file opens with a table of contents.

| Task involves | Read |
|---|---|
| Any amount, total, currency selector, dates, money inputs | `references/money-and-currency.md` |
| Building or changing a specific screen, drawer or modal | `references/screen-patterns.md` |
| Loading, empty, error, offline, sync, toasts, confirmations | `references/states-offline-and-feedback.md` |
| Buttons, badges, tables, forms, validation, microcopy, icons | `references/components-forms-copy.md` |
| Responsive behavior, touch, keyboard, focus, contrast, motion, dark mode | `references/accessibility-responsive-motion.md` |
| An existing screen, `DESIGN.md` or the product rules seem to disagree | `references/known-divergences.md` |

## Definition of done

Before calling UI work complete, confirm each of these and be ready to say how:

- [ ] The primary figure and primary action are obvious in under two seconds, and each surface has one clear primary action where it has one (more only when the interaction genuinely needs equally important actions).
- [ ] No amounts from different currencies are combined; single-currency accounts show no currency chrome.
- [ ] Amounts use the shared `Money` display: tabular, right-aligned in tables, never rounded silently.
- [ ] Loading, account-empty, filtered-empty, error and offline states exist and read correctly; no `0` shown before data is real; skeletons reserve final dimensions.
- [ ] 375px: no horizontal scroll, 44px targets, cards instead of dense tables, drawers become full-screen sheets.
- [ ] Dark mode checked with no hardcoded colors; badges keep their text labels.
- [ ] Keyboard: logical tab order, visible focus, Esc closes overlays and returns focus to the trigger.
- [ ] Copy follows the product's casing convention (Title Case buttons and headings, sentence case menus, prose, errors and toasts; see `references/components-forms-copy.md`), uses exact verbs, and the same action has the same name in the button, dialog and toast.
- [ ] Any conflict with `references/known-divergences.md` was handled with its default and mentioned in the report.
- [ ] Nothing new was invented that the brief did not ask for (statuses, metrics, nav items, features).
- [ ] Type-check, lint and the existing tests pass, and you have the raw output.

## Reporting

The person reviewing your work does the browser testing themselves and is not necessarily an engineer. So:

- **Never drive a browser, run browser automation, or sign in to anything.** Verification of what the screen looks like is done by a human. Give them a short manual checklist: which page to open, what width to try, what they should see, what would indicate a problem.
- Lead with what changed and why, in plain language, then list the files touched.
- Separate what you ran (paste raw command output for type-check, lint, tests) from what you could not check (anything visual). Do not claim something is verified, committed or working unless you have the output to show it.
- Mention any conflicts you found between sources in one sentence each, with the default you followed.
- Track anything you noticed but did not change (a copy typo on another screen, an inconsistency) in a short "noticed, not touched" list rather than fixing it as a side effect.
