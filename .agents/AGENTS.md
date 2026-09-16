# Clario Coding Guidelines & Process Safety

## 1. Commits and Review Gate
* **No Premature Commits**: Never run `git add` or `git commit` on code changes, verification files, `PROJECT_STATE.md`, or `DECISIONS.md` until the user has reviewed the implementation plan, approved the changes, and explicitly given permission to commit.
* **Gated Verification Reports**: Verification logs (`prd_docs/verification/prompt-XX.md`) and project state logs (`prd_docs/PROJECT_STATE.md`) must only be written and committed after the manual QA results are fully aligned and confirmed.

## 2. QA Verification Honesty
* **No Fabricated "Observed" Behavior**: If a test or behavior has not been manually verified in a real browser by the agent (e.g., due to Chromium subagent timeouts) or confirmed firsthand, it must be explicitly labeled as "Not yet verified — expected based on code/unit tests" rather than "Observed: Succeeds".

## 3. Pre-Landing Checklist Pass
* **Mandatory /review Checklist**: Always execute the review checklist category-by-category (SQL & Data Safety, Race Conditions, LLM Output Trust Boundary, Shell Injection, Enum & Value Completeness, Async/Sync Mixing, Column/Field Name Safety, Dead Code, Completeness Gaps, Time Window Safety, Type Coercion) and report explicit findings or "no issues found" before wrapping up.

## Offline Dynamic Route Architecture Pattern
When creating or maintaining dynamic routes (e.g., `/app/[entity]/[id]/**`):
1. **Static Shell Generation:** Every dynamic route must implement `generateStaticParams()` returning `[{ id: '_shell_' }]` in its `page.tsx` so Next.js pre-renders a static HTML shell template at build time.
2. **Precache Shell Registration:** Register every newly created dynamic shell path (e.g., `/invoices/_shell_`, `/clients/_shell_/invoices/new`) in `CORE_ROUTES` within `scripts/sw-template.js`.
3. **Parameter Resolution:** Never read `useParams().id` directly inside client components. Always wrap the parameter using `resolveRouteParam(params?.id, 'segment')` from `src/lib/navigation.ts` to extract the real UUID from `window.location.pathname` when running inside a static `_shell_` template.
4. **Repository Query Sanitization:** Every repository method querying by ID must sanitize input strings (`cleanId = (id || '').trim().split('?')[0].split('#')[0]`). If `cleanId` is empty or equal to `'_shell_'`, avoid querying SQLite and return `null` or an empty live query immediately.
5. **Readiness & Loading Guards:** Never evaluate `isNotFound = true` while an entity ID is `'_shell_'`, undefined, or while background SQLite queries are still resolving. `isNotFound` may only trigger after the local database query deterministically confirms 0 matching records.
