## Context

当前 `Provider.invoke()` 只能等待同步完成的 `ProviderInvokeResult`。Core Job 与 Application Session 通过 provider dispatch promise 获得 completed 或 failed Job；它们不拥有 Provider transport、远端任务 ID 或 polling 状态。现有 `ProviderDescriptor.invokeMode` 仅是无消费者的静态标签，不能表达实际异步执行。

部分中转会先返回远端任务引用，后续通过 Provider 专属结果接口查询。另一些 Provider 永远只有同步响应。系统须让两者共享同一 Job/UI 生命周期，同时避免把 GRSAI 或其他服务的 URL、状态枚举、认证和 response shape 变成跨包合同。

## Goals / Non-Goals

**Goals:**

- 在 `packages/application` 建立 runtime-composed async execution manager，统一提交后等待、timer、本地取消、hard budget 与单远端引用串行查询。
- 以可选 `ProviderAsyncLifecycle` 表示 Provider 是否支持异步提交与结果查询。
- 让 Provider 仅返回 canonical `pending`、`completed`、`failed`，并保留 Provider-local remote reference、wire status、poll interval 与错误分类。
- 保持 Core Job、Application Task、历史、Profile persistence 与 UI 的既有 `queued/running/completed/failed` 合同。
- 用 fake async Provider、fake clock 和 fake transport 证明提交至多一次、查询只针对同一 remote reference、同步 Provider 不回归。

**Non-Goals:**

- 不实现任何 GRSAI URL、请求 body、模型目录或真实请求。
- 不持久化 remote reference，不支持 UXP 重开恢复、远端取消、webhook 或后台 daemon。
- 不增加余额账本、退款、用户可见的 Provider wire status 或复杂 `outcome-unknown` UI。
- 不让 generic-compatible Provider 通过用户配置任意 result path、状态映射或 polling 参数。

## Decisions

### 1. async execution manager 属于 `packages/application` composition

manager 由 Application runtime 创建并注入 provider dispatch bridge。它以稳定 `jobId` 作为单次逻辑执行 key，管理 in-flight state、已启动 job 集合、timer 与 cleanup；同一 `jobId` 一旦已开始，至 manager dispose 前不得第二次 submit，即使前一次已进入 terminal state。Core retry 必须创建新 Job ID。bridge 输出仍是单个 `ProviderInvokeResult` 或 Provider error，因此 Core dispatcher 和 Application Session 不需要认识远端 protocol。

选择 Application 是因为 `packages/providers` 明确不得拥有 app/session state 或 Job lifecycle，且 Application runtime 已拥有 singleton composition。Provider package 只定义 host-neutral lifecycle types 与 injected `ProviderAsyncExecutionExecutor` port；它不保存 `jobId`、timer 或 in-flight map。Core engine 只补充通用 `jobId` execution context，仍不解释 Provider 语义。

manager 不是每个 Provider 手写的 polling loop。它接受 host-neutral clock/sleep 依赖，支持 deterministic fake tests；不依赖 Chrome、UXP 或 Node timer 之外的 host API。

### 2. 可选 lifecycle，而非改变所有 `invoke()` 返回值

现有 Provider 保持 `invoke()`。支持远端查询的 Provider 额外声明 `asyncLifecycle`：

```ts
submit(args) -> completed(result) | pending(remoteRef, nextPollAfterMs?)
poll(remoteRef, context) -> pending(nextPollAfterMs?, progress?) | completed(result) | failed(error)
```

dispatch bridge 选择 `asyncLifecycle` 时交给注入的 executor；否则直接调用 `invoke()`。executor 实现属于 Application manager。`remoteRef` 是 opaque、secret-free 的 provider execution value，只在该次 dispatch 内存活。静态 `invokeMode` 与 lifecycle 一致性由 registry/contract test 验证，但不能作为运行时路由唯一依据。

替代方案是把 `Provider.invoke()` 改为 union return。拒绝原因：现有每个 Provider、bridge、fake 和调用方都会被迫迁移，且同步路径失去最小合同。

### 3. 跨 Provider 仅归一化生命周期，不归一化 wire status

全局合同只有 `pending`、`completed`、`failed` 与可选、非权威 `progress`。Provider 自己解析 `running`、`violation`、`queued`、`retry_after`、结果 URL 与错误 body，并自行给出下一次可查询时间。`remoteRef` 可作为 secret-free、opaque 的 process-local 值从 lifecycle 短暂传递到 Application manager；Application 不得解释、记录、持久化或向 Core/UI 暴露它。其余远端状态、endpoint URL、task ID、认证、response schema 不得进入 Application/Core 的持久化或公共合同。

### 4. 提交与查询采用不同重试安全规则

manager 对单次 logical execution 最多调用一次 `submit()`。提交后只可以调用 `poll()` 于同一 `remoteRef`；Provider 将安全可重试 query failure 归一化为 `pending(nextPollAfterMs?)`，manager 因此只会再查同一 reference。未归一化异常、`failed`、取消、poll budget 耗尽或不可判定查询错误都会返回明确 provider failure，绝不再提交。

同步 Provider 的长请求仍只是原始 `invoke()` Promise。manager 可观察本地等待，但没有远端查询接口时不得假装知道远端结果，也不得自动重放超时请求。

### 5. 预算由 manager 强制，调度由 Provider 建议

manager 拥有 hard maximum poll count/elapsed time、AbortSignal、同一 remote reference 的 non-overlap 与资源清理。Provider 返回已验证的 `nextPollAfterMs` 或 query retry directive，适配服务限流和 `Retry-After`；manager 使用安全上限钳制，防止无界等待或 busy loop。budget 未配置时使用保守默认，并通过 fake clock 测试。abort 只停止本地等待/查询；本 change 不定义远端 cancel。

### 6. 首次实施只引入 fake async Provider

foundation 以 builtin/test-only fake lifecycle 覆盖 completed submission、pending-to-success、terminal failure、transient query failure、budget exhaustion、abort 和 no-resubmit。GRSAI 作为后续独立 `ApiFormat` change 接入，不阻塞本 change 的完成。

## Risks / Trade-offs

- [Provider lifecycle contract 过早固化] → 只暴露三态和 opaque reference；不暴露服务 wire schema，未来 Provider 可各自适配。
- [timer 在 UXP/Chrome 行为不同] → manager 注入 clock/sleep，contract test 不依赖真实时间；host runtime 仅提供正常 timer adapter。
- [提交后查询失败导致远端仍继续] → 单次提交、无自动 replay、结构化 provider failure；不持久化恢复。
- [轮询长期占用 Provider lane] → 维持既有 dispatch/job lane 语义；hard budget 防止无限占用。

## Migration Plan

1. 增加 lifecycle types、executor port、`jobId` execution context 与 fake tests，不迁移既有同步 Provider。
2. 在 Application runtime 创建 manager 并注入 dispatch bridge；证明所有 builtin sync Provider 保持结果与错误行为。
3. 更新 architecture/testing 文档与 contract tests。
4. 后续独立 change 添加首个真实 async Provider；回滚 foundation 即恢复同步-only dispatch，没有持久化数据迁移。

## Open Questions

- 默认 poll count、最大等待时长和 delay 上限须在实现时由现有 timeout policy 与 fake harness 共同确定；不得由 GRSAI 数据猜测。
- `progress` 是否在未来进入 UI 仍未决定；本 change 只允许其留在 provider execution diagnostics，不新增 UI consumer。
