# Clario Design System (DESIGN.md)

## 1. Principles & Financial Invariants
- Money First, Context Second: Financial totals, balances due, and payment states occupy the primary visual hierarchy. Supporting contact info, notes, and links sit below and read visually quieter.
- Strict Currency Isolation: Never sum, aggregate, or blend monetary figures across different currencies into a single number. Two currencies always mean distinct lines or filtered breakdowns.
- Progressive Currency Disclosure: Single-currency users see a standard, clean dashboard with zero multi-currency chrome. Multi-currency controls appear only when a second currency is introduced.
- Positive Empty States: Empty states are clean invitations with clear primary actions ("Add your first client", "Create an invoice"), never a discouraging wall of zeros.
- Zero-CLS Local Reads: Sub-30ms SQLite reads must gate skeletons behind a 75ms deferral to prevent single-frame layout twitching.
- Touch & Mobile Baseline: Every screen must function at 375px viewport width with zero horizontal scrolling and minimum 44px active touch targets.

## 2. Color System & Dual Palette

### Light Mode (Primary Default)
- Base Canvas (Level 0): #ffffff (Pure white)
- Cards, Tables & Sidebar (Level 1): #ffffff
- Surface Stroke / Borders: #E5E7EB (Gray-200), width 1px (or 0.5px hairline)
- Secondary Surface (Headers, Inputs, Hover): #F9FAFB (Gray-50) with #E5E7EB border
- Text Primary (Headings, Key Numbers): #111827 (Gray-900)
- Text Body (Table Text, Descriptions): #374151 (Gray-700)
- Text Muted (Labels, Subtext, Timestamps): #6B7280 (Gray-500)
- Primary Interactive Accent: #2563EB (Blue-600), Hover #1D4ED8 (Blue-700)

### Dark Mode (Matte Obsidian / Carbon)
- Base Canvas (Level 0): #09090b (Deep matte charcoal)
- Cards, Tables & Sidebar (Level 1): #121215 with #27272a (Zinc-800) hairline border
- Nested Surfaces (Table Headers, Modal Inputs, Hover): #1c1c21 with #2e2e35 border
- Text Primary (Headings, Key Numbers): #ffffff (Pure white, maximum contrast)
- Text Body (Table Text, Descriptions): #e4e4e7 (Zinc-200)
- Text Muted (Labels, Subtext, Timestamps): #a1a1aa (Zinc-400)
- Primary Interactive Accent: #3b82f6 (Vibrant Blue), Hover #60a5fa (Blue-400)

### Status Badges (Dot-Pill Semantics)
Status is always conveyed by an explicit text label alongside a color indicator:
- Paid / Received:
  - Light: bg-emerald-50 text-emerald-700 border border-emerald-200
  - Dark: bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
- Unpaid / Sent:
  - Light: bg-amber-50 text-amber-700 border border-amber-200
  - Dark: bg-amber-500/10 text-amber-400 border border-amber-500/20
- Overdue / Reversal:
  - Light: bg-rose-50 text-rose-700 border border-rose-200
  - Dark: bg-rose-500/10 text-rose-400 border border-rose-500/20
- Draft / Inactive:
  - Light: bg-gray-100 text-gray-700 border border-gray-200
  - Dark: bg-zinc-800/60 text-zinc-300 border border-zinc-700

## 3. Typography & 8pt Spatial Scale
- Font Family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.
- Typography Scale:
  - Page Titles: text-2xl font-bold tracking-tight (24px)
  - Section Headers: text-lg font-semibold (18px)
  - Metric Figures: text-3xl font-bold tracking-tight (30px)
  - Table Headers: text-xs font-medium uppercase tracking-wider text-muted
  - Table Body: text-sm font-medium (14px)
  - Captions & Subtext: text-xs (12px)
- Spatial Grid:
  - Page Padding: Mobile 16px (p-4), Tablet 24px (p-6), Desktop 32px (p-8).
  - Card Internal Padding: Metric cards 20px-24px (p-5/p-6); Forms/Details 24px-32px (p-6/p-8).
  - Vertical Stacking: Header-to-content 24px (space-y-6); Section-to-section 32px (space-y-8); Form items 16px (space-y-4).
