## Context

`packages/core-engine` 刚完成 `bootstrap-core-engine-scaffold`，`src/index.ts` 仅包含占位符导出，`src/types/` 为空目录。所有后续变更——`define-error-taxonomy`、`define-invariant-guards`、`implement-state-infrastructure`、`implement-workflow-registry-and-dispatch`、`implement-runner-and-runtime`——都依赖一套稳定的共享类型契约。没有这些类型，store、event bus、runner、dispatch 的接口将无法收敛。

当前约束：
- 模块必须保持 host-agnostic，禁止引入 DOM / UXP / Photoshop / FS / 网络相关类型
- 所有跨包结果必须 serializable；类型层必须为这一约束提供基础
- `core-engine` 不反向拥有 `providers` 或 `workflows` 的语义，类型中不得出现 provider 参数解释或 workflow 具体业务逻辑

## Goals / Non-Goals

**Goals：**
- 定义并导出 Job、Workflow、Step、ProviderRef、Asset、Runtime 相关核心类型
- 类型定义保持 serializable（无函数、无 DOM/UXP 类型）和 immutable 语义倾向
- 按领域拆分文件（`job.ts`、`workflow.ts`、`provider.ts`、`asset.ts`），提供统一的 `types/index.ts` 聚合导出
- 更新 `src/index.ts` 以导出所有公共类型

**Non-Goals：**
- 错误模型（`JobError` taxonomy）的定义与实现
- 边界守卫（serializable / immutable 校验函数）的实现
- 任何运行时状态管理、事件发射或工作流执行逻辑
- provider 参数语义解释、外部 API 响应解析
- UI、CLI、Photoshop host 相关类型
- `transform` / `io` step 的执行语义（类型中仅保留值作为保留占位）

## Decisions

### 1. 按领域拆分类型文件
- **选择**：将类型按 `job.ts`、`workflow.ts`、`provider.ts`、`asset.ts` 拆分，而非写入单一大文件
- **理由**：与后续 `errors.ts`、`invariants.ts`、`store.ts` 等独立文件保持一致；避免单文件过大导致冲突；方便按需 import
- **替代方案**：单文件 `types.ts`（ rejected：不符合模块保持文件小的原则）

### 2. interface 与 type alias 混合使用
- **选择**：实体类型（`Job`、`Workflow`、`Step`、`Asset`）使用 `interface`，辅助联合类型与映射类型使用 `type`
- **理由**：`interface` 支持声明合并，便于后续在不修改原文件的情况下扩展（如插件注入额外字段）；`type` 更适合联合类型和复杂映射
- **替代方案**：全部使用 `type`（rejected：失去声明合并能力，不利于渐进扩展）

### 3. StepKind 仅保留声明值，不体现执行语义
- **选择**：`StepKind` 枚举或联合类型包含 `'provider' | 'transform' | 'io'`，但 `Workflow` / `Step` 类型中不描述这些 step 如何执行
- **理由**：执行语义由 `runner.ts` 负责，类型层只负责声明形状。当前阶段 `transform` 和 `io` 仅为保留值，runner 实现时不得引入其执行逻辑
- **替代方案**：在类型层就定义不同 step 的输入输出差异（rejected：过早固化会导致后续 runner 变更时类型频繁改动）

### 4. Asset 保持最小定义
- **选择**：`Asset` 仅定义 `type`（如 `'image'`）和承载数据的字段（如 `url`、`data` 等字符串或 Uint8Array 占位），不引入 Photoshop DOM 类型（如 `Layer`、`Document`）
- **理由**：`core-engine` 必须 host-agnostic；host 侧的具体资源表示应由 `app` 层或 adapter 处理，再转换为 engine 可理解的 serializable `Asset`
- **替代方案**：在 Asset 中直接引用 Photoshop UXP 类型（rejected：违反 host-agnostic 边界）

### 5. ProviderRef 与 ProviderDispatcher 保持抽象
- **选择**：`ProviderRef` 仅包含 provider 名称引用和最小参数对象；`ProviderDispatcher` 仅定义为函数类型签名，不描述具体 provider 的 HTTP 调用细节
- **理由**：`core-engine` 只负责 dispatch 边界，不理解 provider 参数语义；具体的 HTTP 调用、参数校验、响应解析由 `packages/providers` 负责
- **替代方案**：在 engine 中定义 provider 参数 schema（rejected：provider 语义不属于 engine 职责）

## Risks / Trade-offs

- **[Risk] 类型过早固化可能约束后续演进** → **Mitigation**：使用 `interface` 而非 `readonly class` 或冻结对象，保留声明合并能力；在 STATUS.md 中明确标记暂定项；不在类型中引入执行语义
- **[Risk] 跨包类型依赖方向错误** → **Mitigation**：严格遵循 `AGENTS.md` 的依赖方向（`providers -> core-engine`、`workflows -> core-engine`）；engine 的类型中不引用 providers / workflows 的具体类型，只提供 engine 侧的抽象契约
- **[Risk] 类型定义与实际实现脱节** → **Mitigation**：本 change 仅定义类型，不实现逻辑；后续每个实现 change（store、runner 等）必须在实现时验证类型是否足够，并在 STATUS.md 中记录偏差
- **[Trade-off] 拆分文件 vs. 查找便利** → 按领域拆分后，开发者需要知道类型属于哪个领域才能定位文件；通过 `types/index.ts` 统一导出和 IDE 自动 import 缓解此问题

## Migration Plan

无需迁移。本 change 仅新增类型定义，不修改现有运行时行为。`src/index.ts` 当前为占位符，将新增类型导出，不删除现有占位导出（待后续 change 中逐步替换）。

## Open Questions

- `ProviderDispatcher` 的 exact input / output / error 形状将在 `implement-workflow-registry-and-dispatch` 实现时收敛（当前仅保留抽象函数签名）
- `JobStore` 接口的 exact 方法列表（尤其是 `retryJob` 语义）将在 `implement-state-infrastructure` 实现时收敛
- `Asset` 中二进制数据的精确表示（`Uint8Array` vs. Base64 string）待与 `app` 层 adapter 集成时确认
