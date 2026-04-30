## 1. Update provider-edit workflow definition

- [x] 1.1 Add `providerProfileId: '${providerProfileId}'` and `profileId: '${profileId}'` to `provider-edit` step input in `packages/workflows/src/builtins/provider-edit.ts`
- [x] 1.2 Update JSDoc contract comment for `providerEditWorkflow` to document the new `providerProfileId` and `profileId` fields

## 2. Update test fixtures

- [x] 2.1 Update `generateValidEditInput` JSDoc in `packages/workflows/tests/fixtures.ts` to document that `overrides` can include `providerOptions` for future model selection support (no workflow step binding change — `provider-edit` step does not bind `providerOptions` per design decision 2)

## 3. Add integration tests for edit + profile dispatch

- [x] 3.1 Add `dispatches provider-edit through provider profile resolution` test in `packages/shared-commands/tests/commands.test.ts`
- [x] 3.2 Add `dispatches provider-edit with only profileId (auto-routes to profile adapter)` test
- [x] 3.3 Add `prefers explicit providerProfileId over profileId for provider-edit` test

## 4. QA

- [x] 4.1 Run `pnpm test` to verify all existing tests pass (155+) — 164 tests passed (core-engine: 35, providers: 43, workflows: 23, shared-commands: 63). @imagen-ps/app build failure is pre-existing (DOM lib config), unrelated to this change.
- [x] 4.2 Verify new edit profile dispatch tests pass — 3 new tests in shared-commands/commands.test.ts all pass (dispatches provider-edit through provider profile resolution, dispatches provider-edit with only profileId, prefers explicit providerProfileId over profileId for provider-edit)
- [x] 4.3 Run smoke test: `imagen job submit provider-edit '{"profileId":"mock-dev","prompt":"change to blue","inputAssets":[{"type":"image","name":"test.png","url":"https://example.com/test.png","mimeType":"image/png"}]}'` — Job completed with status "completed", auto-injected provider: "profile" ✓