- Radii:
  - Outer Cards & Modals: rounded-2xl (16px) or rounded-xl (12px)
  - Inputs & Buttons: rounded-lg (8px)
  - Status Badges & Pill Tabs: rounded-full (9999px)

### Form Input & Money Display Rules
- Form Inputs: Desktop 40px (h-10), Mobile 44px (h-11) to meet touch target guidelines and prevent iOS auto-zoom. Border: 1px #E5E7EB in Light Mode, #27272a in Dark Mode. Radius: rounded-lg (8px).
- Money Display: Always tabular figures (tabular-nums) with narrowSymbol formatting (e.g. ₦, $, €, £). In metric cards, the currency symbol sits in muted text while numbers carry primary text color.

## 4. Component Taxonomy & Button Architecture

### Button Variants
1. Primary (variant="primary"):
   - Use: Main screen/modal triggers (+ Create Invoice, Record Payment, Add Client, Save).
   - Light: bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm.
   - Dark: bg-blue-500 hover:bg-blue-400 text-white font-semibold shadow-sm shadow-blue-500/20.
2. Secondary / Outline (variant="secondary"):
   - Use: Non-destructive actions, navigation, AND accounting adjustments (Edit, Download PDF, Mark as Sent, Void Invoice, Reverse Payment, Cancel).
   - Accounting adjustments (Void/Reverse) are NOT red; they are calm neutral outlines because they preserve audit trails and do not delete rows.
   - Light: bg-white hover:bg-gray-50 text-gray-700 border border-gray-200.
   - Dark: bg-[#121215] hover:bg-[#1c1c21] text-zinc-300 border border-[#27272a].
3. Destructive (variant="destructive"):
   - Use: STRICTLY for permanent, unrecoverable deletions (Delete Draft, Delete Client).
   - Light: bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200.
   - Dark: bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20.
4. Ghost / Icon (variant="ghost"):
   - Use: 3-dot action menus, modal close X, pagination buttons.
   - Light: hover:bg-gray-100 text-gray-500 hover:text-gray-900.
   - Dark: hover:bg-[#1c1c21] text-zinc-400 hover:text-white.

### Standard Dimensions & States
- Heights:
  - md (Default): h-10 px-4 text-sm font-semibold rounded-lg (40px)
  - sm (Compact): h-8 px-2.5 text-xs font-medium rounded-md (32px)
  - icon: h-9 w-9 or h-8 w-8 centered flex
- Mobile Touch Target: On touch viewports, tap target must extend to at least 44px.
- States: Default, Hover, Focus-visible (ring-2 ring-blue-500), Disabled (opacity-50 pointer-events-none), Loading (inline spin loader maintaining fixed dimensions).

### Iconography Standard
- Library: lucide-react. Stroke width: 1.5px to 2px.
- Sizing: 16px (w-4 h-4) in buttons, table menus, and badges; 20px (w-5 h-5) in primary navigation and header actions. Decorative icons are aria-hidden="true".

## 5. Responsive Layout Architecture
- Hybrid Viewport Standard:
  - Desktop (>= 1024px): Dense HTML table with 56px rows, right-aligned monetary amounts, and 3-dot action dropdowns (hidden md:table).
  - Mobile (<= 375px): Responsive stacked cards with thumb-friendly tap targets and zero horizontal scroll (md:hidden).
- Dynamic Drawer Collapse:
  - On /clients, opening the right profile drawer (~450px) dynamically hides secondary desktop table columns (Contact, Last Invoice) to prevent horizontal overflow and horizontal scrollbars.
- Multi-Currency Summary Rules:
  - Single-currency accounts render summary cards directly.
  - Multi-currency accounts provide an inline currency selector (All, USD, EUR, NGN). Selecting a currency updates the 4 metric cards to that specific currency's sums and filters the list below. Never sum totals across different currencies into a single number.
