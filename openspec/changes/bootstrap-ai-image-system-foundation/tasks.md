## 1. Shared Contracts And Scaffolding

- [ ] 1.1 Initialize the pnpm workspace and Turborepo structure for `apps/web`, `apps/ps-uxp`, `packages/core-engine`, `packages/providers`, and `packages/workflows`
- [ ] 1.2 Add shared TypeScript configuration, package manifests, and build scripts for pure package compilation
- [ ] 1.3 Define shared runtime types for `JobRequest`, `JobRecord`, `JobTerminalResult`, `JobError`, `WorkflowSpec`, `StepSpec`, `ProviderResult`, and `AssetDescriptor`
- [ ] 1.4 Encode the shared failure taxonomy and cross-capability invariants in runtime types, docs, or boundary checks so host-specific imports cannot leak into shared packages

## 2. Core Contract Implementation

- [ ] 2.1 Implement the core engine store with explicit job lifecycle states, legal transitions, active-step tracking, and terminal payload capture
- [ ] 2.2 Add ordered lifecycle event publishing for `job:created`, `job:running`, `job:completed`, and `job:failed`, including sequence numbers and diagnostics or evidence payloads
- [ ] 2.3 Implement the declarative sequential workflow runner with immutable step handoff, declared output bindings, and failure short-circuiting
- [ ] 2.4 Implement cleanup semantics that release temporary resources on workflow completion or failure and report cleanup outcomes through diagnostics
- [ ] 2.5 Implement the provider registry contract with named registration, capability discovery, schema validation, unknown-provider handling, and stable `ProviderResult` envelopes
- [ ] 2.6 Define the `AssetIOAdapter` interface and shared binary payload utilities, explicitly including memory-safe chunking for large `ArrayBuffer` to Base64 compatibility conversions while keeping Base64 out of the shared contract

## 3. Host Contract Implementation

- [ ] 3.1 Create initial Web and UXP asset adapter implementations or stubs that satisfy the shared adapter contract and surface structured adapter failures
- [ ] 3.2 Scaffold the React and Vite Web app with the shared runtime wired into browser-safe adapters only
- [ ] 3.3 Build the browser flow for image upload, schema-driven provider parameter editing, local validation, and valid job-request submission
- [ ] 3.4 Render live execution status, terminal inspection state, and completed output previews in the Web UI without conflating preview failures with job failures
- [ ] 3.5 Scaffold the Photoshop UXP plugin, manifest permissions, and React-based panel shell
- [ ] 3.6 Implement active-layer reading via supported Photoshop APIs and memory-safe binary conversion, rejecting no-document, no-layer, multi-selection, or unsupported-layer cases before submission
- [ ] 3.7 Submit jobs from the plugin through the shared runtime, display lifecycle updates in the panel, and surface host-capability failures separately from execution failures
- [ ] 3.8 Write completed results back to the current document as a new non-destructive layer while preserving completed runtime results when Photoshop writeback fails

## 4. Contract Verification And Hardening

- [ ] 4.1 Add contract tests for engine lifecycle transitions, invalid envelope rejection, unknown provider or workflow failure, and terminal payload storage
- [ ] 4.2 Add contract tests for workflow immutability, declared output handoff, failure short-circuiting, and cleanup invocation semantics
- [ ] 4.3 Add contract tests for provider semantic ownership, schema validation boundaries, stable `ProviderResult` envelopes, and structured provider failure handling
- [ ] 4.4 Add contract tests for asset boundaries, including portable binary types, opaque host refs, explicit adapter failures, and memory-safe large-payload conversion behavior
- [ ] 4.5 Add Web host tests for local validation gating, schema-driven form assembly, runtime status rendering, and preview-failure separation
- [ ] 4.6 Add UXP host guard tests for no active document, no active layer, unsupported layer selection, missing permissions, and writeback failure after successful execution
- [ ] 4.7 Add a mock reference provider first, then one real provider and workflow example that can run end to end in both hosts after the shared contract tests pass
- [ ] 4.8 Document setup, host constraints, architecture boundaries, and validation expectations needed for the first implementation milestone
