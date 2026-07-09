## Context

当前实现把“提交任务”和“执行任务”几乎绑定在同一个同步用户动作里。`useConversation()` 在 app 层先写一个 `running` `TaskRecord`，然后直接 `await session.submitJob(...)`；`session.submitJob()` 再直接调用 `commands.submitJob()`，后者一路进入 `runtime.runWorkflow()` 与 provider dispatch。这样虽然底层是 `async/await`，但产品语义仍接近单 in-flight 流程：一次 submit 直到 provider 返回前，很难自然地继续组织更多任务。

这次变更要解决的是“长耗时生成期间继续工作”的问题，而不是把仓库升级成 durable background job platform。已确认的约束如下：

- 队列只在 session 内存在，不跨 app reload / restart 恢复。
- 调度顺序固定为 FIFO，不支持拖拽改优先级。
- 并发上限为 `global=5`、`per-profile=2`。
- queued task 可以在真正 dispatch 之前移出队列。
- running task 不承诺产品级 cancel；当前只保留底层 `AbortSignal` seam。
- 结果完成后仍由用户手动 place / download；未处理结果不额外建模，不引入“待应用”状态。

## Goals / Non-Goals

**Goals:**

- 在 `packages/application` 引入 session-only 的 queue/scheduler owner。
- 把 submit 语义改成“快速确认入队”，而不是“等待 provider 终态”。
- 保证每个 queued task 在入队瞬间冻结自己的 prompt / attachments / model / output / placement snapshot。
- 用 FIFO + bounded concurrency 调度真实 execution job。
- 让 UI 在 queued / running 存在时继续允许编辑和新任务入队。
- 将 queued phase 的必需展示面限定在 active session surface；durable history 保持 `TaskRecord` 边界。
- 保持 provider contract、durable `TaskRecord` 语义、Photoshop 手动 writeback 边界清晰。

**Non-Goals:**

- 不做 durable queued task persistence。
- 不把 queued task 写入 `TaskRecord`。
- 不把 `interrupted` 复用成“用户取消”。
- 不提供 running-task fake cancel。
- 不引入自动 Photoshop writeback、自动应用、或待应用队列。
- 不修改 provider transport retry / failover 语义。

## Decisions

### 1. Queue ownership stays in `packages/application` session layer

队列和调度器放在 `packages/application/src/session/*`，而不是 `packages/providers` 或 `packages/core-engine`。

原因：

- `providers` 只拥有 provider invoke / retry / failover，不应拥有任务排队和 UI-facing lifecycle。
- `core-engine` 仍保持“已开始执行的 workflow runner”边界，不负责尚未 dispatch 的用户任务。
- `application` 已经拥有 session snapshot、submit/retry orchestration、profile/model 解析，最适合作为 queue owner。

备选方案：

- 把 queue 放进 `core-engine`。缺点是会把“未开始执行的任务状态”塞进 execution kernel，并迫使 `JobStatus` / runner contract 扩张。
- 把 queue 放进 app hook。缺点是业务语义分散在 UI，后续难以复用和测试。

### 2. Introduce a separate in-memory queued-task model

新增 session-only 的 queued-task model，例如 `QueuedTaskSnapshot` / `QueuedTaskEntry`，与 durable `TaskRecord` 分离。

同时扩展 `ImagenSessionSnapshot` 的 public contract：

- `queuedTasks: readonly SessionQueuedTaskSnapshot[]`
- collection 顺序就是当前 FIFO queue 顺序；UI 可直接按索引推导 position
- 每个 `SessionQueuedTaskSnapshot` 至少包含：
  - `taskId`
  - `createdAt`
  - `profileId`
  - `operation`
  - `prompt`
  - optional `modelId`
  - `status` (`queued` | `starting`)
  - `removable`（仅 queued 为 true）
  - optional `jobId`（仅 dispatch handoff 已发生但首个 job snapshot 尚未完全接管时存在）
- `queuedTasks` 只表示 pre-dispatch work；真正已 dispatch 的 running / terminal execution 仍继续使用现有 `jobs`

