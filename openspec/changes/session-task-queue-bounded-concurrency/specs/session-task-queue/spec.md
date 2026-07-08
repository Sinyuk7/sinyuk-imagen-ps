## ADDED Requirements

### Requirement: Session queue freezes each submission as its own task snapshot
The system SHALL create a session-scoped queued task entry for every accepted image generation or image edit submission. Each queued task entry SHALL freeze the submission-time prompt, attachments, model selection, output settings, and placement evidence so later composer edits do not mutate the queued work.

#### Scenario: Enqueue creates an isolated task snapshot
- **WHEN** a user submits a new image task
- **THEN** the system creates a queued task entry that stores the submission-time request snapshot and queue metadata before any provider dispatch starts

#### Scenario: Later edits do not mutate queued work
- **WHEN** a user edits the composer after a task has already been queued
- **THEN** the queued task entry keeps the original frozen snapshot and the later edits only affect future submissions

### Requirement: Scheduler starts queued tasks with FIFO order and bounded concurrency
The system SHALL schedule queued tasks in FIFO order with bounded concurrency. The scheduler SHALL allow at most 5 running tasks globally and at most 2 running tasks per provider profile. The scheduler SHALL only create a real execution job when a queued task receives a runnable slot.

#### Scenario: Global concurrency cap blocks additional starts
- **WHEN** 5 tasks are already running
- **THEN** the scheduler does not start any additional queued task until a running task reaches a terminal state

#### Scenario: Per-profile concurrency cap blocks same-profile starts
- **WHEN** 2 tasks for the same profile are already running and another queued task for that profile reaches the head of eligible work
- **THEN** the scheduler does not start that queued task until one of the same-profile running tasks reaches a terminal state

#### Scenario: Scheduler uses the earliest eligible queued task
- **WHEN** global capacity is available and the earliest queued task cannot start only because its profile is at the per-profile limit
- **THEN** the scheduler starts the earliest later queued task whose profile has an available slot instead of leaving the global slot idle

### Requirement: Queued tasks can be removed before dispatch
The system SHALL allow a queued task to be removed while it is still in the queue and has not started provider dispatch. Removing a queued task SHALL prevent creation of the execution job and SHALL prevent any provider request for that task.

#### Scenario: Remove queued task before scheduler start
- **WHEN** a user removes a queued task that has not yet been dispatched
- **THEN** the system deletes that queued task entry from the active session queue and never starts an execution job for it

### Requirement: Queued state remains session-only and non-durable
The system SHALL keep queued task state in session memory only. Queued tasks SHALL NOT be written into durable task history, SHALL NOT survive app reload or restart, and SHALL NOT be represented as durable `TaskRecord` entries before real execution starts.

#### Scenario: Reload drops queued work
- **WHEN** the app reloads or restarts while queued tasks still have not started execution
- **THEN** the system does not restore those queued tasks into the next session

#### Scenario: Durable task history excludes queued-only entries
- **WHEN** a task is accepted into the queue but has not yet started execution
- **THEN** durable task history does not contain a `TaskRecord` for that queued-only state

### Requirement: Active queued or running work must not globally lock new submissions
The system SHALL continue to allow users to prepare and enqueue new image tasks while other tasks are queued or running. The system SHALL remove global conversation-level running locks and only keep narrow dedupe or burst-protection gates for the same action or same task entry.

#### Scenario: User enqueues new work while another task is running
- **WHEN** at least one task is already running
- **THEN** the user can still edit the composer and enqueue another task without waiting for the running task to finish

### Requirement: Completion remains manual result handling without auto-apply or fake cancel
The system SHALL preserve manual result handling after completion. Completed tasks SHALL surface their results without automatic Photoshop writeback or a pending-apply state. The system SHALL NOT present running-task cancellation as a supported product behavior unless the underlying runtime and provider path explicitly guarantee reliable cancellation semantics.

#### Scenario: Completion does not auto-apply to Photoshop
- **WHEN** a queued task finishes successfully
- **THEN** the system shows the result for manual place, download, or ignore actions and does not auto-apply it to Photoshop

#### Scenario: No running cancel control without reliable backend capability
- **WHEN** a task is already running under a provider/runtime path that does not guarantee reliable cancellation
- **THEN** the system does not expose that task as product-level cancellable
