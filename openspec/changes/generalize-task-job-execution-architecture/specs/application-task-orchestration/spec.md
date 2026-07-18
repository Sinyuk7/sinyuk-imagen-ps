## ADDED Requirements

### Requirement: Task 必须由 Application 拥有
完整 Task domain MUST属于 `packages/application`，包括durable `TaskRecord`、status、attachments、outputs、placement、execution summary、resource resolution/evidence types、sanitizers、validator、TaskStore port 与task-history commands。Task MUST表达用户意图、attachments、outputs、placement、display facts、error 与 timestamps；`core-engine` MUST不导出或依赖任何Task contract。

#### Scenario: Application 创建运行 Task
- **WHEN**queued submission 即将 dispatch
- **THEN**Application MUST先持久化 backend-neutral running Task snapshot，再允许 Job execution side effect

### Requirement: Task 与 Job 必须使用独立 identity 和 lifecycle
Task MUST使用稳定 `taskId` 表示一次用户意图；Job MUST使用独立 `jobId` 表示一次 execution attempt。一个 Task MAY按顺序关联多个 Jobs，但同一 Task MUST同时最多拥有一个 active Job。

`TaskJobCorrelation` MUST属于 Application-owned active sidecar；每个 active entry MUST包含 `taskId/jobId/backendId/admitted submission`，并以 `jobId` 作为 terminal event路由authority。Durable `TaskRecord.latestJobId` MUST保存当前最新Job reference。Core与ExecutionAdapter MUST NOT读取或依赖 `__clientTaskId`、`__clientRoundId` 或其他Application correlation字段。

#### Scenario: 初次 Generate
- **WHEN**用户提交新的 generation intent
- **THEN**Application MUST创建新 Task，并为首次 execution 创建新 Job

#### Scenario: 用户 Retry
- **WHEN**backend policy 允许用户 Retry 一个 failed Task
- **THEN**Application MUST保留 taskId、创建新 jobId，并把 Task 的 latest execution reference 指向新 Job

#### Scenario: 用户 Regenerate
- **WHEN**用户从历史或 composer 重新发起 generation
- **THEN**Application MUST创建新 taskId 与新 jobId，且 MUST不覆盖原 Task

#### Scenario: latestJobId 更新
- **WHEN**Application 为同一 task 产生新的 Job
- **THEN**latestJobId MUST 指向新 Job，且旧 Job 仍可作为历史事实保留

#### Scenario: 重复 terminal event
- **WHEN**同一 `jobId` 的 terminal event 被重复投递
- **THEN**Application MUST通过 correlation terminal guard只执行一次Task projection、terminal write与follow-up

### Requirement: Queued submission 必须保持 session-only
Application Session MUST继续使用 session-only queued submission；queued-only work MUST不写入 durable TaskStore，且 app reload/dispose MUST丢弃未 dispatch work。Session MUST在 dispatch 前冻结 admitted input。

Admitted submission与Task snapshot MUST不包含resolved secret values；backend admission MUST只携带secret refs或non-secret connection identity。Session queue MUST只保存frozen admitted submission与queue-local dedupe metadata；`TaskJobCorrelation` MUST在Job创建后、remote side effect前bind。

#### Scenario: Reload 前仍 queued
- **WHEN**app reload 时 submission 尚未开始 dispatch
- **THEN**该 submission MUST不出现在 durable Task history，且 reload 后 MUST不自动执行

#### Scenario: Admission需要saved secret
- **WHEN**backend config引用host secret storage中的credential
- **THEN**queued submission MUST只冻结secret ref，且 Session snapshot/log MUST不包含resolved value

#### Scenario: Queue 丢弃
- **WHEN**App dispose 或 reload 发生且 work 尚未 dispatch
- **THEN**queued submission MUST 被丢弃，且不得留下 orphan Task 或 Job 事实

### Requirement: GenerationBackend 必须封装 backend-specific policy
Application MUST通过统一 `GenerationBackend` seam拥有 admission、readiness recheck、lane key、retry reconstruction、terminal Task projection 与 optional terminal follow-up。Generic Session MUST不读取 profile、model、connection、workflow source、billing 或 remote response fields。

Application MUST使用`GenerationCommand { taskId, backendId, payload }`作为唯一admission envelope；matching backend独占解释opaque payload。`GenerationBackend` MUST生成包含`taskId/backendId/execution/runningTask/lane/retry`的bounded `AdmittedGeneration`。`execution` MUST是`{ workflow: string; input: Readonly<Record<string, unknown>> }`；Core runner MUST按Workflow step的static adapter构造`ExecutionRef`。`GenerationBackend` MUST不直接执行remote transport；`ExecutionAdapter` MUST是唯一backend side effect owner，且 MUST不拥有Task、Session、admission或terminal projection。

Command与`AdmittedGeneration` MUST immutable、serializable且secret-free，且command/backend/admitted的taskId与backendId MUST一致；`runningTask` MUST是相同taskId的v2 running snapshot，并在admission时不含`latestJobId`。可选lane MUST使用`{ key: non-empty string; maxConcurrency: positive integer }`。Session MUST同时执行global cap `5`与submission声明的lane cap；无lane时只受global cap。

