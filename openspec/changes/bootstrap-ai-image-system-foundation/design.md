## Context

This change establishes the first implementation contract for a TypeScript-first AI image system that must run across standard Web and constrained Photoshop UXP hosts. The system needs a shared execution model for jobs, workflows, providers, and binary asset movement while keeping host-specific APIs outside the core runtime.

The repository currently has OpenSpec initialized but no existing capabilities or implementation scaffolding. The PRD sets firm product constraints: the engine must be deterministic, provider semantics must remain provider-owned, UXP limitations must be respected, and v1 should avoid cross-provider parameter unification or visual workflow editing.

## Goals / Non-Goals

**Goals:**
- Define package and host boundaries that keep core execution code portable across Web and UXP.
- Standardize lifecycle, workflow, provider, and binary IO behaviors so implementation can proceed against stable requirements.
- Enable the first end-to-end user flows for browser job submission and Photoshop active-layer processing.
- Make observability a built-in part of execution through state transitions, event emission, and error visibility.

**Non-Goals:**
- Designing a generalized DAG execution engine.
- Unifying provider parameter models into a shared schema.
- Building a visual workflow editor or agent runtime orchestration system.
- Solving long-term persistence, distributed execution, or background job recovery in this foundation change.

## Decisions

### Decision: Split the system into engine, workflow, provider, asset, and host integration layers

The implementation will be organized around `packages/core-engine`, `packages/workflows`, `packages/providers`, and host apps in `apps/web` and `apps/ps-uxp`. This keeps execution logic testable in pure TypeScript while allowing each host to own UI and native API calls.

Alternatives considered:
- Put all logic in each host app. Rejected because it duplicates behavior and breaks host-agnostic guarantees.
- Create one large shared package. Rejected because it weakens boundaries between runtime, adapters, and UI integrations.

### Decision: Model execution as deterministic, sequential workflows

The runtime will execute `Job -> Workflow -> Steps` in order, passing only explicit outputs to the next step. Step inputs will be treated as immutable values, and each step will complete or fail before the next step begins.

Decision consequences:
- Progress is step-based in v1, not stream-token or sub-step granular.
- Retries remain outside the shared workflow contract until provider-specific retry rules are defined.
- Partial outputs are only observable when a step explicitly persists or returns them as declared outputs.
- Resource locks and temporary assets must be released at step boundaries through explicit cleanup semantics.

Alternatives considered:
- Parallel step execution. Rejected because the PRD emphasizes determinism and does not require DAG semantics in v1.
- Hidden shared context between steps. Rejected because it increases coupling and makes failures harder to reason about.

### Decision: Keep provider parameters opaque to the engine

Providers will own their input semantics through a Zod schema plus `invoke`, with optional `transformInput` and `transformOutput` hooks. The engine will validate through the provider contract but will not reinterpret or normalize provider-specific parameters.

Alternatives considered:
- A unified engine-owned prompt and parameter schema. Rejected because v1 explicitly excludes cross-provider parameter normalization.
- Provider logic embedded inside workflows. Rejected because it would make provider replacement and testing harder.

### Decision: Treat binary assets as a shared contract behind host-owned adapters

Binary payload exchange will use `ArrayBuffer | Uint8Array`, and all file or host document access will flow through `AssetIOAdapter` implementations. The engine and workflows may depend on adapter interfaces, but not on DOM, Node.js, or UXP filesystem APIs.

Alternatives considered:
- Let hosts pass raw `File`, `Blob`, or Photoshop document objects through the engine. Rejected because those types are host-specific and break portability.
- Centralize file IO in the engine. Rejected because filesystem capabilities differ too much between Web and UXP.

### Decision: Use an in-memory execution state store plus an event bus

The core engine will keep runtime state in `zustand/vanilla` and publish lifecycle events through `mitt`. Hosts will subscribe to events and poll or derive status from the store, rather than embedding UI-specific state concerns into the engine.

Decision consequences:
- The engine store owns the canonical current snapshot for each job.
- Events are transient notifications, not replayable history, so hosts must read the store for authoritative current state.
- Reload persistence is deferred and must not be implied by the event bus contract.

Alternatives considered:
- React state in the engine. Rejected because the engine must remain usable outside React.
- Event-only execution without a state store. Rejected because hosts still need a reliable current snapshot for status displays and error inspection.

### Decision: Build host integrations as thin adapters over the shared runtime

The Web app will handle uploads, parameter editing, submission, and result presentation, while the UXP app will read the active layer, marshal binary data, request permissions, and write output as a new layer. Both hosts will use the same engine, workflow, provider, and asset contracts.

Alternatives considered:
- Maintain separate workflow implementations for Web and UXP. Rejected because it creates product drift and multiplies testing cost.
- Push all host logic into shared packages. Rejected because UXP and browser APIs require explicit host-specific handling.

