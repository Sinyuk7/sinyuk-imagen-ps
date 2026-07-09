## ADDED Requirements

### API Contract

The session layer SHALL expose the following queue surface through `ImagenSessionController`:

- `submitJob(input: SubmitJobInput): Promise<CommandResult<EnqueueAcknowledgement>>`  
  Accepts a valid submission, creates a queued task entry, and returns an enqueue acknowledgement. The returned promise MUST resolve before any provider dispatch starts and MUST NOT await the terminal provider result.

- `removeQueuedTask(taskId: string): boolean`  
  Removes a queued task while it is still in the `queued` status. Returns `true` if the entry was removed, `false` if the task was not found, no longer queued, or already in dispatch handoff.

- `ImagenSessionSnapshot.queuedTasks: readonly SessionQueuedTaskSnapshot[]`  
  Exposes the current FIFO queue order. The collection order MUST match the queue position derived from enqueue time.

```ts
interface EnqueueAcknowledgement {
  readonly taskId: string;
  readonly status: 'queued';
}

interface SessionQueuedTaskSnapshot {
  readonly taskId: string;
  readonly createdAt: string;
  readonly profileId: string;
  readonly operation: 'text-to-image' | 'image-edit';
  readonly prompt: string;
  readonly modelId?: string;
  readonly status: 'queued' | 'starting';
  readonly removable: boolean;
  readonly jobId?: string;
}
```

### Requirement: Session queue admits valid submissions as isolated queued snapshots
The system SHALL accept a valid image generation or image edit submission by creating a session-scoped queued task entry and returning enqueue acknowledgement before any terminal provider result is required. The system SHALL expose queued-only session state separately from dispatched execution job state. Each queued task entry SHALL freeze the submission-time prompt, attachments, model selection, output settings, and placement evidence so later composer edits do not mutate the queued work.

#### Scenario: Enqueue creates an isolated task snapshot
- **WHEN** a user submits a new image task
- **THEN** the system creates a queued task entry that stores the submission-time request snapshot and queue metadata before any provider dispatch starts

#### Scenario: Accepted submit returns after queue admission
- **WHEN** a valid image task is accepted into the session queue
- **THEN** the submit path returns after publishing the queued task entry and before any terminal provider result is required

#### Scenario: Later edits do not mutate queued work
- **WHEN** a user edits the composer after a task has already been queued
- **THEN** the queued task entry keeps the original frozen snapshot and the later edits only affect future submissions

#### Scenario: Validation failure does not enqueue or persist work
- **WHEN** local validation fails before a submission can be admitted into the session queue
- **THEN** the system creates no queued task entry, creates no durable `TaskRecord`, and starts no provider request for that failed submission

#### Scenario: Round identifier binds to queued task identifier
- **WHEN** the app surface enqueues a new task from a conversation round
- **THEN** the queued task entry uses the same `taskId` as the round identifier
- **AND** the active session surface can correlate the round with the queued entry by `taskId`
- **AND** after dispatch handoff the same `taskId` remains bound to the resulting execution job through `__clientTaskId`

#### Scenario: Frozen snapshot stores only provider-dispatchable inputs
- **WHEN** a task is queued
- **THEN** the frozen snapshot stores the provider request inputs, including prompt, output settings, model selection, and provider-input asset references
- **AND** the snapshot does not store app-surface `HostImageAsset` or other Photoshop-host-bound objects
- **AND** the scheduler can later replay the snapshot into `commands.submitJob()` without re-deriving inputs from the composer

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

#### Scenario: Dispatch-time failure converts the task to a failed running task
- **WHEN** the scheduler has selected a queued task for dispatch and calls the real execution path
- **AND** the execution path fails before producing a terminal job result
- **THEN** the queued task entry is removed from `queuedTasks`
- **AND** the system creates a `failed` durable `TaskRecord` for that `taskId` using the frozen snapshot evidence
- **AND** the failure surface on the active session surface follows the same failed-round behavior as a non-queued task failure

