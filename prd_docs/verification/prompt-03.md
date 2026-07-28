# Prompt 3 Verification — Money Primitives & Derivation Core

## Status: Verified & All Tests Passing

---

## 1. `/codex` and `/review` Checklist Verification

The gstack pre-landing checklist (`c:\Users\i7\Documents\Clario\.agents\skills\gstack\review\checklist.md`) was applied systematically to the newly implemented core files:

### Pass 1 — CRITICAL

* **SQL & Data Safety**:
  * **Finding**: No SQL queries or database accesses are executed in this core module. The calculations layer remains entirely pure-functional.
* **Race Conditions & Concurrency**:
  * **Finding**: No shared states are mutated. The ledger sum logic (`amountPaidMinor`) operates commutatively over signed values, ensuring order-independent execution.
* **LLM Output Trust Boundary**:
  * **Finding**: Not applicable. No LLM integration or prompt parsing exists in the calculations core.
* **Shell Injection**:
  * **Finding**: No shell command or external process execution is called.
* **Enum & Value Completeness**:
  * **Finding**:
    * `derive/invoice.ts` (`paymentStatus`) outputs strictly map to the exact `'paid' | 'partially_paid' | 'unpaid'` types.
    * `derive/invoice.ts` (`displayStatus`) maps `'draft' | 'sent' | 'void'` types to their corresponding display statuses with a fallback returning `'sent'`.

### Pass 2 — INFORMATIONAL

* **Async/Sync Mixing**:
  * **Finding**: Every core function is completely synchronous, preventing event-loop blocks.
* **Column/Field Name Safety**:
  * **Finding**: Type mappings (`LineItem`, `PaymentEvent`, `InvoiceInput`, and `PaymentInput`) match the exact Postgres and SQLite database schema names:
    * `LineItem` aligns with `invoice_line_items` (`unit_price_minor`, `quantity`).
    * `PaymentEvent` aligns with `payment_events` (`amount_minor`, `currency`, `reverses_id`).
    * `InvoiceInput` aligns with `invoices` (`id`, `client_id`, `status`, `currency`, `total_minor`, `due_date`).
* **Dead Code & Consistency**:
  * **Finding**: Exports are clean under ESLint linting and typecheck suites.
* **Completeness Gaps**:
  * **Finding**:
    * `parseMoneyInput` handles all numeric symbols, fraction widths, and decimal structures (`"12"`, `"12.5"`, `".5"`, `"12."`).
    * `formatMoney` dynamically formats currencies, including zero-exponent types like `JPY` and `KRW`.
* **Time Window Safety**:
  * **Finding**: The Target evaluation date (`today`) is explicitly injected as a parameter to keep comparisons timezone-independent.
* **Type Coercion at Boundaries**:
  * **Finding**: Checked double precision conversion issues. Float multiplications in `parseMoneyInput` and `multiplyMinor` scale by `1e10` to strip float binary drift before rounding to integers.

---

## 2. Verbose Unit Test Run Output

```bash
$ npx vitest run --reporter=verbose

 RUN  v3.2.7 C:/Users/i7/Documents/Clario

 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 1: formatMoney correctness 140ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 2: parseMoneyInput precision 1ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 3: multiplyMinor rounding 0ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 4: Currency mismatch throws 3ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 5: Partially paid calculations 1ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 6: Fully paid status 0ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 7: Overpayment calculations 0ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 8: Payment and reversal 0ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 9: Shuffled order ledger sums commutativity 1ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 10: Overdue cases matrix 1ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 11: Paid and past-due displayStatus precedence 0ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 12: Aggregate currency segregation 1ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 13: Earnings date filtering and reversals subtraction 0ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 14: sortCurrencyTotals sorting order 2ms
 ✓ tests/money_and_derivations.test.ts > Money and Derivations Core > Criterion 15: suggestNextInvoiceNumber formats and increments 1ms
 ✓ tests/schema_and_rls.test.ts > Clario Database Schema & RLS Security Suite > Criterion 2: Migration applies cleanly to a fresh database instance 7ms
 ✓ tests/schema_and_rls.test.ts > Clario Database Schema & RLS Security Suite > Criterion 3: Querying information_schema.columns shows every *_minor column as bigint, and zero money columns as numeric/real/double precision 16ms
 ✓ tests/schema_and_rls.test.ts > Clario Database Schema & RLS Security Suite > Criterion 4: payment_events has no updated_at and no deleted_at column 6ms
 ✓ tests/schema_and_rls.test.ts > Clario Database Schema & RLS Security Suite > Criterion 5: As an authenticated test user, inserting a payment_events row succeeds, while updating and deleting both fail or affect zero rows 25ms
 ✓ tests/schema_and_rls.test.ts > Clario Database Schema & RLS Security Suite > Criterion 6: User A cannot select, update, or delete any of User B's clients or invoices 15ms
 ✓ tests/schema_and_rls.test.ts > Clario Database Schema & RLS Security Suite > Criterion 7: Two invoices for the same user can share an invoice_number without a database error 4ms
 ✓ tests/schema_and_rls.test.ts > Clario Database Schema & RLS Security Suite > Criterion 8: The status CHECK rejects 'paid' and 'overdue' 7ms
 ✓ tests/schema_and_rls.test.ts > Clario Database Schema & RLS Security Suite > Cascade restricts: attempting to DELETE an invoice with payment events must FAIL 12ms
 ✓ tests/schema_and_rls.test.ts > Clario Database Schema & RLS Security Suite > Trigger profiles creation: auth.users insert creates profiles row with default_currency = 'USD' 3ms

 Test Files  2 passed (2)
      Tests  24 passed (24)
   Start at  01:32:57
   Duration  3.96s
```

---

## 3. Purity Grep Confirmation

Command:
```bash
git grep -n -e "from 'react'" -e "@powersync" -e "supabase" -- src/lib/money src/lib/derive
```

**Output:**
*(Empty – Command exited with code `1`, indicating 0 occurrences and complete framework/library encapsulation)*

---

## 4. Currency List Export (`src/lib/money/index.ts`)

```typescript
export const CURRENCIES: Record<string, CurrencyInfo> = {
  NGN: { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', exponent: 2 },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', exponent: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', exponent: 2 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', exponent: 2 },
  KES: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', exponent: 2 },
  GHS: { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi', exponent: 2 },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand', exponent: 2 },
  CAD: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', exponent: 2 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', exponent: 2 },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', exponent: 2 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', exponent: 0 },
  KRW: { code: 'KRW', symbol: '₩', name: 'South Korean Won', exponent: 0 }
};
```

---

## 5. Specification Deviations

1. **`deriveInvoice` helper function**:
   * *Reasoning*: Handled the composition of line item counts, balances due, overdue markers, and display strings inside a unified mapper to streamline data layer mappings.
2. **`KRW` Currency Integration**:
   * *Reasoning*: Configured South Korean Won as an additional zero-decimal currency to thoroughly verify that precision calculations scale and format correctly across multiple zero-decimal configurations.
