## ADDED Requirements

### Requirement: JobStore 支持创建 job
`JobStore` SHALL 提供 `submitJob(input)`，接收 `JobInput`，返回新创建 `Job` 的 snapshot，并在内部创建一条 `status` 为 `'created'` 的记录。

#### Scenario: 成功创建 job
- **WHEN** 调用 `submitJob({ prompt: 'a cat' })`
- **THEN** 返回 `Job` 对象，其 `status` 为 `'created'`
- **AND** `input` 等于提交时的 input
- **AND** `output` 与 `error` 为 `undefined`
- **AND** `id` 为非空字符串

### Requirement: JobStore 支持查询 job
`JobStore` SHALL 提供 `getJob(id)`，返回对应 `Job` snapshot；若 id 不存在，返回 `undefined`。

#### Scenario: 查询存在的 job
- **WHEN** 已创建 job 并获取 `id`
- **THEN** `getJob(id)` 返回对应的 `Job` snapshot

#### Scenario: 查询不存在的 job
- **WHEN** 调用 `getJob('non-existent')`
- **THEN** 返回 `undefined`

### Requirement: JobStoreController 支持状态推进
`JobStoreController` SHALL 提供 `markRunning(id)`、`markCompleted(id, output)`、`markFailed(id, error)`，将 job 从当前状态推进到目标状态。

#### Scenario: 正常完成
- **WHEN** job 处于 `'created'` 状态
- **AND** 依次调用 `markRunning(id)` 与 `markCompleted(id, { url: '...' })`
- **THEN** `getJob(id)` 的 `status` 为 `'completed'`
- **AND** `output` 为传入值
- **AND** `updatedAt` 大于 `createdAt`

#### Scenario: 执行失败
- **WHEN** job 处于 `'created'` 状态
- **AND** 调用 `markRunning(id)` 后再调用 `markFailed(id, error)`
- **THEN** `getJob(id)` 的 `status` 为 `'failed'`
- **AND** `error` 为传入值

#### Scenario: 非法状态迁移被拒绝
- **WHEN** job 已处于 `'completed'` 状态
- **AND** 调用 `markRunning(id)`
- **THEN** 抛出 `JobError`，`category` 为 `'runtime'`

#### Scenario: 推进不存在的 job 被拒绝
- **WHEN** 调用 `markRunning('non-existent')`
- **THEN** 抛出 `JobError`，`category` 为 `'validation'`

### Requirement: 状态机 terminal state 不可再迁移
`created` 可迁移到 `running`；`running` 可迁移到 `completed` 或 `failed`；`completed` 与 `failed` 为 terminal state，不可再迁移。

#### Scenario: 从 failed 尝试推进到 running
- **WHEN** job 已处于 `'failed'` 状态
- **AND** 调用 `markRunning(id)`
- **THEN** 抛出 `JobError`，`category` 为 `'runtime'`

### Requirement: JobStore 支持重试失败 job
`JobStore` SHALL 提供 `retryJob(id)`，仅对 `status` 为 `'failed'` 的 job 生效，复制原 `input` 创建新 job，新 job `status` 为 `'created'`。

#### Scenario: 成功重试
- **WHEN** job 已处于 `'failed'` 状态
- **AND** 调用 `retryJob(id)`
- **THEN** 返回新的 `Job` snapshot，其 `id` 不等于原 `id`
- **AND** `status` 为 `'created'`
- **AND** `input` 等于原 job 的 `input`
- **AND** `originJobId` 等于原 job 的 `id`
- **AND** `retryAttempt` 为 `1`

#### Scenario: 对 retry 产物再次重试
- **WHEN** 已存在一个 `retryAttempt` 为 `1` 的失败 job
- **AND** 调用 `retryJob(id)`
- **THEN** 新 job 的 `retryAttempt` 为 `2`

#### Scenario: 重试非失败 job 抛出错误
- **WHEN** job 的 `status` 不为 `'failed'`
- **AND** 调用 `retryJob(id)`
- **THEN** 抛出 `JobError`，`category` 为 `'validation'`

#### Scenario: 重试不存在的 job 抛出错误
- **WHEN** 调用 `retryJob('non-existent')`
- **THEN** 抛出 `JobError`，`category` 为 `'validation'`

### Requirement: JobStore 对非法 input 拒绝创建
`submitJob` SHALL 在 `input` 不符合序列化要求时抛出 `JobError`（`category: 'validation'`）。

#### Scenario: input 包含 function
- **WHEN** 调用 `submitJob({ fn: () => {} })`
- **THEN** 抛出 `JobError`，`category` 为 `'validation'`

### Requirement: Store 返回的 Job 对象为不可变 snapshot
`getJob`、`submitJob`、`retryJob` 以及 `JobStoreController` 所有方法的返回值 SHALL 为不可变 snapshot，与内部 mutable record 隔离。

#### Scenario: 尝试修改返回的 job
- **WHEN** 获取到 `job = getJob(id)`
- **THEN** 对 `job` 或其属性重新赋值应抛出 TypeError 或在严格模式下静默失败

#### Scenario: 内部状态更新不影响已发出的 snapshot
- **WHEN** 已获取 `job1 = getJob(id)`
- **AND** 随后通过 `markCompleted(id, output)` 更新状态
- **THEN** `job1.status` 仍为 `'created'`
- **AND** `getJob(id).status` 为 `'completed'`

### Requirement: createJobStore 返回 store 与 controller 分离的对象
`createJobStore()` SHALL 返回一个对象，包含 `store`（`JobStore`）与 `controller`（`JobStoreController`）两个字段。

#### Scenario: 正确拆分读写面
- **WHEN** 调用 `const { store, controller } = createJobStore()`
- **THEN** `store` 拥有 `submitJob`、`getJob`、`retryJob`
- **AND** `controller` 拥有 `markRunning`、`markCompleted`、`markFailed`