每个 queued task 至少包含：

- queue entry id / stable task id
- createdAt / enqueue order
- frozen request snapshot
- profileId
- operation
- current queue status (`queued` / `starting`)
- optional bound execution `jobId`

原因：

- 当前 `TaskRecord` 只有 `running | completed | failed | interrupted`，且 durable 语义已经稳定。
- `interrupted` 已被占用为“app restart 前未完成的 stale running task”。
- 本次不想为了 session-only queue 扩 durable schema。
- 现有 app bridge 只有 `useImagenSession()`；在 snapshot contract 里显式区分 `queuedTasks` 与 `jobs`，比让 UI 猜测 `Job.status='created'` 更稳定。

备选方案：

- 给 `TaskRecord` 直接加 `queued`。缺点是 durable schema 会提前承担 session-only 语义，且 restart 后如何恢复会立刻变成产品契约。

### 3. `submit` becomes enqueue acknowledgement, not terminal result await

`session.submitJob()` 不能继续保持“返回 final `CommandResult<Job>`”的主语义。队列化后，submit 应快速返回“已入队确认”，后续靠 session snapshot / subscription 驱动 UI 更新。

实现方向：

- submit 时先做本地同步校验；校验失败直接返回，不创建 queued entry、`TaskRecord`、或 provider request。
- submit 校验通过后只做冻结 snapshot、创建 queued entry、发布 session snapshot，并返回 enqueue acknowledgement。
- scheduler 在 slot 可用时，才调用现有 `commands.submitJob()` 进入真实执行链。
- UI round 不再依赖一次 `await` 得到终态结果，而是观察 queue entry / bound `jobId` 的状态推进。

原因：

- 如果 submit 仍 await terminal result，用户体验上仍被长请求绑住，队列只会沦为内部实现细节。

备选方案：

- 保持现有 API，不改返回值，只在内部偷偷排队。缺点是 app hook 仍会等待太久，不能真正释放交互。

### 4. Running `TaskRecord` is created only when dispatch really starts

当前 app 在 submit 前就写 `createRunningTaskRecord(...)`。本次改为：

- queued 阶段只存在于 session queue model。
- 真正获得调度 slot、准备调用 `commands.submitJob()` 前，再创建 `running` `TaskRecord`，并继续沿用 `__clientTaskId` 绑定 terminal flush。
- terminal flush 仍走现有 `completed` / `failed` 写回链路。
- `starting` → `running` 交接期间，started task 的 restart / stale-running cleanup 继续沿用现有 durable recovery contract。

跨边界实现说明：

- 当前 `apps/app/src/shared/domain/task-snapshot.ts` 里的 `createRunningTaskRecord()` 依赖 `HostImageAsset` / `PlacementIntent` 等 app 类型，不能由 `packages/application` 的调度器直接调用。
- 因此入队前 app surface 必须把 `ConversationAttachment` 转成 provider-dispatchable 的 `Asset[]` 与 `TaskPlacement`，并把序列化后的请求证据随 frozen snapshot 交给 session；调度器在 dispatch 时只创建最小 `running` `TaskRecord`（taskId / operation / profileId / modelId / prompt / attachments / placement 等可序列化字段）。
- 若 frozen snapshot 中已包含完整 `TaskAttachment[]` 与 `TaskPlacement`，调度器可直接调用 `TaskStore.put()`，无需再引用 app 层对象。

原因：

- queued 不应伪装成 running。
- 队列不持久化，因此 queued 不该污染 durable task history。
- 保持 `packages/application` 不反向依赖 `apps/app` 的 UI / host 类型。

备选方案：

- 继续在 submit 瞬间写 `running` task record。缺点是历史会错误显示“正在运行”，即使任务其实还没真正发请求。

### 5. Scheduler uses FIFO with global and per-profile slot checks

scheduler 维护一个全局有序队列，并在每次调度时选择“最早入队且满足 profile slot 条件”的任务启动。

规则：

