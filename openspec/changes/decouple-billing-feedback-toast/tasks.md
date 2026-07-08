## 1. Shared Trigger Boundary

- [ ] 1.1 Audit current terminal billing follow-up in `submit-job` and `retry-job`, then extract one shared application entry that preserves existing billing side-effect semantics.
- [ ] 1.2 Define shared trigger input needed for billing feedback orchestration, including provider-reported cost presence and fallback eligibility.

## 2. Toast Feedback Flow

- [ ] 2.1 Refactor app-side billing observation logic into a toast-oriented module or hook, removing round footer coupling from this change path.
- [ ] 2.2 Implement immediate billing toast behavior for terminal results that already include provider or bridge cost fields, covering both success and failure outcomes.
- [ ] 2.3 Implement asynchronous profile billing refresh fallback that starts only when explicit cost is absent and suppresses itself once a primary toast has already been shown.
- [ ] 2.4 Ensure fallback timeout, refresh failure, and delta mismatch exit silently without UI error prompts or task-state mutation.

## 3. Verification

- [ ] 3.1 Add or update application tests for shared submit/retry billing follow-up orchestration.
- [ ] 3.2 Add or update app-surface tests for immediate toast, async fallback toast, duplicate suppression, and silent fallback failure.
- [ ] 3.3 Run targeted validation for touched `packages/application` and `apps/app` boundaries, then confirm OpenSpec change remains apply-ready.
