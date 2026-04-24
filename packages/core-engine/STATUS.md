# Core Engine Status

## 1. Confirmed Baseline

### Responsibilities
- 共享 runtime 类型与错误模型（Job、Workflow、Provider、Asset、Error）
- serializable / immutable 边界守卫
- in-memory job store 与 lifecycle event bus
- workflow registry、runner、runtime 入口
- provider dispatch 的最小抽象边界
- job lifecycle 管理（created → running → completed / failed）
- workflow 执行顺序、input binding、step output handoff

### Boundaries
- 只负责 host-agnostic runtime，不触碰 host API
- 只通过抽象边界依赖其他层（ProviderDispatcher、WorkflowRegistry、adapter contract）
- 不理解 provider 参数语义（model / size / quality / background 等）
- 不直接依赖 `packages/providers` 内部实现细节
- job store 是状态真相，event bus 只做通知，不是状态本身
- workflow 是 declarative 输入，engine 负责 executable 执行与状态流转

### Non-goals
- UI state、CLI 参数解析
- Photoshop / UXP / DOM / Browser API
- 文件系统、网络请求
- provider config 持久化
- provider 参数解释与外部 API 响应解析
- durable job history、cancel / abandon / queue / scheduler / background recovery
- provider-specific transform 或 host writeback
- `StepKind` 中的 `transform`、`io` 执行（当前仅保留值，不视为已支持能力）

### Constraints
- 所有跨包结果必须 serializable；禁止用 `JSON.stringify` 作为边界校验
- workflow step handoff 必须视为 immutable
- 所有失败必须落到 `JobError` taxonomy，禁止 silent fallback
- 保持文件小、控制流浅、失败显式
- engine 不反向拥有 provider / workflow 语义

---

## 2. Open Questions / Risks

- [x] ~~provider dispatch 抽象边界的 exact input / output / error 形状未定，需实现时收敛。~~ → 已收敛：`ProviderDispatchAdapter` 以 `provider` + `dispatch(params)` 暴露最小适配接口；`ProviderDispatcher` 收敛为 `dispatch(ref: ProviderRef)`；`createProviderDispatcher()` 负责 adapter 查找、serializable / immutable 边界校验与 `JobError` 映射；`dispatchProvider()` 作为 runner 未来可复用的统一调用入口。
- [x] ~~event bus 的具体事件类型列表与 payload 形状未定。~~ → 已收敛：`JobEventType` = `'created' | 'running' | 'completed' | 'failed'`；`JobEvent` 为 discriminated union（`type` + `job`）；`on` 返回 `Unsubscribe`；`emit` 同步且异常隔离。
- [x] ~~job store 的 exact API（尤其是 `retryJob` 语义与错误处理路径）待实现时收敛。~~ → 已收敛：`JobStore`（`submitJob` / `getJob` / `retryJob`）与 `JobStoreController`（`markRunning` / `markCompleted` / `markFailed`）读写分离；`retryJob` 复制 `input` 并记录 `originJobId` + `retryAttempt`；状态转换非法时抛 `JobError`（`category: 'runtime'`）。
- [x] ~~zustand 在 store 中的使用方式未定。~~ → 已决定不引入 zustand；当前实现为纯 `Map<string, InternalJobRecord>` + 浅 clone + `assertImmutable`，event bus 提供观察通道。
- [ ] 默认 workflow 的长期形态未定 (tentative)。
- [ ] runtime 与 future facade / CLI 的最终装配位置未定 (tentative)。
- [ ] 与 `providers`、`workflows` 的真实集成程度尚未验证。

---

## 3. Planned Changes (Ordered)

### Change 1: bootstrap-core-engine-scaffold ✓
- **goal**: 建立模块最小可编译骨架与入口文件。
- **scope**: `src/index.ts`（最小桩导出，使模块可被 import 和编译）、`package.json` 脚本修正（clean 跨平台兼容）。
- **out_of_scope**: 任何运行时逻辑、类型定义、测试、文档修正（STATUS.md 偏差已在此版本中预先修正）。
- **why_now**: 当前模块无法编译且无入口，必须先让模块可被 import 和构建，才能叠加后续变更。
- **depends_on**: 无。
- **touches**: `src/index.ts`, `package.json`。
- **openspec**: completed

