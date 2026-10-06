# States, offline behavior and feedback

Contents: 1. The rendering ladder - 2. Skeletons and layout stability - 3. Empty states - 4. Errors and not-found - 5. Offline and sync honesty - 6. Snapshots - 7. Writes and success feedback - 8. Confirmations - 9. Toasts

Clario reads from a local database on the device, so most data is available in milliseconds and offline is a normal condition, not an error. The UI's job is to be instant when it can be and truthful when it cannot.

## 1. The rendering ladder

Every data screen resolves in this order, and each rung is a different design:

1. **Skeleton**: data is not yet confirmed. Only shown if it lasts longer than 75ms (see below).
2. **Onboarding empty**: the account (or this domain) has no records at all. A positive invitation.
3. **Live list**: records exist.
4. **Filtered empty**: records exist, but the search or filters match nothing. Different copy, different action (clear filters).
5. **Error**: something failed and there is something to do about it.

Rules that keep this ladder from breaking:

- **Emptiness is decided per domain.** Clients empty is not the same as invoices empty. Use the domain's own emptiness check from the existing data layer. A shared "account is empty" flag applied to the wrong screen causes a skeleton that never ends.
- **A skeleton must be able to end.** Every path out of loading must be covered: data present, confirmed empty, entity not found, error. If you add a loading branch, add its exit in the same change.
- **Reuse Clario's existing data and readiness handling** for lists and single records (find how the repo already resolves "loading versus ready versus empty versus not found") and avoid building a parallel loading flag from scratch. Do not tie readiness to network sync status.
- **Errors do not masquerade as empty.** If a read fails, show the error state, not "no invoices".

## 2. Skeletons and layout stability

- **Defer the skeleton by 75ms.** Local reads often finish in under 30ms; a skeleton that appears for one frame reads as a flicker. Render nothing (reserved space) for the first 75ms, then the skeleton only if still loading.
- **Reserve the final dimensions.** Skeleton rows are the same height as real rows (56px on desktop), metric cards the same size, drawers the same width. There should be zero layout shift when data arrives. Tabular figures also keep numbers from changing width as they resolve.
- **Money is never a placeholder zero.** Before data is known, a metric card shows a skeleton bar in the figure's position, not `$0.00`. A wrong zero is a lie about someone's finances.
- **Skeleton style:** flat neutral blocks in the nested surface color. A gentle pulse is acceptable; a sweeping shimmer is not necessary. Both stop under `prefers-reduced-motion`.
- Buttons in a loading state keep their exact dimensions and show an inline spinner beside or in place of the label.

## 3. Empty states

An empty state is an invitation with one clear action, never a wall of zeros or an apology. Structure: small neutral icon, one plain heading, one line of what will appear here, one primary button.

| Screen | Heading | Line | Action |
|---|---|---|---|
| Clients | Add your first client | Clients you invoice will show up here with what they owe. | Add client |
| Invoices | Create your first invoice | Track what's sent, what's paid and what's still due. | Create invoice |
| Payments | No payments recorded yet | Payments appear here once you record them against an invoice. | Record payment |
| Filtered empty | No invoices match these filters | Try a different status, currency or date range. | Clear filters |

Rules: the dashboard for a new account shows the invitation, not four cards of `$0`. Empty states inside drawers and tabs (a client with no payments yet) are a single quiet line of muted text, not a full illustration.

## 4. Errors and not-found

- Say what happened and what to do, in the product's voice, without apology or blame: `Couldn't save this payment. Check the amount and try again.` Not: `Oops! Something went wrong.`
- Field errors sit under the field. Page-level failures use an inline alert in the content area, not a toast.
- **Not found** (an invoice or client that does not exist, or is not on this device yet) is its own screen: heading, one line, a link back to the list. It must not be shown while the record is still loading; Clario's existing readiness handling decides which one applies.
- Use an error boundary per screen region so one failing panel does not blank the page.

## 5. Offline and sync honesty

Clario works offline by design, so offline is never a modal, never a blocker and never red.

- **A quiet sync indicator in the shell** with four states and text labels (not just an icon):
  - `Synced` (neutral, may be hidden or very muted when everything is up to date)
  - `Saving on this device...` (transient)
  - `Offline - changes are saved on this device and will sync when you're back online` (neutral tone, shown in full only when offline)
  - `Sync needs attention` (amber, links to a plain explanation) for a problem the person must act on
- Announce changes with a polite live region (`aria-live="polite"`), not an alert.
- **Actions that work locally are never disabled offline.** Creating invoices, recording payments and editing clients all work. Only features that truly need a network (for example sending an email reminder) are disabled or queued, and the reason is stated inline: `Reminders send when you're back online.`
- Never say "saved to the cloud" or "server". Say "saved" or "saved on this device", and "synced" only for sync.
- Rose is reserved for money states and destructive actions. Do not use it for connectivity.

## 6. Snapshots

Some screens (the dashboard) may render a cached snapshot instantly and swap to live data when queries finish.

- Show a muted badge with a clock icon: `Showing snapshot from 4 min ago` (absolute time in a tooltip). It disappears when live data arrives.
- The swap is silent: no flash, no fade, no reflow, no count-up. If a number changes, it just changes.
- A snapshot is keyed to the account, period and currency selection shown; never display a snapshot for a different selection than the one on screen.

## 7. Writes and success feedback

- Writes go to the local database first and are real immediately, so feedback is immediate. Do not add artificial delays or "syncing to server" spinners to a save.
- After a successful action: close the modal or sheet, return focus to a sensible place (the trigger or the new row), show one toast, and update the list in place. A newly created or changed row may get a single soft highlight (background fades from the nested-surface color to none over about 1.2s). This is motion that answers an action and is allowed; it is the only decorative motion in the lists.
- The action name is constant end to end: button `Record payment` produces toast `Payment recorded`. Button `Add client` produces `Client added`.
- Because the ledger is append-only there is no "Undo" toast for payments. The remedy is `Reverse payment`.
- Double-submit protection: the submit button enters its loading state immediately and ignores further clicks.

## 8. Confirmations

Ask only when the action is destructive or changes accounting.

- **Delete (draft, client):** destructive-style confirm. State exactly what disappears and what does not: `Delete Rayna Brett? Her 3 invoices and 5 payments stay in your history under Deleted clients.` Only claim what the product actually does; check the code or PRD for the real behavior before writing this copy.
- **Void invoice, Reverse payment:** neutral secondary-style confirm that explains the consequence and reassures on history: `Reverse this $1,200.00 payment? A reversal entry is added to the ledger. The original payment stays in your history.` Primary button label repeats the verb (`Reverse payment`), never `OK` or `Yes`.
- Confirm dialogs use the same focus-trap and Esc behavior as modals. Cancel is the default-focused button for destructive confirms.
- Never confirm routine saves.

## 9. Toasts

One toast at a time, replacing the previous. Bottom-right on desktop; bottom-center on mobile, above the safe area and never covering a primary button. Auto-dismiss after about 4 seconds, pause on hover and focus, dismissible with Esc, announced politely. Plain sentence, no exclamation marks. Errors that need action use inline alerts, not toasts.