#### Scenario: Admission 返回非法数据
- **WHEN**backend admission返回taskId不匹配、resolved secret、非serializable input、非法lane或非running Task snapshot
- **THEN**Application MUST在queue publication与Task/Job/remote side effect前拒绝submission

#### Scenario: 两个 backend 使用同一 Session
- **WHEN**两个 GenerationBackend 返回合法 admitted submissions 与不同 lane keys
- **THEN**Session MUST用相同 FIFO/dedupe/dispatch lifecycle 编排它们，且 MUST只按 declared lane policy限制并发

#### Scenario: Dispatch 前 backend 不再 runnable
- **WHEN**submission已出队且Job尚未创建时backend readiness recheck返回非ready decision
- **THEN**Session MUST按该decision处理，且 MUST不创建Job、running Task或远端side effect

#### Scenario: Readiness 判定
- **WHEN**backend readiness recheck 返回 ready、wait 或 reject
- **THEN**Session MUST分别继续execution、保留session-only queued并在下次scheduler wake-up重检、或移除submission并返回bounded admission failure

#### Scenario: Application 执行 admitted submission
- **WHEN**Session dispatch 一个 admitted generation
- **THEN**Application MUST按 `admit -> queue -> readiness -> create Job -> bind correlation -> persist running Task -> run Workflow -> project terminal -> persist terminal Task -> follow-up` 单一路径执行，且 MUST不走平行submit path

#### Scenario: follow-up 失败隔离
- **WHEN**terminal projection 成功但 optional follow-up 失败
- **THEN**原 Task/Job terminal result MUST 保持稳定，failure MUST 只影响 follow-up side effect

### Requirement: Task execution facts 必须 backend-neutral
Task MAY保存 bounded `backend/connection/target` identity与 labels用于 display/debug，但 MUST不保存 backend-specific graph、request、transport、client identity、raw response、secret 或 driver state。Task consumers MUST不按 backend id 解释 execution behavior。

TaskRecord v2 MUST 是 current-state break：它只保留 Application-owned 事实与 backend-neutral execution summary；v1 records MUST decode为 unknown-schema，且 MUST NOT 通过 migration 或 alias 自动上提为 v2。

#### Scenario: History 渲染不同 backend Task
- **WHEN**History 收到 Provider 与 non-Provider TaskRecords
- **THEN**它 MUST通过相同 status/prompt/output/resource/display contract 渲染，且 MUST不要求 backend-specific fields

#### Scenario: 读取v1 Task record
- **WHEN**decoder收到`schemaVersion: 1`的Task record
- **THEN**它 MUST返回`unknown-schema`并隔离该record，且 MUST不迁移、不dual-write、不读取旧Provider字段

#### Scenario: Task v2 cutover完成
- **WHEN**CHANGE-01声明Task v2 migration完成
- **THEN**全部Task producers、Chrome/UXP persistence adapters与History/Preview/Download/Placement consumers MUST只使用v2 generic fields，且仓库 MUST不保留v1 writer、Provider-shaped字段fallback或compatibility alias

### Requirement: Task resources 必须复用 StoredAssetRef authority
Task attachments、prepared execution inputs 与 outputs MUST引用既有 `StoredAssetRef`，MUST不保存 raw bytes、native path 或重复 asset cache identity。动态 availability、Preview、Download 与 Placement MUST继续由 host/application resolvers决定。

#### Scenario: Durable output bytes 已被驱逐
- **WHEN**Task output 的 StoredAssetRef 已无法 resolve
- **THEN**History MUST保留 Task record并显示 missing/evicted state，且 MUST不把 record 判为 malformed

### Requirement: Terminal projection 必须更新同一 Task
Application MUST把 Job terminal result通过 owning GenerationBackend projector转换为 Task status、outputs、error、execution facts 与 timestamps。Projection 或 asset materialization失败 MUST产生 bounded failed Task，不得留下永远 running 的记录。

Projection 顺序 MUST 为 `project terminal -> persist Task -> optional afterTerminal`；若 projection fallback 发生，Task status/output/error MUST 仍以已验证的 backend-neutral summary 为准。

#### Scenario: Job 成功并返回图片
- **WHEN**Job completed 且 projector 成功 materialize output refs
- **THEN**同一 Task MUST变为 completed，并按稳定顺序保存 TaskOutputs

#### Scenario: Terminal projector失败
- **WHEN**`projectTerminal()`或output materialization失败
- **THEN**Application MUST从admitted running snapshot生成bounded failed Task并持久化，且 MUST不留下running record

#### Scenario: Terminal follow-up失败
- **WHEN**terminal Task已成功persist但`afterTerminal()`失败
- **THEN**Application MUST只记录sanitized failure，MUST不回滚或覆盖Job/Task result，也 MUST不向主结果重新抛错

#### Scenario: App 在 running Task 后重启
- **WHEN**startup reconciliation发现不属于 active session 的 running Task
- **THEN**Application MUST把它标记 interrupted，且 MUST不声称远端已取消
