# Accessibility, responsive behavior, motion and dark mode

Contents: 1. The baseline - 2. Responsive behavior - 3. Touch targets - 4. Keyboard and focus - 5. Semantics and screen readers - 6. Color, contrast and dark mode - 7. Motion - 8. Manual check script for the owner

The baseline (375px, no horizontal scroll, 44px targets, visible focus, status never color-only, both themes) is a floor, not a polish pass. Build it in from the first commit.

## 1. The baseline

- Every screen works at **375px wide with zero horizontal scrolling** and every interactive target is at least **44px** on touch (`DESIGN.md` section 1).
- Everything is operable by keyboard, with a visible `focus-visible` ring (`DESIGN.md` section 4).
- Status, severity and state are never communicated by color alone.
- Light and dark are both correct on every screen you touch.
- Text can be zoomed to 200% without loss of content or function. Never disable pinch-zoom in the viewport meta tag.

## 2. Responsive behavior

`DESIGN.md` section 5 says desktop is 1024px and up but writes its table/card switch with `md:` classes (768px). Treat it as three bands:

| Width | Layout |
|---|---|
| Below `md` (under 768px) | Stacked cards, no tables. Drawers become full-screen sheets. Dialogs become full-height sheets with a sticky footer. |
| `md` to under `lg` | Table with secondary columns dropped (Contact, Last invoice, Currency where redundant). Sidebar is an off-canvas panel. |
| `lg` and up (1024px+) | Full table, persistent sidebar. Opening a drawer hides the secondary columns so nothing scrolls sideways. |

Rules:
- Page padding, card padding and vertical rhythm come from `DESIGN.md` section 3. Do not hand-tune per page.
- **Sidebar** collapses behind the existing toggle or menu below `lg`. No bottom tab bar and no floating action button: they cover data.
- **Page header** stacks on mobile: title, description, then the primary action as a 44px button (full width when alone).
- **Filters** collapse into one `Filters` button and a bottom sheet below `md` (`components-forms-copy.md` section 4).
- **Drawers** below `md`: full-screen sheet with a back button and the same sections in the same order.
- **Dialogs** below `md`: full-height sheet, content scrolls, footer with the buttons stays pinned and respects the safe area.
- **Wide content** (tables, code, long invoice line items) scrolls inside its own container if it must, but the page body never scrolls sideways. Prefer restructuring (cards) over inner scrolling.
- **Long content survives.** Names, emails and notes truncate or wrap; amounts never truncate. Test with long client names and amounts like `₦12,450,000.00`.
- Respect device safe areas for anything pinned to a screen edge (sticky footers, toasts).
- Use `dvh`, not `vh`, for full-height sheets so mobile browser chrome doesn't clip buttons.

## 3. Touch targets

A small control may stay visually small (`sm` buttons, icon buttons, checkboxes) as long as its tap area reaches 44px on touch. Extend the hit area; do not enlarge the visual. Add this utility once and reuse it:

```css
@media (pointer: coarse) {
  .tap-target { position: relative; touch-action: manipulation; }
  .tap-target::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: max(100%, 44px);
    height: max(100%, 44px);
    transform: translate(-50%, -50%);
  }
}
```

Keep at least 8px between adjacent small targets so their extended areas don't overlap. Menu items, tabs, pagination buttons and the 3-dot trigger all qualify.

## 4. Keyboard and focus

