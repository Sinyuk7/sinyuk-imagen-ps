## ADDED Requirements

### Requirement: Provider async lifecycle is optional and protocol-neutral
系统 SHALL 允许 Provider 声明可选 `ProviderAsyncLifecycle`。lifecycle 的 `submit()` SHALL 返回 canonical completed result 或 pending opaque remote reference；`poll()` SHALL 返回 canonical pending、completed 或 failed。未声明 lifecycle 的 Provider SHALL 继续通过既有 `invoke()` 完成执行。

#### Scenario: 同步 Provider 不声明 lifecycle
- **WHEN** dispatch 一个没有 `ProviderAsyncLifecycle` 的 Provider
- **THEN** 系统 SHALL 只调用一次既有 `invoke()`，并保持现有 result/error 合同

#### Scenario: async Provider 返回 pending
- **WHEN** `submit()` 返回 pending opaque remote reference
- **THEN** 系统 SHALL 在 Provider 异步执行 manager 中查询该 reference，直到 completed、failed、取消或 budget 耗尽

### Requirement: Async manager isolates Provider wire protocol
async execution manager SHALL 仅消费 lifecycle 的 canonical terminal state、opaque remote reference、受限 polling directive 与可选 progress。`remoteRef` SHALL 仅作为 secret-free、opaque 的 process-local runtime value 在 lifecycle 与 Application manager 间传递；Application SHALL NOT 解释、记录、持久化或向 Core/UI 暴露它。远端 URL、认证、task ID、wire status、请求/响应 schema SHALL 留在 Provider-local implementation，且 MUST NOT 进入 Core Job、Application Task、历史或 Profile persistence。

#### Scenario: Provider 返回 service-specific running status
- **WHEN** Provider 将 service-specific running response 解析为 canonical pending
- **THEN** manager SHALL 不要求或记录该 wire status，并只根据 lifecycle 返回值继续调度

### Requirement: Async submission is single-send
每次 logical provider execution 的 `submit()` SHALL 至多调用一次。提交已返回 pending 后，任何暂态 query failure、poll retry、budget 耗尽或取消 SHALL NOT 触发第二次 `submit()`。

#### Scenario: 查询暂态失败
- **WHEN** 已提交任务的 `poll()` 返回可安全重试的暂态失败
- **THEN** manager SHALL 仅按 Provider 指令重新查询原 remote reference，且 SHALL NOT 再次提交

#### Scenario: 查询预算耗尽
- **WHEN** pending 任务达到 manager 的 hard poll 或 elapsed-time budget
- **THEN** manager SHALL 返回明确 provider failure，且 SHALL NOT 伪造成功或重新提交

#### Scenario: terminal job 被重复 dispatch
- **WHEN** 同一 runtime 内已启动的 `jobId` 再次进入 async execution manager
- **THEN** manager SHALL 拒绝该次重入，且 SHALL NOT 再次调用 `submit()`；需要重试时 Core SHALL 创建新的 Job ID

### Requirement: Cancellation and polling are bounded
manager SHALL 传递 `AbortSignal`，同一 remote reference SHALL 同时至多有一个 in-flight `poll()`，并 SHALL 在完成、失败、取消或 budget 耗尽后清理 timer/listener。Provider 建议的 polling delay SHALL 受 manager 的有效范围限制。

#### Scenario: dispatch 被取消
- **WHEN** caller abort 在 pending task 等待或查询期间触发
- **THEN** manager SHALL 停止后续查询、清理等待资源并以取消对应的 provider failure 结束

#### Scenario: Provider 建议过短 delay
- **WHEN** Provider 返回小于 manager 安全下限的下一次查询 delay
- **THEN** manager SHALL 钳制该 delay，避免 busy loop

### Requirement: Core and UI lifecycle remain unchanged
async Provider 的 internal pending state SHALL 不增加 Core Job 或 Application Task status。现有 `queued`、`running`、`completed`、`failed` 投影 SHALL 继续适用于同步和异步 Provider；系统 SHALL NOT 在本 change 中增加远端状态 UI、余额账本或运行中任务恢复。

#### Scenario: async Provider 最终成功
- **WHEN** async manager 收到 completed `ProviderInvokeResult`
- **THEN** 既有 dispatch SHALL 创建 completed Job 并沿用现有 terminal projection

#### Scenario: Provider 没有查询接口
- **WHEN** Provider 不声明 async lifecycle 且原始 `invoke()` 长时间未完成
- **THEN** 系统 SHALL 仅等待该 Promise，且 SHALL NOT 假装可查询远端状态或自动重放
