## 1. Workspace Foundation

- [ ] 1.1 Initialize the pnpm workspace and Turborepo structure for `apps/web`, `apps/ps-uxp`, `packages/core-engine`, `packages/providers`, and `packages/workflows`
- [ ] 1.2 Add shared TypeScript configuration, package manifests, and build scripts for pure package compilation
- [ ] 1.3 Define shared runtime types for jobs, workflow specs, step specs, binary payloads, and host adapter contracts

## 2. Core Execution Runtime

- [ ] 2.1 Implement the core engine store with explicit job lifecycle states and terminal error capture
- [ ] 2.2 Add lifecycle event publishing for `job:created`, `job:running`, `job:completed`, and `job:failed`
- [ ] 2.3 Implement the sequential workflow runner with immutable step handoff and failure short-circuiting
- [ ] 2.4 Add unit tests for successful execution, validation failure, step failure, and resource cleanup behavior

## 3. Providers And Asset Adapters

- [ ] 3.1 Implement the provider registry contract with named registration, lookup, and unknown-provider failure handling
- [ ] 3.2 Add Zod-backed provider validation plus optional `transformInput` and `transformOutput` hooks
- [ ] 3.3 Define the `AssetIOAdapter` interface and shared binary payload utilities for `ArrayBuffer` and `Uint8Array`
- [ ] 3.4 Create initial Web and UXP asset adapter implementations or stubs that satisfy the shared adapter contract

## 4. Web Host Integration

- [ ] 4.1 Scaffold the React and Vite Web app with the shared runtime wired into browser-safe adapters
- [ ] 4.2 Build the browser flow for image upload, provider parameter editing, and job submission
- [ ] 4.3 Render live execution status, terminal errors, and completed output previews in the Web UI

## 5. Photoshop UXP Integration

- [ ] 5.1 Scaffold the Photoshop UXP plugin, manifest permissions, and React-based panel shell
- [ ] 5.2 Implement active-layer reading and binary payload conversion using supported Photoshop and UXP APIs
- [ ] 5.3 Submit jobs from the plugin through the shared runtime and display lifecycle updates in the panel
- [ ] 5.4 Write completed results back to the current document as a new non-destructive layer

## 6. Integration Hardening

- [ ] 6.1 Add an initial reference provider and workflow example that can run end to end in both hosts
- [ ] 6.2 Verify shared runtime behavior in Web and UXP environments without host-specific imports leaking into core packages
- [ ] 6.3 Document setup, host constraints, and validation expectations needed for the first implementation milestone