### Change 2: define-core-shared-types ✓
- **goal**: 定义 Job、Workflow、Step、ProviderRef、Asset、Runtime 核心共享类型。
- **scope**: `src/types/` 下的类型定义与聚合导出。
- **out_of_scope**: 错误模型、边界守卫实现、执行逻辑。
- **why_now**: 所有后续部件（store、events、runner、dispatch）都依赖这些类型契约；必须在任何实现之前固化。
- **depends_on**: `bootstrap-core-engine-scaffold` ✓
- **touches**: `src/types/job.ts`, `src/types/workflow.ts`, `src/types/provider.ts`, `src/types/asset.ts`, `src/types/index.ts`, `src/index.ts`（更新类型导出）。
- **actual_outcome**: 已按领域拆分为 `job.ts`（`JobStatus`、`Job`、`JobInput`、`JobOutput`、`JobStore`）、`workflow.ts`（`StepKind`、`Step`、`Workflow`）、`provider.ts`（`ProviderRef`、`ProviderDispatcher`）、`asset.ts`（`AssetType`、`Asset`）；`types/index.ts` 聚合并统一导出；`src/index.ts` 已更新为 re-export 所有公共类型；模块编译通过。
- **openspec**: completed

### Change 3: define-error-taxonomy ✓
- **goal**: 定义 `JobError` 统一错误结构与分类。
- **scope**: `src/errors.ts`，包括错误类型定义与创建辅助函数。
- **out_of_scope**: invariant guards、store 实现、runner 实现。
- **why_now**: 失败显式是核心原则；store 的状态转换、runner 的执行路径、dispatch 的边界失败都需要统一的错误契约。
- **depends_on**: `define-core-shared-types` ✓
- **touches**: `src/errors.ts`, `src/index.ts`（更新导出）。
- **actual_outcome**: 已创建 `src/errors.ts`，定义 `ErrorCategory` string literal union（`'validation' | 'provider' | 'runtime' | 'workflow' | 'unknown'`）与 `JobError` interface（`category`、`message`、`details?`）；实现 5 个工厂函数（`createValidationError`、`createProviderError`、`createRuntimeError`、`createWorkflowError`、`createUnknownError`），返回 `Object.freeze` 后的 plain object；`src/index.ts` 已追加 `./errors.js` re-export；模块编译通过。
- **openspec**: completed

### Change 4: define-invariant-guards ✓
- **goal**: 实现 serializable / immutable 边界守卫。
- **scope**: `src/invariants.ts`，提供跨包边界校验与不可变保护辅助函数。
- **out_of_scope**: 运行时状态管理、事件发射、工作流执行。
- **why_now**: PRD 要求所有跨包结果 serializable、step handoff immutable；这是基础设施契约，runner 的 binding / handoff 需要它。
- **depends_on**: `define-core-shared-types` ✓, `define-error-taxonomy` ✓
- **touches**: `src/invariants.ts`, `src/index.ts`（更新导出）。
- **actual_outcome**: 已创建 `src/invariants.ts`，实现 `assertSerializable`（递归拒绝 function / symbol / undefined / 循环引用，抛出 `JobError`）、`assertImmutable<T>`（对对象/数组执行 `Object.freeze` 并返回 `Readonly<T>`，primitive 透传）、`safeStringify`（循环引用降级为 `"[Circular]"`，`BigInt` 转字符串）；`src/index.ts` 已追加 `./invariants.js` re-export；模块编译通过。
- **openspec**: completed

### Change 5: implement-state-infrastructure ✓
- **goal**: 实现 in-memory job store 与 lifecycle event bus。
- **scope**: `src/store.ts`（submitJob / getJob / retryJob + 最小状态机 created/running/completed/failed）、`src/events.ts`（createJobEventBus + lifecycle 事件）、`src/types/events.ts`（JobEvent / JobEventType / JobEventBus / Unsubscribe）。
- **out_of_scope**: workflow runner、provider dispatch、持久化、cancel / queue。
- **why_now**: store 是状态真相，event bus 是 facade 观察状态的主要方式；两者是 runner 与 runtime 的必要基础设施。
- **depends_on**: `define-core-shared-types` ✓, `define-error-taxonomy` ✓, `define-invariant-guards` ✓
- **touches**: `src/store.ts`, `src/events.ts`, `src/types/events.ts`, `src/index.ts`（更新导出）。
- **actual_outcome**: 
  - `src/store.ts`：`createJobStore()` 返回 `{ store: JobStore, controller: JobStoreController }`；内部使用 `Map<string, InternalJobRecord>`；`submitJob` 校验 `assertSerializable`、id 生成优先 `crypto.randomUUID()` fallback 到 timestamp+counter+random；`getJob` 经 `toSnapshot` 返回 immutable snapshot；`retryJob` 仅接受 `failed`、复制 `input`、记录 `originJobId` 与递增 `retryAttempt`；`controller` 提供 `markRunning` / `markCompleted` / `markFailed`，经显式 transition table 校验（`created→running`、`running→completed/failed`、terminal state 不可迁移），非法迁移抛 `JobError`（`category: 'runtime'`）；所有对外返回值经浅 clone + `assertImmutable` 与内部 mutable record 隔离。
  - `src/events.ts`：`createJobEventBus()` 返回 `JobEventBus`；`on(type, handler, filter?)` 支持按 `jobId` 过滤并返回 `unsubscribe`；`onAny(handler)` 订阅全部事件并返回 `unsubscribe`；`off(type, handler)` 保留为低阶 API；内部 `emit(event)` 同步按注册顺序调用匹配处理器，逐 listener `try/catch` 异常隔离，不污染 engine 主流程。
  - `src/types/events.ts`：新增 `JobEventType`、`JobEvent` discriminated union、`Unsubscribe`、`JobEventBus` 接口。
  - `src/index.ts` 已追加 `./store.js` 与 `./events.js` re-export；移除了早期 bootstrap placeholder；编译通过。