- Tab order follows visual order. Do not use positive `tabindex`.
- Focus ring: `ring-2` in the accent color with an offset that uses the surface token, so the gap is dark in dark mode instead of a white halo. Never remove an outline without replacing it.
- **Dialogs and drawers** (both are dialogs): focus moves in on open (first field, or the heading when there's no field), is trapped inside, `Esc` closes, and focus returns to the control that opened it. Use the shared primitive (shadcn/Radix) and give every one a title, visible or visually hidden.
- The page behind a drawer is inert while it is open.
- **Rows:** a clickable row has a real link or button inside it that is reachable by Tab; the whole-row click is an enhancement for pointers.
- **Menus and tabs** use arrow-key navigation through the shared primitives. Tabs use roving focus.
- After a save that closes a dialog, return focus to the trigger or the new row, not to the top of the page.
- Add a skip link to the main content in the app shell if it is not there.

## 5. Semantics and screen readers

- Real elements: `table`, `button`, `a`, `dl` for label/value pairs, headings in order (one `h1` per page, then `h2`).
- Sortable headers: a button inside `th`, with `aria-sort` on the active one.
- Badges are text. Do not hide the label and rely on the dot.
- **Color-coded amounts** (`overdue`, `attention` tones) carry a visually hidden word so the state isn't color-only: `<span class="sr-only">Overdue </span>`. Keep the currency symbol in the same text node as the number so it reads as one amount.
- Icon-only controls have an accessible name. Decorative icons are `aria-hidden`.
- Live regions: toasts and sync changes use `role="status"` (polite); only blocking errors use `role="alert"`.
- Every route sets a unique document title (`Invoices - Clario`, `INV-0101 - Clario`). Use landmarks (`header`, `nav`, `main`).
- Don't convey meaning with position or color words in copy ("the red button").

## 6. Color, contrast and dark mode

- The `DESIGN.md` palette is built for readable contrast. Do not introduce lighter greys than the Text Muted token for text, and never use Text Muted for something the person must read to act. Placeholder text uses the muted token; disabled controls use the specified opacity and are not the only way a requirement is communicated.
- Check any text on the blue plan card in the sidebar for contrast.
- **Dark is its own palette** (`DESIGN.md` section 2), not an inversion. Use semantic tokens so components carry no per-theme overrides, except inside the shared `StatusBadge` and button components, where the light/dark pairs are defined once.
- Dark mode checks on every screen touched:
  - Hairline borders are visible but quiet on the card and canvas surfaces.
  - Badges stay legible with their tinted dark variants and keep their text labels.
  - Focus rings are visible against the dark surface.
  - Nothing relies on a drop shadow to separate surfaces; layering comes from the surface levels.
  - Key figures (`Text Primary`) are the brightest thing on the screen; muted text is visibly quieter but still readable.
  - Skeletons use the nested-surface color, not a hard-coded grey.
  - Images and the avatar don't glare against the dark surface.
- Respect the person's saved theme; avoid a flash of the wrong theme on load.

## 7. Motion

Motion answers an action (open, close, confirm, reveal what changed). It never runs on its own and never decorates a number.

| Moment | Treatment |
|---|---|
| Drawer open / close | Slide from the right, ~250ms ease-out in, ~200ms ease-in out; scrim fades |
| Dialog open / close | Fade and slight scale (95% to 100%), ~150ms |
| Menus, popovers, tooltips | Fade, ~100ms |
| Toast | Fade and rise in, fade out |
| Button loading | Inline spinner, no size change |
| Skeleton | Static or gentle pulse, appears only after the 75ms deferral |
| Row or balance changed by the person's action | One soft highlight fading over ~1.2s (see `states-offline-and-feedback.md` section 7) |

**Never:** staggered page-load entrances, hover-lift on cards or rows, count-up or odometer numbers, parallax, looping or attention-seeking animation, confetti or celebration on payment. Money should look settled.

**The one signature moment** is recording a payment: the dialog closes, the balance and status badge update in place, the affected row or figure gets the single soft highlight, and one toast says `Payment recorded`. That is the whole effect. It should feel like a ledger line being written.

**Reduced motion.** Honor `prefers-reduced-motion` (use `motion-reduce:` variants): remove slides, scales, pulses and highlights' movement; keep instant state changes and opacity changes of 100ms or less. The state change itself must still be perceivable (the highlight becomes a static tint that clears on the next interaction or after a few seconds).

## 8. Manual check script for the owner

The person reviewing does browser testing by hand and is not assumed to know DevTools, so write checks as numbered steps with exact clicks. Adapt this template to the change and include only the steps that apply:

1. **Open the page:** start the dev server yourself, then open `<exact URL>`.
2. **Mobile width (375px):** press `F12` to open DevTools. Click the device toolbar icon (a phone and tablet) at the top-left of the DevTools panel. In the bar above the page, choose `Responsive` and set the width to `375`. *Correct:* no sideways scrollbar, cards instead of a table, buttons are easy to tap. *Wrong:* anything cut off at the right, a horizontal scrollbar, tiny buttons.
3. **Tablet (768px) and desktop (1280px):** repeat with those widths. *Correct:* the table appears at 768 with fewer columns; at 1280 all columns show.
4. **Dark mode:** use the Dark Mode switch at the bottom of the sidebar. *Correct:* text is readable, badges still show their words, borders are visible but quiet. *Wrong:* white boxes, invisible text or borders.
5. **Keyboard only:** click the page background, then press `Tab` repeatedly. *Correct:* a blue ring moves in a sensible order to every button and link. Press `Enter` on a row link to open it and `Esc` to close a panel; focus should go back to where you started. *Wrong:* focus disappears or gets stuck.
6. **States:** check the empty state (an account or filter with no results), the loading look (briefly, on reload), and a long client name or large amount.
7. **Multi-currency:** open with one currency in the data, then with two or more. *Correct:* one currency shows no currency selector; with several, picking a currency changes the cards and the list, and "All" never shows a single combined number.
8. **Offline (if the change touches data):** turn off your network adapter in Windows (not DevTools throttling), perform the action, then turn it back on. *Correct:* the action works and a calm note says it's saved on this device and will sync.

For every step say what *correct* looks like and what *wrong* looks like, so the check is a comparison, not a judgment call.
