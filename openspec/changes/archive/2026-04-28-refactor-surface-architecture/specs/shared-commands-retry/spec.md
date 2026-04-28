## MODIFIED Requirements

### Requirement: retryJob 命令

`retryJob(jobId: string)` SHALL 重试指定的 job。内部 SHALL 从 `@imagen-ps/shared-commands` 管理的 runtime store 获取原 job 的 `workflowName` 和 `input`，然后调用 runtime 创建新 job。返回类型 SHALL 为 `Promise<CommandResult<Job>>`。

重试 SHALL 创建新 job 而非修改原 job，保持 job 不可变性。

#### Scenario: 重试失败的 job
- **WHEN** 调用 `retryJob(failedJobId)` 且原 job 存在且 `status === 'failed'`
- **THEN** 返回 `{ ok: true, value: Job }`
- **AND** 新 job 使用原 job 相同的 `workflowName` 和 `input`
- **AND** 新 job 的 `id` SHALL 与原 job 不同
- **AND** 原 job 状态 SHALL 保持不变

#### Scenario: 重试已完成的 job
- **WHEN** 调用 `retryJob(completedJobId)` 且原 job 存在且 `status === 'completed'`
- **THEN** 返回 `{ ok: true, value: Job }`
- **AND** 新 job 使用原 job 相同的 `workflowName` 和 `input`

#### Scenario: 重试不存在的 job
- **WHEN** 调用 `retryJob('nonexistent-id')` 且该 jobId 不存在于当前 shared commands runtime store
- **THEN** 返回 `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL 为 `'validation'`
- **AND** `error.message` SHALL 包含 jobId

#### Scenario: 重试正在运行的 job
- **WHEN** 调用 `retryJob(runningJobId)` 且原 job 存在且 `status === 'running'`
- **THEN** 返回 `{ ok: true, value: Job }`
- **AND** 新 job 独立于原 job 执行

#### Scenario: 原 job 数据缺失
- **WHEN** 调用 `retryJob(jobId)` 且原 job 存在但 `workflowName` 或 `input` 为 undefined/null
- **THEN** 返回 `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL 为 `'validation'`
- **AND** `error.message` SHALL 说明缺失的字段
