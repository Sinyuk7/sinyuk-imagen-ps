## Why

The project needs a clear execution contract before implementation begins because it spans multiple hosts, provider backends, and asset boundaries. Defining the foundation now reduces architectural drift, keeps the engine host-agnostic, and gives implementation work a stable set of behaviors to build against.

## What Changes

- Introduce a deterministic job execution engine that manages job lifecycle, state transitions, and event emission without depending on host APIs.
- Define a sequential workflow runtime that executes immutable step inputs, isolates step state, and passes only explicit outputs between steps.
- Add an extensible provider registry contract with runtime schema validation and provider-owned parameter semantics.
- Add a host-facing asset IO adapter contract for binary reads and writes that works across Web and Photoshop UXP environments.
- Define Web application requirements for job submission, parameter configuration, execution visibility, and rendered outputs.
- Define Photoshop UXP host requirements for reading the active layer, converting host data into engine input, submitting jobs, and writing results back as new layers.
- Establish monorepo impact across `apps/web`, `apps/ps-uxp`, `packages/core-engine`, `packages/providers`, and `packages/workflows`.

## Capabilities

### New Capabilities
- `job-execution-engine`: Deterministic runtime for job lifecycle management, execution state, and event delivery.
- `workflow-runtime`: Sequential workflow execution model for provider, transform, and IO steps.
- `provider-registry`: Extensible provider contract with validation, invocation, and optional input or output transforms.
- `asset-io-adapters`: Host-agnostic binary asset read and write interfaces for Web and UXP integration.
- `web-job-console`: Browser-based job submission flow for image upload, parameter editing, status tracking, and result rendering.
- `photoshop-uxp-integration`: UXP plugin flow for reading active Photoshop content, invoking jobs, and writing generated results back to the document.

### Modified Capabilities

None.

## Impact

- Creates new specs for the core engine, workflow runtime, provider layer, asset boundary, and both host applications.
- Guides initial implementation in `packages/core-engine`, `packages/providers`, `packages/workflows`, `apps/web`, and `apps/ps-uxp`.
- Introduces runtime dependencies and patterns centered on TypeScript, Zod, mitt, Zustand vanilla, React, and host-specific adapter implementations.
