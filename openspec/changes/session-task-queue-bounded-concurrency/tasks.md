## 1. Application Queue Owner

- [ ] 1.1 Add a session-only queued-task model plus a public `queuedTasks` session snapshot contract for pre-dispatch work, while keeping existing `jobs` as the dispatched execution view.
- [ ] 1.2 Implement a FIFO scheduler in `packages/application/src/session/*` with centralized queue-policy constants (`global=5`, `per-profile=2`), including earliest-eligible task selection when the strict queue head is profile-blocked.
- [ ] 1.3 Change the submit path from terminal-result await to enqueue acknowledgement, run local validation before queue admission, and support queued-task removal before dispatch handoff.
- [ ] 1.4 Define the public session API contract in `packages/application/src/session/types.ts`: `submitJob()` returns `CommandResult<EnqueueAcknowledgement>`, `removeQueuedTask(taskId): boolean`, and `ImagenSessionSnapshot.queuedTasks`.

## 2. Dispatch Start And Durable Boundary

- [ ] 2.1 Split `TaskRecord` creation responsibility across the app/application boundary:
  - App surface prepares the provider-dispatchable request snapshot (including `Asset[]` / `TaskPlacement`) before enqueue.
  - `packages/application` scheduler creates the minimal `running` `TaskRecord` at dispatch start using the frozen snapshot evidence, without importing app-layer `HostImageAsset`.
- [ ] 2.2 Bind each started queued task to its real execution `jobId`, preserve the existing completed/failed terminal flush path, and keep stale-running reconciliation semantics for already-started tasks.
- [ ] 2.3 Handle dispatch-time failure: if `commands.submitJob()` fails after the scheduler selects a queued task, remove the queued entry and flush a `failed` `TaskRecord` for the same `taskId` so the UI round shows the failure.
- [ ] 2.4 Ensure queued-only state never writes to durable task history, never appears in `listTaskRecords()`, and is dropped on reload/restart without schema changes.

## 3. App Surface Integration

- [ ] 3.1 Refactor conversation/main-page task flow to consume `queuedTasks + jobs`, including a visible `queued` phase on the active session surface before provider execution begins.
- [ ] 3.2 Remove global `conversation.running` submit/edit gates:
  - Update `deriveComposerReadiness()` to stop using a global `running` boolean for disabling send.
  - Remove the “new submit aborts old submit” single-flight behavior in `useConversation.submit()`; keep only `submitInFlightRef` for same-tick burst dedupe.
  - Remove `/new` wait gating if it blocks new submissions while a task is running.
- [ ] 3.3 Remove `conversation.running` from capture/readiness logic in `MainPage`:
  - Stop using `conversation.running` to disable `canCapture`.
  - Keep only capture-specific in-flight dedupe (`captureInFlight`).
  - Disable error-retry / regenerate buttons only for the same task/round in flight, not for all running tasks.
- [ ] 3.4 Add main-surface queue UI affordances for FIFO position/state and queued-task removal, and keep durable HistoryPage task-record-backed instead of introducing queued durable rows.

## 4. Verification

- [ ] 4.1 Add application session tests for validation-before-admission, enqueue acknowledgement, snapshot freeze, FIFO scheduling, global/per-profile concurrency limits, queued-task removal before dispatch, and dispatch-time failure handling.
- [ ] 4.2 Add or update app-surface tests with the existing main-page/fake-services harness to prove continued editing/submission while tasks are queued or running, visible queued state, queued-task removal, and lack of durable queued history after reload.
- [ ] 4.3 Add edge-state tests for empty queue, remove-all queued tasks, and profile deletion/disable while tasks are queued.
- [ ] 4.4 Run targeted validation for touched `packages/application` and `apps/app` boundaries, then confirm the OpenSpec change stays apply-ready.
- [ ] 4.5 When implementation lands, update `docs/ENGINEERING_CONTEXT.md` to replace the old “send creates a running task” and `conversation.running` global-lock wording.
