# Clario Coding Guidelines & Process Safety

## 1. Commits and Review Gate
* **No Premature Commits**: Never run `git add` or `git commit` on code changes, verification files, `PROJECT_STATE.md`, or `DECISIONS.md` until the user has reviewed the implementation plan, approved the changes, and explicitly given permission to commit.
* **Gated Verification Reports**: Verification logs (`prd_docs/verification/prompt-XX.md`) and project state logs (`prd_docs/PROJECT_STATE.md`) must only be written and committed after the manual QA results are fully aligned and confirmed.

## 2. QA Verification Honesty
* **No Fabricated "Observed" Behavior**: If a test or behavior has not been manually verified in a real browser by the agent (e.g., due to Chromium subagent timeouts) or confirmed firsthand, it must be explicitly labeled as "Not yet verified — expected based on code/unit tests" rather than "Observed: Succeeds".

## 3. Pre-Landing Checklist Pass
* **Mandatory /review Checklist**: Always execute the review checklist category-by-category (SQL & Data Safety, Race Conditions, LLM Output Trust Boundary, Shell Injection, Enum & Value Completeness, Async/Sync Mixing, Column/Field Name Safety, Dead Code, Completeness Gaps, Time Window Safety, Type Coercion) and report explicit findings or "no issues found" before wrapping up.