- **openspec**: completed

### Change 6: implement-workflow-registry-and-dispatch ✓
- **goal**: 实现 workflow registry 与 provider dispatch 抽象边界。
- **scope**: `src/registry.ts`（workflow 注册与按名查找）、`src/dispatch.ts`（ProviderDispatcher 类型与最小适配接口）。
- **out_of_scope**: runner 执行逻辑、provider 参数语义解释、transform / io step。
- **why_now**: registry 提供 runner 的输入（workflow spec），dispatch 提供 runner 的输出边界（provider 调用抽象）；两者是 runner 的依赖侧，可独立验证。
- **depends_on**: `define-core-shared-types` ✓, `define-error-taxonomy` ✓
- **touches**: `src/registry.ts`, `src/dispatch.ts`, `src/index.ts`（更新导出）。
- **actual_outcome**:
  - `src/types/workflow.ts`：新增 `WorkflowRegistry` 接口，最小公开面为 `register` / `get` / `list`。
  - `src/registry.ts`：新增 `createWorkflowRegistry()`；注册时校验 workflow name（含 `typeof` 防护）、step name（含 `typeof` 防护）、`kind` 合法性（`VALID_STEP_KINDS` 白名单）、`outputKey` 的最小 shape，并对 `input` 做 `assertSerializable`；内部以 `Map<string, Workflow>` 保存 immutable snapshot；`steps` 数组与 `step.input` 均显式 `assertImmutable` 以确保浅拷贝后的 freeze 生效，避免 `Object.freeze` 对嵌套结构的遗漏；提供按名读取与按注册顺序列出。
  - `src/types/provider.ts`：将早期函数别名收敛为 `ProviderDispatcher` 接口，并新增 `ProviderDispatchAdapter` 最小适配接口（`provider` + `dispatch(params)`）。
  - `src/dispatch.ts`：新增 `createProviderDispatcher()` 与 `dispatchProvider()`；`normalizeProviderRef` 对 `provider` 做 `typeof === 'string'` + `trim().length` 双重校验，防止运行时传入 `undefined` 抛出原生 `TypeError`；adapter 查找与执行路径对 `ProviderRef` 和返回结果执行 `assertSerializable`；对 object/array 结果先浅拷贝切断引用，再经局部 `deepFreeze` 递归冻结所有层级（`assertImmutable` 仅做浅 freeze，不足以保护嵌套对象），最后把未知异常映射为 `JobError`（优先保留已是 `JobError` 的错误）。
  - `src/index.ts`：已追加 `./registry.js` 与 `./dispatch.js` re-export。
  - `src/registry.test.ts`（9 tests）：覆盖 happy path、initialWorkflows、空 name、空 step name、非法 kind、空 outputKey、非 serializable input、immutability 全链路验证。
  - `src/dispatch.test.ts`（11 tests）：覆盖 happy path、adapter 缺失、JobError 透传、普通 Error 映射为 `JobError`、空 provider、非 serializable params / result、adapter 重复注册、adapter provider 为空、deep freeze 嵌套结构验证、`dispatchProvider` 基础委托。
- **openspec**: completed

