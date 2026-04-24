## Context

所有基础部件已就位：
- `store.ts`：提供 `JobStore`（submit/get/retry）与 `JobStoreController`（markRunning/markCompleted/markFailed）
- `events.ts`：提供 `JobEventBus`，支持按类型与按 jobId 过滤订阅
- `registry.ts`：提供 `WorkflowRegistry`，支持 workflow 注册与按名查找
- `dispatch.ts`：提供 `ProviderDispatcher` 与 `dispatchProvider`，完成 provider 调用抽象

当前缺失的核心链路：把上述部件串联为可执行 runtime。runner 负责解析 workflow spec 并按顺序执行 step；runtime 负责组装 store + events + registry + dispatch + runner 为统一入口。

## Goals / Non-Goals

**Goals:**
- 实现 `provider` step 的顺序执行，包括 input binding 与 output handoff
- 实现 `createRuntime()` 组装入口，对外暴露 `runWorkflow`
- 在 job lifecycle 关键节点发射事件（created、running、completed、failed）
- 所有 step 输出经 `assertImmutable` 保护，保证下游不可变
- 失败收敛到 `JobError`，不静默吞掉异常

**Non-Goals:**
- `transform` / `io` step 的执行（仍视为保留值）
- provider 参数语义解释
- host writeback、文件系统、网络请求
- cancel、queue、scheduler、background recovery
- 并行 step 执行

## Decisions

### Decision 1: runner 只接收 workflow name 与 job input，不直接接收 Workflow 对象
**Rationale**: runner 的输入侧应通过 `WorkflowRegistry` 查找，保持 registry 为唯一真相源。若允许直接传入 Workflow 对象，会破坏 registry 的约束边界（如 step 校验、immutability）。
**Alternative**: 允许 runner 直接执行 `Workflow` 对象 — 被拒绝，因为这会绕过 registry 的 normalize 与校验。

### Decision 2: input binding 采用简单 key 替换，不引入模板引擎
**Rationale**: 当前阶段 binding 需求仅为引用前序 step 的 outputKey。使用 `${outputKey}` 占位符做字符串替换足够，不引入 Handlebars 等模板引擎以降低复杂度。
**Future**: 若后续需要复杂表达式，再评估引入最小模板引擎。

### Decision 3: runtime 的 `runWorkflow` 返回 `Promise<Job>`，但事件 bus 仍为同步观察通道
**Rationale**: 执行是异步的（provider dispatch 为 `Promise`），因此 `runWorkflow` 必须返回 Promise。但事件订阅保持同步回调模式，与现有 `JobEventBus` 设计一致。

### Decision 4: runner 内部直接使用 `JobStoreController`，不通过 store 公共接口推进状态
**Rationale**: `JobStoreController` 的设计目的就是供 runner / runtime 内部使用。runner 作为 engine 内部组件，有权直接操作状态机。

## Risks / Trade-offs

- **[Risk]** Input binding 的字符串替换可能误伤非模板字符串中碰巧包含 `${...}` 的文本。
  → **Mitigation**: 只替换与已有 `outputKey` 精确匹配的占位符；未匹配的不做替换。
- **[Risk]** 顺序执行导致长 workflow 的总耗时等于各 step 耗时之和。
  → **Mitigation**: 当前阶段刻意保持顺序执行；并行化是未来 change。
- **[Risk]** Runtime 组装方式尚未被真实 host 层验证。
  → **Mitigation**: `createRuntime` 的参数设计保持最小，未来 facade / CLI 集成时不应破坏现有接口。

## Migration Plan

- 本 change 为纯新增文件，无迁移步骤
- 回滚：删除 `src/runner.ts`、`src/runtime.ts` 并恢复 `src/index.ts` 到上一版本即可

## Open Questions

- runtime 与 facade / CLI 的最终装配位置仍为 tentative，待 host 层验证后收敛
- 默认 workflow 的长期形态未定，runtime 不应硬编码任何默认 workflow