### Requirement: Queued tasks can be removed before dispatch
The system SHALL allow a queued task to be removed while it is still in the queue and has not started provider dispatch. Removing a queued task SHALL prevent creation of the execution job and SHALL prevent any provider request for that task.

#### Scenario: Remove queued task before scheduler start
- **WHEN** a user removes a queued task that has not yet been dispatched
- **THEN** the system deletes that queued task entry from the active session queue and never starts an execution job for it

#### Scenario: Remove no longer succeeds after dispatch handoff starts
- **WHEN** a queued task has already entered dispatch handoff and is no longer purely queued work
- **THEN** the system no longer removes it as a queued task and continues under normal started-task semantics

### Requirement: Queued state remains session-only and non-durable
The system SHALL keep queued task state in session memory only. Queued tasks SHALL NOT be written into durable task history, SHALL NOT survive app reload or restart, and SHALL NOT be represented as durable `TaskRecord` entries before real execution starts. Durable history views backed by `TaskRecord` SHALL continue to exclude queued-only entries.

#### Scenario: Reload drops queued work
- **WHEN** the app reloads or restarts while queued tasks still have not started execution
- **THEN** the system does not restore those queued tasks into the next session

#### Scenario: Durable task history excludes queued-only entries
- **WHEN** a task is accepted into the queue but has not yet started execution
- **THEN** durable task history does not contain a `TaskRecord` for that queued-only state

#### Scenario: Dispatch start creates the durable running task
- **WHEN** the scheduler hands a queued task off to real provider execution
- **THEN** the system creates the durable `running` `TaskRecord` and binds the real execution `jobId` at dispatch start rather than at queue admission time

### Requirement: Active queued or running work must not globally lock new submissions
The system SHALL continue to allow users to prepare and enqueue new image tasks while other tasks are queued or running. The system SHALL remove global conversation-level running locks and only keep narrow dedupe or burst-protection gates for the same action or same task entry.

#### Scenario: User enqueues new work while another task is running
- **WHEN** at least one task is already running
- **THEN** the user can still edit the composer and enqueue another task without waiting for the running task to finish

#### Scenario: Active session surface shows queued work before dispatch
- **WHEN** a task has been accepted into the queue but has not yet started provider dispatch
- **THEN** the active session surface shows that task as queued and allows users to continue preparing future submissions subject only to narrow same-action dedupe

### Requirement: Completion remains manual result handling without auto-apply or fake cancel
The system SHALL preserve manual result handling after completion. Completed tasks SHALL surface their results for manual place or download actions, and leaving a result untouched SHALL NOT create a pending-apply or ignored durable state. The system SHALL NOT present running-task cancellation as a supported product behavior unless the underlying runtime and provider path explicitly guarantee reliable cancellation semantics.

#### Scenario: Completion does not auto-apply to Photoshop
- **WHEN** a queued task finishes successfully
- **THEN** the system shows the result for manual place or download actions, leaving it untouched creates no extra result state, and the system does not auto-apply it to Photoshop

#### Scenario: No running cancel control without reliable backend capability
- **WHEN** a task is already running under a provider/runtime path that does not guarantee reliable cancellation
- **THEN** the system does not expose that task as product-level cancellable

### Requirement: Queue lifecycle handles empty and removal edge states
The system SHALL keep the scheduler idle when the queue is empty. Removing all queued tasks SHALL leave no pending dispatch attempts. The system SHALL NOT resurrect queued tasks when a provider profile is deleted or disabled after the tasks were enqueued.

#### Scenario: Empty queue keeps scheduler idle
- **WHEN** the session queue contains no queued tasks
- **THEN** the scheduler makes no dispatch attempts and consumes no execution slots

#### Scenario: Removing all queued tasks leaves no orphan dispatch
- **WHEN** every queued task in the session is removed before dispatch
- **THEN** the scheduler has no remaining queued work and no execution job is created for any removed task

#### Scenario: Deleting a profile does not revive its queued tasks
- **WHEN** a provider profile is deleted or disabled while it still has queued tasks
- **THEN** those queued tasks remain in the queue but are never started for that profile
- **AND** the scheduler skips them when selecting eligible work