### Change 7: implement-runner-and-runtime ✓
- **goal**: 实现 workflow runner 与 runtime 组装入口，当前仅支持 `provider` step。
- **scope**: `src/runner.ts`（顺序执行 step、input binding、output handoff）、`src/runtime.ts`（`createRuntime` 组装 store + events + registry + dispatch + runner）。
- **out_of_scope**: `transform` / `io` step 执行、provider 参数语义解释、host writeback。
- **why_now**: 这是 engine 的核心执行链路，必须在所有基础部件（types、errors、store、events、registry、dispatch）就位后才能整合。
- **depends_on**: `implement-state-infrastructure` ✓, `implement-workflow-registry-and-dispatch` ✓, `define-invariant-guards` ✓
- **touches**: `src/runner.ts`, `src/runtime.ts`, `src/index.ts`（更新导出）。
- **actual_outcome**:
  - `src/runner.ts`：新增 `RunnerDeps` 接口与 `executeWorkflow()` 函数；执行流程为 markRunning → 顺序遍历 step → markCompleted / markFailed；`provider` step 通过 `ProviderDispatcher.dispatch()` 调用；input binding 支持 `${outputKey}` 占位符递归替换（字符串精确匹配时替换为原始值，对象/数组递归遍历）；output handoff 按 `outputKey`（默认 `name`）发布到上下文；非法 `kind` 抛出 `JobError`（`category: 'workflow'`）；所有输出经 `assertImmutable` 保护。
  - `src/runtime.ts`：新增 `Runtime` / `RuntimeOptions` 接口；`createRuntime()` 组装默认 store、event bus、registry、dispatcher，支持 `initialWorkflows` 与 `adapters` 预填充；返回的 `runtime.runWorkflow()` 管理完整 lifecycle（submitJob → emit created → executeWorkflow → emit completed/failed）；同时导出独立 `runWorkflow()` 函数供手动装配场景使用。
  - `src/index.ts`：追加 `./runner.js` 与 `./runtime.js` re-export；公开面新增 `executeWorkflow`、`runWorkflow`、`createRuntime`、`RunnerDeps`、`Runtime`、`RuntimeOptions`。
  - `src/runner.test.ts`（8 tests）：覆盖顺序执行、input binding、unbound key 透传、outputKey、非法 kind、workflow 未找到、provider 失败、output immutability。
  - `src/runtime.test.ts`（7 tests）：覆盖 createRuntime 组装、initialWorkflows/adapters 初始化、runWorkflow 成功路径、workflow 未注册、事件发射（completed / failed）、独立 `runWorkflow` 手动装配。
- **openspec**: completed

---

## 4. Execution Order

1. **bootstrap-core-engine-scaffold** → 解决模块无法编译、无入口的问题；修正文档与代码的严重不一致。
2. **define-core-shared-types** → 建立所有后续部件依赖的类型契约。
3. **define-error-taxonomy** → 建立统一错误模型，为状态转换和边界失败提供契约。
4. **define-invariant-guards** → 建立数据边界校验，为跨包通信和 step handoff 提供保护。
5. **implement-state-infrastructure** → 建立状态真相（store）与观察机制（events），是 runner 的基础设施。
6. **implement-workflow-registry-and-dispatch** → 建立 workflow 查找能力与 provider 调用抽象边界，是 runner 的输入与输出侧依赖。
7. **implement-runner-and-runtime** → 整合所有部件完成核心执行链路，提供统一 runtime API。

排序理由：骨架 → 类型契约 → 错误与守卫 → 状态基础设施 → 执行边界 → 执行与组装。每一层只依赖已固化的下层契约，避免在不稳定地基上构建 runner。

---

## 5. Next OpenSpec Change

（当前所有 planned changes 已完成。下一步待定：验证与 `providers`、`workflows` 的真实集成，或根据 host 层需求调整 facade 装配方式。）

---

## 6. Notes

- **当前实际文件状态**：`src/index.ts` 已创建并 re-export `./types/index.js`、`./errors.js`、`./invariants.js`、`./store.js`、`./events.js`、`./registry.js`、`./dispatch.js`、`./runner.js`、`./runtime.js`；`src/types/` 下已创建 `job.ts`、`workflow.ts`、`provider.ts`、`asset.ts`、`events.ts`、`index.ts`；`src/errors.ts`、`src/invariants.ts`、`src/store.ts`、`src/events.ts`、`src/registry.ts`、`src/dispatch.ts`、`src/runner.ts`、`src/runtime.ts` 已创建；`src/runner.test.ts`（8 tests）、`src/runtime.test.ts`（7 tests）已创建并通过。
- **SPEC.md 公开面与实际导出的差异**：SPEC.md 目标公开面列出 `runWorkflow`、`createRuntime`。实际导出除这两者外，还暴露了底层的 `executeWorkflow` 与 `RunnerDeps`、`Runtime`、`RuntimeOptions` 类型。这些额外导出为手动装配场景提供灵活性，不破坏现有接口约定；如后续需要收敛公开面，应另起 change 处理。
- **暂定项标记**：默认 workflow 的长期形态、runtime 与 facade / CLI 的最终装配位置、更细的测试矩阵，均按 SPEC.md 标记为 tentative；不应在实现中写成既定事实。
- **zustand 已决定不采用**：`package.json` 虽仍依赖 zustand，但 `implement-state-infrastructure` 中已明确 store 实现为纯 `Map` + 浅 clone + `assertImmutable`，event bus 提供观察通道；zustand 的 reactivity 对 engine 内部并非必需。如需移除 `package.json` 中的 zustand 依赖，应另起 change 处理。
- **测试文档**：当前不单独创建 `TESTING.md`；测试实践待 runner 与 runtime 稳定后再评估，与 README.md / SPEC.md 的口径一致。
- **StepKind 保留值**：`transform`、`io` 当前只应视为保留值，不能视为已支持能力；runner 实现时不得引入这两种 step 的执行逻辑。
