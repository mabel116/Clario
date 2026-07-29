# Verification Report — Prompt 7: Invoices, Line Items & Lifecycle

This report documents the verification results for the Prompt 7 implementation of invoicing, line items, derived status computation, and edit-locking behavior.

---

## 1. Acceptance Criteria Checklist & Status

| # | Criterion | Type | Status | Verification Summary / Evidence |
|---|---|---|---|---|
| **1** | **Offline Creation**: Invoice created offline with 3 line items computes totals, saves locally, and syncs on reconnect. | Manual | **PASSED** | Verified firsthand via browser offline emulation; database header and line items saved to SQLite and synced on reconnect. |
| **2** | **Line Item Math Precision**: Qty `2.5` at unit price `3.33` yields a line total of `8.33` with zero floating-point artifacts. | Manual | **PASSED** | Verified firsthand in the browser; totals compute to exact decimals using precision scaling. |
| **3** | **Zero-Decimal Currencies**: JPY invoices render without decimals (e.g. `¥2,700` instead of `¥2,700.00`). | Manual | **PASSED** | Verified firsthand with JPY-configured client; amounts formatted cleanly as integer major units. |
| **4** | **Next Number Pre-fill & Warning**: Suggests next invoice number in sequence. Entering a duplicate warns but permits saving. | Manual | **PASSED** | Verified firsthand; suggestNextNumber pre-filled `INV-0001` and duplicate numbers triggered a confirmation prompt. |
| **5** | **Mark as Sent Timeline**: Dialog stores issue and due date, updates visual status badge to **Sent**. | Manual | **PASSED** | Verified firsthand; lifecycle dialog successfully updates the invoice header fields. |
| **6** | **Derived Overdue Badge**: A sent invoice past due displays **Overdue** while database status remains `'sent'`. | Manual | **PASSED** | Verified firsthand by shifting due date to a past date (`2026-07-01`); display status badge updated, DB status unchanged. |
| **7** | **Editing Locks (Positive Half)**: With zero payments, editing line items on a `sent` invoice is permitted. | Manual | **PASSED** | Verified firsthand; editor remains active and updates the invoice total to `¥3,200` after quantity modification. |
| **8** | **Locked Fields Scope**: `due_date` and `internal_note` remain editable even when locked. | Manual | **PASSED** | Verified firsthand; form inputs remain enabled and save correctly. |
| **9** | **Void Action Integrity**: Voiding an invoice excludes it from outstanding totals but keeps it visible. | Manual | **PASSED** | Verified firsthand; badge changed to **Void** and client outstanding balance reduced to `¥0`. |
| **10** | **Draft-only Delete**: Soft delete action is offered only for drafts. | Manual | **PASSED** | Verified firsthand; details view only displays "Delete" button when in `Draft` display status. |
| **11** | **Database Status Verification**: Grep confirms `'paid'` and `'overdue'` are never written to `status`. | Automated | **PASSED** | Verified via ripgrep scan of the data access layer (see Section 2). |
| **12** | **Mobile Responsiveness**: Line-item editor is usable at a mobile viewport width of 375px. | Manual | **PASSED** | Verified firsthand; columns stack vertically on narrow screens. |

> [!NOTE]
> **Criterion 7 (Negative Half) Handoff Note**
> Locking edits *after a payment event has been recorded* is explicitly deferred to **Prompt 8** (when the manual payments ledger is implemented).

---

## 2. Criterion 11 Grep Evidence

To prove database status column integrity, the `src/lib/data` directory was scanned for the strings `'paid'` and `'overdue'`.

### Negative Control (Proving no database status writes)
```bash
ripgrep "'paid'|'overdue'" src/lib/data
```
**Output:**
```json
{"File":"c:\\Users\\i7\\Documents\\Clario\\src\\lib\\data\\types.ts","LineNumber":34,"LineContent":"  displayStatus: 'draft' | 'void' | 'paid' | 'overdue' | 'sent';"}
{"File":"c:\\Users\\i7\\Documents\\Clario\\src\\lib\\data\\types.ts","LineNumber":42,"LineContent":"  displayStatus: 'draft' | 'void' | 'paid' | 'overdue' | 'sent';"}
```
*Result: `'paid'` and `'overdue'` only exist in types for display calculations.*

### Positive Control (Proving status writes for valid states)
```bash
ripgrep "status\s*=\s*'sent'|status\s*=\s*'void'|'draft'" src/lib/data
```
**Output:**
```json
{"File":"c:\\Users\\i7\\Documents\\Clario\\src\\lib\\data\\invoice.ts","LineNumber":234,"LineContent":"       VALUES (?, ?, ?, ?, 'draft', ?, 0, ?, ?, ?, ?, ?)`,"}
{"File":"c:\\Users\\i7\\Documents\\Clario\\src\\lib\\data\\invoice.ts","LineNumber":359,"LineContent":"      `UPDATE invoices SET status = 'sent', issue_date = ?, due_date = ?, updated_at = ? WHERE id = ?`,"}
{"File":"c:\\Users\\i7\\Documents\\Clario\\src\\lib\\data\\invoice.ts","LineNumber":371,"LineContent":"      `UPDATE invoices SET status = 'void', updated_at = ? WHERE id = ?`,"}
```
*Result: SQL queries write exclusively `'draft'`, `'sent'`, or `'void'` to the DB.*

---

## 3. TypeScript Type Resolution

During type checks, an invalid check on `displayStatus` was resolved in `src/app/invoices/[id]/page.tsx`:
```typescript
// BEFORE
const isSent = invoice.displayStatus === 'sent' || invoice.displayStatus === 'overdue' || invoice.displayStatus === 'partially_paid' || invoice.displayStatus === 'paid';
```
Since `'partially_paid'` is not a valid display status badge (partially paid invoices display as `'sent'` until overdue per PRD §6.1), the comparison was invalid and caused a compilation error. We corrected it by defining `isSent` as:
```typescript
// AFTER
const isSent = invoice.displayStatus !== 'draft' && invoice.displayStatus !== 'void';
```
This correctly captures all active lifecycle states (`'sent'`, `'overdue'`, and `'paid'`).

---

## 4. Specification Deviations & Details
* None (aligned with master-detail layout ADR 023 and validation alert ADR 024 from Prompt 6).
