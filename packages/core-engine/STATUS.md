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

- [ ] provider dispatch 抽象边界的 exact input / output / error 形状未定，需实现时收敛。
- [ ] event bus 的具体事件类型列表与 payload 形状未定。
- [ ] job store 的 exact API（尤其是 `retryJob` 语义与错误处理路径）待实现时收敛。
- [ ] zustand 在 store 中的使用方式未定（`package.json` 已依赖，但 PRD / SPEC 未明确约束是否必须使用）。
- [ ] 默认 workflow 的长期形态未定 (tentative)。
- [ ] runtime 与 future facade / CLI 的最终装配位置未定 (tentative)。
- [ ] 与 `providers`、`workflows` 的真实集成程度尚未验证。

---

## 3. Planned Changes (Ordered)

### Change 1: bootstrap-core-engine-scaffold
- **goal**: 建立模块最小可编译骨架与入口文件。
- **scope**: `src/index.ts`（最小桩导出，使模块可被 import 和编译）、`package.json` 脚本修正（clean 跨平台兼容）。
- **out_of_scope**: 任何运行时逻辑、类型定义、测试、文档修正（STATUS.md 偏差已在此版本中预先修正）。
- **why_now**: 当前模块无法编译且无入口，必须先让模块可被 import 和构建，才能叠加后续变更。
- **depends_on**: 无。
- **touches**: `src/index.ts`, `package.json`。
- **openspec**: now

### Change 2: define-core-shared-types
- **goal**: 定义 Job、Workflow、Step、ProviderRef、Asset、Runtime 核心共享类型。
- **scope**: `src/types/` 下的类型定义与聚合导出。
- **out_of_scope**: 错误模型、边界守卫实现、执行逻辑。
- **why_now**: 所有后续部件（store、events、runner、dispatch）都依赖这些类型契约；必须在任何实现之前固化。
- **depends_on**: `bootstrap-core-engine-scaffold`
- **touches**: `src/types/job.ts`, `src/types/workflow.ts`, `src/types/provider.ts`, `src/types/asset.ts`, `src/types/index.ts`, `src/index.ts`（更新类型导出）。
- **openspec**: now

### Change 3: define-error-taxonomy
- **goal**: 定义 `JobError` 统一错误结构与分类。
- **scope**: `src/errors.ts`，包括错误类型定义与创建辅助函数。
- **out_of_scope**: invariant guards、store 实现、runner 实现。
- **why_now**: 失败显式是核心原则；store 的状态转换、runner 的执行路径、dispatch 的边界失败都需要统一的错误契约。
- **depends_on**: `define-core-shared-types`
- **touches**: `src/errors.ts`, `src/index.ts`（更新导出）。
- **openspec**: now

### Change 4: define-invariant-guards
- **goal**: 实现 serializable / immutable 边界守卫。
- **scope**: `src/invariants.ts`，提供跨包边界校验与不可变保护辅助函数。
- **out_of_scope**: 运行时状态管理、事件发射、工作流执行。
- **why_now**: PRD 要求所有跨包结果 serializable、step handoff immutable；这是基础设施契约，runner 的 binding / handoff 需要它。
- **depends_on**: `define-core-shared-types`
- **touches**: `src/invariants.ts`, `src/index.ts`（更新导出）。
- **openspec**: now

### Change 5: implement-state-infrastructure
- **goal**: 实现 in-memory job store 与 lifecycle event bus。
- **scope**: `src/store.ts`（submitJob / getJob / retryJob + 最小状态机 created/running/completed/failed）、`src/events.ts`（createJobEventBus + lifecycle 事件）。
- **out_of_scope**: workflow runner、provider dispatch、持久化、cancel / queue。
- **why_now**: store 是状态真相，event bus 是 facade 观察状态的主要方式；两者是 runner 与 runtime 的必要基础设施。
- **depends_on**: `define-core-shared-types`, `define-error-taxonomy`
- **touches**: `src/store.ts`, `src/events.ts`, `src/index.ts`（更新导出）。
- **openspec**: later

