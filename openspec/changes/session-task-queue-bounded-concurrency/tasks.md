## 1. Application Queue Owner

- [ ] 1.1 Add a session-only queued-task model and extend the application session snapshot/subscription contract to expose queued and running work separately.
- [ ] 1.2 Implement a FIFO scheduler in `packages/application/src/session/*` with `global=5` and `per-profile=2` slot checks, including earliest-eligible task selection when the strict queue head is profile-blocked.
- [ ] 1.3 Change the submit path from terminal-result await to enqueue acknowledgement, and add queued-task removal before dispatch.

## 2. Dispatch Start And Durable Boundary

- [ ] 2.1 Move running task creation out of submit-time UI code so a durable `TaskRecord` is created only when a queued task actually starts execution.
- [ ] 2.2 Bind each started queued task to its real execution `jobId` and preserve the existing completed/failed terminal flush path after dispatch starts.
- [ ] 2.3 Ensure queued-only state never writes to durable task history and is dropped on reload/restart without schema changes.

## 3. App Surface Integration

- [ ] 3.1 Refactor conversation/main-page task flow to consume queue-driven session state, including a visible `queued` phase before provider execution begins.
- [ ] 3.2 Remove global `conversation.running` submit/edit locks and the “new submit aborts old submit” single-flight behavior, while keeping narrow same-action dedupe guards.
- [ ] 3.3 Add queue UI affordances for FIFO position/state and queued-task removal, without introducing running-task cancel or pending-apply state.

## 4. Verification

- [ ] 4.1 Add or update application tests for snapshot freeze, FIFO scheduling, global/per-profile concurrency limits, and queued-task removal before dispatch.
- [ ] 4.2 Add or update app-surface tests for continued editing/submission while tasks are queued or running, visible queued state, and lack of durable queued history after reload.
- [ ] 4.3 Run targeted validation for touched `packages/application` and `apps/app` boundaries, then confirm the OpenSpec change stays apply-ready.
