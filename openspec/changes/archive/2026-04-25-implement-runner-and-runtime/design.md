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

### Decision 5: `createRuntime` 通过 `initialWorkflows` 与 `adapters` 完成初始化
**Rationale**: 让 runtime 在创建时即可注入宿主提供的 workflow 与 provider adapter，避免在 app 层手动操作 registry / dispatcher。`initialWorkflows` 在创建后立即注册到 `WorkflowRegistry`，`adapters` 在创建后立即注册到 `ProviderDispatcher`。
**Hot-update policy**: `initialWorkflows` 仅在 `createRuntime` 时一次性注入，runtime 本身不提供运行时热更新（动态增删 workflow）的封装。若 host 层需要在运行时修改 workflow 集合，应直接操作 `WorkflowRegistry` 的公共接口（如 `registry.register` / `registry.unregister`）。runtime 保持职责单一，不介入 workflow 的生命周期管理。
**Alternative**: 要求 app 层在 `createRuntime` 后手动调用 `registry.register` 与 `dispatcher.registerAdapter` — 被拒绝，因为这会把组装细节泄漏到 host 层，违背 runtime 作为统一入口的目标。

### Decision 6: 非法 step kind（`transform` / `io`）在执行时抛出 `JobError`
**Rationale**: 这些 kind 目前为保留值，尚无执行语义。若静默跳过，会导致用户误以为 step 已执行；若仅报错日志，则难以被调用方捕获。抛出 `JobError`（`category: 'workflow'`）与 workflow 未找到使用同一 category，表明问题属于 workflow 定义层。
**Alternative**: 静默跳过并记录 warn 日志 — 被拒绝，因为会掩盖配置错误。

### Decision 7: workflow 未找到时 `throw`，step 失败时 `resolve` with failed job
**Rationale**: workflow name 属于调用契约，未找到是前置校验失败，应在调用点立即暴露（`throw`）。step 失败属于业务执行结果，应收敛到 job 状态机，保证调用方始终能拿到一致的 `Job` 结构（包含 `status`、`error` 字段），便于统一处理。
**Alternative**: 统一全部 `throw` — 被拒绝，因为 step 失败也 throw 会迫使调用方同时处理异常和返回值两种路径，增加集成复杂度。

## Risks / Trade-offs

- **[Risk]** Input binding 的字符串替换可能误伤非模板字符串中碰巧包含 `${...}` 的文本。
  → **Mitigation**: 只替换与已有 `outputKey` 精确匹配的占位符；未匹配的不做替换。
- **[Risk]** 顺序执行导致长 workflow 的总耗时等于各 step 耗时之和。
  → **Mitigation**: 当前阶段刻意保持顺序执行；并行化是未来 change。
- **[Risk]** Runtime 组装方式尚未被真实 host 层验证。
  → **Mitigation**: `createRuntime` 的参数设计保持最小，未来 facade / CLI 集成时不应破坏现有接口。

## Migration Plan

- 本 change 为纯新增文件，无迁移步骤
- 回滚：删除 `packages/core-engine/src/runner.ts`、`packages/core-engine/src/runtime.ts` 并恢复 `packages/core-engine/src/index.ts` 到上一版本即可

## Open Questions

- runtime 与 facade / CLI 的最终装配位置仍为 tentative，待 host 层验证后收敛
- 默认 workflow 的长期形态未定，runtime 不应硬编码任何默认 workflow
