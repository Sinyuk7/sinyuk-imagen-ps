## ADDED Requirements

### Requirement: Shared terminal billing feedback trigger

System SHALL use one shared terminal-task billing feedback trigger for submit and retry flows.

#### Scenario: Submitted task reaches terminal state

- Given a task created through the submit flow reaches `completed` or `failed`
- When terminal task side effects are applied
- Then the system MUST invoke the shared billing feedback trigger exactly once for that terminal transition

#### Scenario: Retried task reaches terminal state

- Given a task created through the retry flow reaches `completed` or `failed`
- When terminal task side effects are applied
- Then the system MUST invoke the same shared billing feedback trigger exactly once for that terminal transition

### Requirement: Provider-reported cost takes priority

System SHALL prefer provider-reported billing cost over manual billing-delta inference.

#### Scenario: Terminal result includes cost on success

- Given a terminal task result includes an explicit billing cost field
- When the task transitions to a successful terminal state
- Then the system MUST make that cost available for immediate billing toast feedback without waiting for profile refresh observation

#### Scenario: Terminal result includes cost on failure

- Given a terminal task result includes an explicit billing cost field
- When the task transitions to a failed terminal state
- Then the system MUST allow the same immediate billing toast feedback path

### Requirement: Manual billing fallback is asynchronous and optional

System SHALL start manual billing-delta observation only when provider-reported cost is unavailable.

#### Scenario: Missing provider cost starts fallback observation

- Given a terminal task result does not include an explicit billing cost field
- When the shared billing feedback trigger runs
- Then the system MUST start an asynchronous profile billing refresh observation window for fallback toast calculation

#### Scenario: Fallback observation succeeds

- Given an asynchronous observation window detects a new billing delta attributable to the post-task refresh window
- When no provider-reported cost was already shown for that terminal task
- Then the system MUST show one billing toast based on the detected delta

### Requirement: Fallback failure is silent

System MUST treat manual billing-delta fallback as non-critical.

#### Scenario: Refresh call fails or times out

- Given manual billing-delta fallback cannot complete because refresh fails, times out, or returns no usable update
- When fallback observation ends
- Then the system MUST NOT change task outcome, MUST NOT show an error toast, and MUST NOT surface a blocking UI error

#### Scenario: Delta cannot be matched confidently

- Given manual billing-delta fallback completes without a trustworthy delta
- When fallback observation ends
- Then the system MUST drop the billing toast and exit silently

### Requirement: This change does not create durable task billing state

System MUST keep billing fallback feedback scoped to transient toast behavior in this change.

#### Scenario: Fallback toast succeeds

- Given manual billing-delta fallback produces a billing toast
- When the toast is shown
- Then the system MUST NOT update message-card footer billing fields, MUST NOT require history list auto-refresh, and MUST NOT persist fallback output as task-level durable billing state in this change