- 全局运行中任务数 `< 5` 才允许启动新任务。
- 某 profile 运行中任务数 `< 2` 才允许启动该 profile 的 queued task。
- 不做人工优先级；顺序只由 enqueue time 决定。
- 如果队首任务因 profile limit 暂时无法启动，可以扫描后续队列，找到最早的可启动任务，以避免全局 slot 空转。
- `global=5` / `per-profile=2` 在本次是 product-owned constants，不对用户暴露配置；实现必须把它们集中在 `packages/application/src/session/queue-policy.ts` 导出的 `MAX_RUNNING_TASKS_GLOBAL = 5` 与 `MAX_RUNNING_TASKS_PER_PROFILE = 2`，禁止在 UI / tests / scheduler 中重复写字面量。调度器与测试只引用这两个导出，未来调整产品时只改该 seam。

原因：

- 纯“队首阻塞”会在一个 profile 被打满时浪费其他 profile 的空闲并发。
- 仍保持“每个 profile 内 FIFO、公平且可解释”。

备选方案：

- 严格全局队首阻塞。缺点是 profile 热点会拖垮整体吞吐。
- 复杂优先级/加权公平调度。超出本次需求。

### 6. UI must remove global running lock, but keep same-task dedupe

app surface 取消全局 `conversation.running` 风格的编辑/提交门禁，只保留必要的同 tick / 同 task 去重。

保留：

- 同一 queued/running entry 的 remove/retry 去重。
- 同一按钮的 burst 防抖。

去除：

- “只要有一个 running task，就禁整个 composer”的逻辑。
- “新 submit 会直接 abort 旧 submit”的单飞行为。

原因：

- 用户目标就是在等待 A 时继续编辑并入队 B/C/D。

备选方案：

- 保留全局锁，只把 queue 做成后台执行。缺点是无法兑现产品目标。

### 7. Queued state is required on active session surfaces, not durable history

本次要求 queued phase 在 active session surface 可见，默认 owner 是 `useConversation()` / `MainPage` 这一组 live surfaces；durable history 继续只基于 `TaskRecord`。

规则：

- `MainPage` conversation flow 必须能显示 queued state、FIFO position、和 pre-dispatch remove affordance。
- `HistoryPage` / `listTaskRecords()` 不得伪造 queued-only durable rows。
- 如果 future history-like surface 想同时展示 queued work，也必须从 live session state 推导，而不是扩 `TaskRecord` schema。

原因：

- 现有 product history contract 已以 `TaskRecord` 为 durable truth。
- 把 queued-only state 强塞进 durable history，会把本次 session-only 变更扩大成 persistence redesign。

备选方案：

- 让 durable history 也承载 queued rows。缺点是会提前引入 schema / reload / recovery 契约。

### 8. Result handling and writeback remain manual and serialized

任务完成后只更新 round/task 展示与资源可用性，不自动 place、不创建待应用或“ignored”状态、不并发写回 Photoshop。

原因：

- 生成并发与 Photoshop host writeback 是两条不同边界。
- 自动应用会把“多个结果同时完成”的协调复杂度推到 host 层。

备选方案：

- 引入 auto-apply / pending-apply queue。当前明确不需要。

## Commonality Analysis