### Decision: Stabilize contracts with a mock provider before shipping a real provider

The first provider milestone will land a mock provider to prove the shared contracts, followed by one real provider integration after contract tests pass.

Alternatives considered:
- Start with a real provider only. Rejected because provider quirks would distort foundational contracts before the shared boundaries are proven.

### Decision: V1 execution is fail-or-complete, not cancellable

V1 jobs terminate only as `completed` or `failed`. Explicit cancellation APIs, cooperative cancellation hooks, and cancel-specific UX are deferred until after the initial foundation is stable.

Alternatives considered:
- Add cancellation in the first milestone. Rejected because it expands lifecycle, provider interruption, and host UX contracts before the base execution model is proven.

### Decision: Keep history in memory and standardize only minimal preview metadata

V1 job history is transient and lost on host reload. Shared preview metadata is limited to `mimeType`, `byteLength`, optional `width`, optional `height`, and optional `thumbnailRef`.

Alternatives considered:
- Persist history in the foundation change. Rejected because persistence semantics differ across hosts and would broaden the initial contract.
- Standardize rich preview metadata across providers. Rejected because it would force premature output normalization.

## Shared Contract Baseline

The change will treat the following as canonical shared types for downstream implementation:

- `JobRequest`: host-submitted request with `providerId`, `workflowId` or `workflowSpec`, opaque input payload, asset references, and optional metadata.
- `JobRecord`: engine-owned record with `jobId`, `status`, timestamps, active step identifier, monotonic event sequence, request snapshot, terminal result, and terminal error.
- `JobTerminalResult`: completed-state envelope containing declared workflow output, output assets, and diagnostics.
- `JobError`: structured failure envelope with `code`, `category`, `message`, optional details, and evidence.
- `JobEventPayload`: emitted lifecycle payload containing job identity, state, timestamp, sequence, active step identifier, and diagnostics or evidence.
- `WorkflowSpec`: serializable declarative workflow definition with ordered `StepSpec[]` and optional metadata.
- `StepSpec`: declarative step definition with stable `id`, `kind`, declared input binding, declared output key, and optional cleanup policy.
- `ProviderDefinition`: registered provider contract with schema validation, declared capabilities, invoke behavior, and optional boundary transforms.
- `AssetDescriptor`: shared asset result envelope with host-owned reference plus minimal standardized metadata.

## Failure Taxonomy

The shared runtime and host integrations will distinguish at least these machine-readable failure categories:

- `configuration_error`
- `validation_error`
- `workflow_definition_error`
- `provider_error`
- `asset_io_error`
- `host_capability_error`
- `cancellation_error` reserved for future lifecycle expansion

## Cross-Capability Invariants

- Shared packages MUST NOT import host-native APIs.
- Workflow definitions MUST remain serializable and declarative.
- Provider invocation MUST NOT mutate original validated input.
- All terminal states MUST carry inspectable result or error payloads.
- Host-visible failures MUST be structured and machine-readable.
- Workflow outputs crossing shared package boundaries MUST remain clone-safe and serializable.
- Base64 MAY be used inside adapters as a compatibility transport, but MUST NOT become the shared runtime asset contract.

## Risks / Trade-offs

- [Scope spread across six capabilities] -> Keep the foundation focused on core contracts and first user flows, not advanced editing or persistence.
- [UXP runtime limitations may invalidate Web-first assumptions] -> Keep every host API behind adapters and validate binary-only boundaries early.
- [UXP string allocation limits can trigger host instability] -> Require memory-safe chunking or safe-yield conversion behavior at adapter boundaries for large payloads.
- [Provider variability may leak into the engine] -> Enforce provider-owned schemas and avoid normalized engine parameters in v1.
- [In-memory execution state limits recovery after reload] -> Accept this for the foundation and document persistence as future work.
- [Sequential execution may constrain future throughput] -> Preserve clear step contracts now so parallel or DAG execution can be added later without breaking host boundaries.

## Migration Plan

1. Bootstrap the monorepo structure and package boundaries required by the new capabilities.
2. Implement core engine primitives, workflow execution, provider registration, and asset adapter interfaces behind unit-tested TypeScript packages.
3. Land contract tests for shared runtime boundaries before adding the first real provider integration.
4. Add the first Web and UXP host integrations that exercise the shared runtime end to end.
5. Validate example flows for browser upload-to-result and Photoshop active-layer-to-new-layer execution.
6. Roll back by disabling host entry points while preserving package interfaces if one host integration proves unstable.

## Resolved For V1

- Reference-provider path is `mock provider first -> one real provider second`.
- Explicit cancellation is out of scope; v1 jobs terminate only as `completed` or `failed`.
- Job history remains in memory only and does not survive host reloads in this change.
- Shared preview metadata is intentionally minimal and does not attempt cross-provider rich normalization.