### Change 6: implement-workflow-registry-and-dispatch
- **goal**: 实现 workflow registry 与 provider dispatch 抽象边界。
- **scope**: `src/registry.ts`（workflow 注册与按名查找）、`src/dispatch.ts`（ProviderDispatcher 类型与最小适配接口）。
- **out_of_scope**: runner 执行逻辑、provider 参数语义解释、transform / io step。
- **why_now**: registry 提供 runner 的输入（workflow spec），dispatch 提供 runner 的输出边界（provider 调用抽象）；两者是 runner 的依赖侧，可独立验证。
- **depends_on**: `define-core-shared-types`, `define-error-taxonomy`
- **touches**: `src/registry.ts`, `src/dispatch.ts`, `src/index.ts`（更新导出）。
- **openspec**: later

### Change 7: implement-runner-and-runtime
- **goal**: 实现 workflow runner 与 runtime 组装入口，当前仅支持 `provider` step。
- **scope**: `src/runner.ts`（顺序执行 step、input binding、output handoff）、`src/runtime.ts`（`createRuntime` 组装 store + events + registry + dispatch + runner）。
- **out_of_scope**: `transform` / `io` step 执行、provider 参数语义解释、host writeback。
- **why_now**: 这是 engine 的核心执行链路，必须在所有基础部件（types、errors、store、events、registry、dispatch）就位后才能整合。
- **depends_on**: `implement-state-infrastructure`, `implement-workflow-registry-and-dispatch`, `define-invariant-guards`
- **touches**: `src/runner.ts`, `src/runtime.ts`, `src/index.ts`（更新导出）。
- **openspec**: later

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

- **name**: `bootstrap-core-engine-scaffold`
- **reason**: 当前模块 `src/` 目录几乎为空，`STATUS.md` 却错误声称大量文件已存在；必须先建立最小可编译骨架和正确的文档记录，才能在此基础上叠加任何类型或逻辑。
- **expected outcome**: 模块可通过 `tsc` 编译；存在最小 `src/index.ts` 桩导出；`package.json` clean 脚本在 win32 可执行；`STATUS.md` 的偏差记录被修正为与实际文件系统一致。

---

## 6. Notes

- **文档偏差已修正**：旧 STATUS.md 错误声称 `src/index.ts` 及多个 `src/*.ts` 文件已存在，现已按实际文件系统状态更新。根级 STATUS.md 声称 "已有 runtime 相关实现" 同样不准确，已在本文件中修正。
- **当前实际文件状态**：`src/` 下仅存在空目录 `types/`；`src/index.ts` 及 PRD 中列出的 `errors.ts`、`store.ts`、`events.ts`、`registry.ts`、`dispatch.ts`、`runner.ts`、`runtime.ts`、`invariants.ts` 均尚未创建。
- **暂定项标记**：默认 workflow 的长期形态、runtime 与 facade / CLI 的最终装配位置、更细的测试矩阵，均按 SPEC.md 标记为 tentative；不应在实现中写成既定事实。
- **zustand 保留为候选**：`package.json` 已依赖 zustand，但 PRD / SPEC 未明确要求 store 必须使用 zustand；它作为 store 实现的一个候选方案保留，最终是否采用应在 `implement-state-infrastructure` change 时根据接口收敛情况决定，并同步更新本 STATUS.md。
- **测试文档**：当前不单独创建 `TESTING.md`；测试实践待 runner 与 runtime 稳定后再评估，与 README.md / SPEC.md 的口径一致。
- **StepKind 保留值**：`transform`、`io` 当前只应视为保留值，不能视为已支持能力；runner 实现时不得引入这两种 step 的执行逻辑。
- **package.json clean 脚本**：已从 `rm -rf dist` 修正为跨平台兼容命令（见 `package.json`）。
