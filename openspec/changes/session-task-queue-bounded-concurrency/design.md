## Context

当前实现把“提交任务”和“执行任务”几乎绑定在同一个同步用户动作里。`useConversation()` 在 app 层先写一个 `running` `TaskRecord`，然后直接 `await session.submitJob(...)`；`session.submitJob()` 再直接调用 `commands.submitJob()`，后者一路进入 `runtime.runWorkflow()` 与 provider dispatch。这样虽然底层是 `async/await`，但产品语义仍接近单 in-flight 流程：一次 submit 直到 provider 返回前，很难自然地继续组织更多任务。

这次变更要解决的是“长耗时生成期间继续工作”的问题，而不是把仓库升级成 durable background job platform。已确认的约束如下：

- 队列只在 session 内存在，不跨 app reload / restart 恢复。
- 调度顺序固定为 FIFO，不支持拖拽改优先级。
- 并发上限为 `global=5`、`per-profile=2`。
- queued task 可以在真正 dispatch 之前移出队列。
- running task 不承诺产品级 cancel；当前只保留底层 `AbortSignal` seam。
- 结果完成后仍由用户手动 place / download / ignore；不引入“待应用”状态。

## Goals / Non-Goals

**Goals:**

- 在 `packages/application` 引入 session-only 的 queue/scheduler owner。
- 把 submit 语义改成“快速确认入队”，而不是“等待 provider 终态”。
- 保证每个 queued task 在入队瞬间冻结自己的 prompt / attachments / model / output / placement snapshot。
- 用 FIFO + bounded concurrency 调度真实 execution job。
- 让 UI 在 queued / running 存在时继续允许编辑和新任务入队。
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

每个 queued task 至少包含：

- queue entry id / stable task id
- createdAt / enqueue order
- frozen request snapshot
- profileId
- operation
- current queue status (`queued` / `starting` / `running` / terminal view state)
- optional bound execution `jobId`

原因：

- 当前 `TaskRecord` 只有 `running | completed | failed | interrupted`，且 durable 语义已经稳定。
- `interrupted` 已被占用为“app restart 前未完成的 stale running task”。
- 本次不想为了 session-only queue 扩 durable schema。

备选方案：

- 给 `TaskRecord` 直接加 `queued`。缺点是 durable schema 会提前承担 session-only 语义，且 restart 后如何恢复会立刻变成产品契约。

### 3. `submit` becomes enqueue acknowledgement, not terminal result await

`session.submitJob()` 不能继续保持“返回 final `CommandResult<Job>`”的主语义。队列化后，submit 应快速返回“已入队确认”，后续靠 session snapshot / subscription 驱动 UI 更新。

实现方向：

- submit 时只做本地校验、冻结 snapshot、创建 queued entry、发布 session snapshot。
- scheduler 在 slot 可用时，才调用现有 `commands.submitJob()` 进入真实执行链。
- UI round 不再依赖一次 `await` 得到终态结果，而是观察 queue entry / bound `jobId` 的状态推进。

原因：

- 如果 submit 仍 await terminal result，用户体验上仍被长请求绑住，队列只会沦为内部实现细节。

备选方案：

- 保持现有 API，不改返回值，只在内部偷偷排队。缺点是 app hook 仍会等待太久，不能真正释放交互。

### 4. Running `TaskRecord` is created only when dispatch really starts

当前 app 在 submit 前就写 `createRunningTaskRecord(...)`。本次改为：

- queued 阶段只存在于 session queue model。
- 真正获得调度 slot、准备调用 `commands.submitJob()` 前，再创建 `running` `TaskRecord`。
- terminal flush 仍走现有 `completed` / `failed` 写回链路。

原因：

- queued 不应伪装成 running。
- 队列不持久化，因此 queued 不该污染 durable task history。

备选方案：

- 继续在 submit 瞬间写 `running` task record。缺点是历史会错误显示“正在运行”，即使任务其实还没真正发请求。

### 5. Scheduler uses FIFO with global and per-profile slot checks

scheduler 维护一个全局有序队列，并在每次调度时选择“最早入队且满足 profile slot 条件”的任务启动。

规则：

- 全局运行中任务数 `< 5` 才允许启动新任务。
- 某 profile 运行中任务数 `< 2` 才允许启动该 profile 的 queued task。
- 不做人工优先级；顺序只由 enqueue time 决定。
- 如果队首任务因 profile limit 暂时无法启动，可以扫描后续队列，找到最早的可启动任务，以避免全局 slot 空转。

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

### 7. Result handling and writeback remain manual and serialized

任务完成后只更新 round/task 展示与资源可用性，不自动 place、不创建待应用状态、不并发写回 Photoshop。

原因：

- 生成并发与 Photoshop host writeback 是两条不同边界。
- 自动应用会把“多个结果同时完成”的协调复杂度推到 host 层。

备选方案：

- 引入 auto-apply / pending-apply queue。当前明确不需要。

## Risks / Trade-offs

- [Session API semantics change] → `submit` 从“等终态”改成“确认入队”，会牵动 app hook、tests、round 更新路径。缓解：把改动集中在 `packages/application/src/session/*` 和 `apps/app` conversation binding，避免污染 provider/core contracts。
- [Queued/running 双模型增加复杂度] → session queue model 与 durable task history 会并存。缓解：明确 queued 永不落 durable，running 才进入 `TaskRecord`。
- [Profile slot fairness ambiguity] → 若严格只看全局队首，容易空转；若允许跳过队首，又要定义公平性。缓解：采用“全局按 enqueue 排序、选择最早可启动项”的简单规则，并在 design/spec 里明确。
- [No cancel may surprise users] → 看到 running task 但不能取消。缓解：当前不暴露假能力，并保留未来 capability seam。
- [Reload drops queued work] → 用户若未意识到 session-only 约束，可能在 reload 后丢队列。缓解：queued 明确不写入 durable history，UI 文案后续可提示“仅在当前会话保留”。

## Migration Plan

1. 先新增 application queue model 和 scheduler，不改 provider/core contracts。
2. 调整 session public API，让 submit 返回 enqueue acknowledgement，并通过 snapshot/subscription 暴露 queued/running state。
3. 调整 app conversation flow：queued 阶段不写 durable `TaskRecord`，真正 dispatch 时才创建 running record。
4. 移除 app 层全局运行锁，接入 queued/running/removable queue UI。
5. 补 targeted tests，覆盖 FIFO、并发上限、queue removal、snapshot freeze、reload drop 语义。

无需数据迁移。已有 durable `TaskRecord` / `DurableJobRecord` schema 保持不变；回滚时只需移除 queue owner 与 UI queue surfaces。

## Open Questions

- 当前没有必须阻塞设计的开放问题。
- 实现期若发现 `session.submitJob()` 兼容层过重，可再决定是否引入更明确的 `enqueueTask()` 新接口名；这不影响本次 proposal/spec 的行为边界。