| 组件 / 能力 | 决策 | 说明 |
| --- | --- | --- |
| `packages/application/src/session/session.ts` | Extend | 保留 `ImagenSessionController` 接口与订阅模型，新增 `queuedTasks` snapshot 字段与 `removeQueuedTask()` 方法；`submitJob()` 返回值从 `CommandResult<Job>` 改为 `CommandResult<EnqueueAcknowledgement>`。 |
| `packages/application/src/commands/submit-job.ts` | Reuse | 调度器在 slot 可用时直接调用现有 `commands.submitJob()`，复用 profile dispatch、model resolution、provider invoke、retry / failover 全链路。 |
| `packages/core-engine` runtime / store | Reuse | 继续用 `runtime.runWorkflow()` 创建执行 job，不扩展 `JobStatus` 或 runner contract 来承载 queued 状态。 |
| `inFlightSubmit` dedupe (`__clientRoundId`) | Extend | 保留现有按 roundId 的去重 registry，但锁的粒度只覆盖“入队确认”窗口，不再覆盖整个 provider 执行周期。 |
| `TaskRecord` / `TaskStore` | Extend | 不改变 durable schema；调度器在 dispatch 前写入 `running` record，终态仍走现有 `completed` / `failed` flush。 |
| `apps/app/src/shared/domain/task-snapshot.ts` | Extend | `createRunningTaskRecord()` 继续负责把 app 类型转成 `TaskRecord`，但调用时机从 submit-time UI 提前到入队前准备 frozen snapshot 时；调度器复用其产物。 |
| `useConversation()` | Extend | 保留 round 生命周期与附件/预览管理，改为消费 `queuedTasks + jobs`，并移除全局 `running` 门禁。 |
| `MainPage` | Extend | 保留现有渲染结构，增加 queued state 展示与 remove affordance，移除 `conversation.running` 导致的 capture / readiness 全局禁用。 |
| `JobStatus='created'` | 不扩展 | 现有 core-engine 的 `created` 仍表示“job 已创建但尚未开始运行”，与本次 session-only queued 语义不同；queued 状态由 session queue model 承载，避免把 session-only 语义下沉到 execution kernel。 |
| Session queue model (`QueuedTaskEntry` / `QueuedTaskSnapshot`) | New (dedicated) | 这是本次 change 的新边界，专门承载 pre-dispatch 的 session-only 状态；durable history 不继承该模型。 |

## Risks / Trade-offs

- [Session API semantics change] → `submit` 从“等终态”改成“确认入队”，会牵动 app hook、tests、round 更新路径。缓解：把改动集中在 `packages/application/src/session/*` 和 `apps/app` conversation binding，避免污染 provider/core contracts。
- [Queued/running 双模型增加复杂度] → session queue model 与 durable task history 会并存。缓解：明确 queued 永不落 durable，running 才进入 `TaskRecord`。
- [Profile slot fairness ambiguity] → 若严格只看全局队首，容易空转；若允许跳过队首，又要定义公平性。缓解：采用“全局按 enqueue 排序、选择最早可启动项”的简单规则，并在 design/spec 里明确。
- [No cancel may surprise users] → 看到 running task 但不能取消。缓解：当前不暴露假能力，并保留未来 capability seam。
- [Reload drops queued work] → 用户若未意识到 session-only 约束，可能在 reload 后丢队列。缓解：queued 明确不写入 durable history，UI 文案后续可提示“仅在当前会话保留”。
- [Canonical doc drift] → repo authority docs 当前还写着“send creates a running task”与 `conversation.running` 全局锁。缓解：实现落地时同步更新 `docs/ENGINEERING_CONTEXT.md`。

## Migration Plan

1. 先新增 application queue model 和 scheduler，不改 provider/core contracts。
2. 调整 session public API，让 `submitJob()` 返回 enqueue acknowledgement，新增 `removeQueuedTask()`，并通过 snapshot/subscription 暴露 `queuedTasks + jobs` 状态。
3. 调整 app conversation flow：queued 阶段不写 durable `TaskRecord`，真正 dispatch 时才创建 running record。
4. 移除 app 层全局运行锁，让 `MainPage` conversation 消费 `queuedTasks + jobs`；durable history 继续保持 `TaskRecord` 边界。
5. 补 targeted tests，覆盖 enqueue ack、FIFO、并发上限、queue removal、snapshot freeze、reload drop 语义。
6. 实现落地时同步更新 `docs/ENGINEERING_CONTEXT.md`，移除“send 立即创建 running task”与 `conversation.running` 全局门禁的旧描述。

无需数据迁移。已有 durable `TaskRecord` / `DurableJobRecord` schema 保持不变；回滚时只需移除 queue owner 与 UI queue surfaces。

## Open Questions

- 当前没有必须阻塞设计的开放问题。
- spec 已将 `submitJob()` 定义为返回 enqueue acknowledgement；实现期若兼容旧调用方成本过高，可在内部保持 `submitJob()` 作为 facade，再新增 `enqueueTask()` 别名，但对外行为必须与 spec 一致。
