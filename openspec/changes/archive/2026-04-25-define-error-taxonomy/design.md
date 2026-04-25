## Context

`packages/core-engine` 已完成 `define-core-shared-types`，`Job`、`Workflow`、`ProviderRef` 等类型契约已就位。当前 `Job.error` 字段类型为 `unknown`，尚未建立统一的错误分类与构造规范。

约束要求：
- 所有跨包结果必须 serializable
- 所有失败必须落到 `JobError` taxonomy，禁止 silent fallback
- `core-engine` 必须 host-agnostic，不感知 HTTP、DOM、UXP 细节

后续 `implement-state-infrastructure`（store 状态转换）、`implement-runner-and-runtime`（runner 执行路径）都需要在失败时构造和传递一致的错误对象。

## Goals / Non-Goals

**Goals：**
- 定义 `JobError` 统一接口，包含 `category`、`message`、`details` 等可消费字段
- 定义 `ErrorCategory` 分类枚举，覆盖 validation、provider、runtime、workflow 等常见失败域
- 提供工厂函数确保错误构造一致（如 `createValidationError`、`createProviderError`、`createRuntimeError`、`createWorkflowError`）
- 所有类型与函数保持 serializable 且 host-agnostic
- 更新 `src/index.ts` 导出所有公共错误类型与辅助函数

**Non-Goals：**
- 边界守卫（`invariants.ts`）的实现
- Store、runner、dispatch 的具体实现
- 错误恢复策略（retry、fallback、queue、compensation）
- 将 `Job.error` 字段类型从 `unknown` 收窄（留待与 store 实现同时评估）
- provider HTTP 响应解析与错误映射（属于 `packages/providers` 职责）

## Decisions

### 1. `JobError` 使用 interface 而非继承 `Error` class
- **选择**：`JobError` 定义为普通对象接口，不继承 JavaScript `Error` class
- **理由**：`Error` instance 在跨序列化边界（postMessage、JSON）时会丢失 stack 和原型；保持纯对象可确保跨包传递时结构稳定
- **替代方案**：继承 `Error`（rejected：违反 serializable 约束）

### 2. `ErrorCategory` 使用 string literal union 而非 numeric enum
- **选择**：`type ErrorCategory = 'validation' | 'provider' | 'runtime' | 'workflow' | 'unknown'`
- **理由**：string literal 在序列化后自描述，无需额外映射；便于在日志和调试中直接阅读；TypeScript 中享受 exhaustiveness check
- **替代方案**：numeric enum（rejected：序列化后语义丢失）、string enum（rejected：无额外收益，代码更冗长）

### 3. 保留 `details` 为 `Record<string, unknown>`
- **选择**：`JobError` 包含 `details?: Record<string, unknown>`，允许各部件附加上下文（如 step name、provider name、retry count）
- **理由**：错误分类需要稳定，但具体上下文高度依赖调用点；开放 details 既保持结构统一，又避免过早固化所有可能的字段
- **替代方案**：为每种错误定义严格的子类型（rejected：会导致类型频繁改动，与“过早固化”风险冲突）

### 4. 工厂函数按 category 分设
- **选择**：每个 `ErrorCategory` 提供独立的工厂函数（`createValidationError`、`createProviderError`…）
- **理由**：调用点无需记忆 category 字符串，类型安全且 IDE 自动补全友好；可在工厂内部统一填充公共字段（如可选的 `timestamp`）
- **替代方案**：单一 `createJobError(category, message, details)`（rejected：调用点容易传错 category，且不利于后续按 category 扩展专属字段）

### 5. `cause` 字段暂不引入
- **选择**：`JobError` 当前不包含 `cause` 链式引用
- **理由**：engine 目前单层抽象，错误链主要在 provider 层或 host adapter 层；过早引入 `cause` 会导致序列化复杂度上升。若后续需要，可在不破坏现有接口的情况下追加可选字段
- **替代方案**：在 `details` 中嵌入 cause 信息（当前即可支持，无需接口改动）

## Risks / Trade-offs

- **[Risk] 错误分类过早固化，后续发现新 category 需要改动类型** → **Mitigation**：使用 string literal union，追加新值是向后兼容的扩展；不在类型层限制 `details` 的键，保持灵活性
- **[Risk] `details` 过于开放，导致不同部件的错误格式不一致** → **Mitigation**：工厂函数作为唯一推荐构造入口，可在文档中约定常用键（如 `stepName`、`providerName`）；后续 `invariants.ts` 可提供运行时校验辅助
- **[Trade-off] 不继承 `Error` class 导致无法使用 `instanceof` 检查** → 接受此 trade-off；engine 内部通过 `category` 字段判断错误类型，更可靠且跨包友好
- **[Trade-off] 当前不提供 stack trace** → engine 侧的运行时错误暂不捕获 stack；host 层或 adapter 可自行在 `details` 中附加调试信息

## Migration Plan

无需迁移。本 change 仅新增错误类型定义与工厂函数，不修改现有运行时行为。`src/index.ts` 当前已导出共享类型，将追加错误相关导出，不删除现有导出。

## Open Questions

- `ErrorCategory` 是否需要在 `implement-runner-and-runtime` 阶段增加 `timeout` 或 `cancelled`（取决于后续 scheduler / queue 设计）
- `Job.error` 字段类型何时从 `unknown` 收窄为 `JobError | undefined`（建议与 `implement-state-infrastructure` 同时评估）
- provider 层错误映射到 `JobError` 的 exact 规则（由 `packages/providers` 在适配时决定，engine 仅消费 `JobError`）
