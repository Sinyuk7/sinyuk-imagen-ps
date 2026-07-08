## 1. Unified text-input seam

- [x] 1.1 Introduce a popup-aware single-line text-input implementation that registers with `popup-layer` and preserves the public `TextField` API.
- [x] 1.2 Move raw native single-line editor details behind a private seam so shared UI callsites cannot import an unsafe path directly.
- [x] 1.3 Align shared multi-line and single-line text input ownership/comments so both are clearly part of one UXP-safe seam family.

## 2. Shared UI migration

- [x] 2.1 Audit shared UI `TextField` callsites and update any assumptions needed for the new safe-by-default seam (stable ids, popup overlap expectations, tests).
- [x] 2.2 Verify provider profile add/detail billing and related settings surfaces use the unified seam without feature-level workaround code.
- [x] 2.3 Update any remaining high-risk shared settings inputs that would still rely on the old raw single-line behavior.

## 3. Guardrails and regression coverage

- [x] 3.1 Expand the popup overlap harness to demonstrate suspension/resume behavior for both single-line and multi-line shared text inputs.
- [x] 3.2 Tighten mechanical policy checks so raw native text editors are only allowed inside the approved seam and unsafe imports fail CI.
- [x] 3.3 Add or update targeted tests for the upgraded text-input seam and the new policy expectations.

## 4. Writeback and verification

- [x] 4.1 Update the canonical engineering/testing docs with the approved shared text-input contract and guardrail rationale.
- [x] 4.2 Run targeted shared UI tests/harness checks plus `pnpm check:policy` to verify the seam, guardrails, and overlap coverage.
