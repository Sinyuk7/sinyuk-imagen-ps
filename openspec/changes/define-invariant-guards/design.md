## Context

`packages/core-engine` 已完成类型契约（`define-core-shared-types` ✓）与错误模型（`define-error-taxonomy` ✓）。当前约束明确要求：
- 所有跨包结果必须 serializable；禁止用 `JSON.stringify` 作为边界校验
- workflow step handoff 必须视为 immutable

`JobStore.submitJob` 的 docstring 已标注 FAILURE 行为“待 invariant-guards 收敛后补全”；`runner.ts` 的 step output handoff 也需要边界保护。本 change 填补这一基础设施缺口。

## Goals / Non-Goals

**Goals：**
- 提供 `assertSerializable(value)` 运行时校验函数，拒绝包含函数、undefined、循环引用、Symbol、DOM/UXP 对象的数据
- 提供 `assertImmutable(value)` 浅层不可变保护辅助（执行 `Object.freeze` 并返回冻结对象）
- 校验失败时统一抛出 `JobError`（`validation` category），与现有错误模型集成
- 提供 `safeStringify(value)` 辅助函数，用于日志/调试场景的安全 JSON 序列化（不替代校验）
- 所有函数保持 host-agnostic、纯运行时、零外部依赖
- 更新 `src/index.ts` 导出所有守卫函数

**Non-Goals：**
- 深度递归遍历完整对象图的性能极致优化
- 自定义校验规则注册或插件机制
- Store、runner、dispatch 的具体实现（仅提供可被它们调用的工具函数）
- 类型层面的编译时静态检查（如 TypeScript branded types）
- 将 `JobInput` / `JobOutput` 的字段级 schema 校验（属于 `packages/providers` 或 app 层职责）

## Decisions

### 1. `assertSerializable` 拒绝函数、Symbol、undefined、循环引用
- **选择**：`assertSerializable` 在校验时递归检查对象/数组，遇到 `function`、`symbol`、`undefined`、循环引用即抛出 `JobError`
- **理由**：`JSON.stringify` 对这些值的处理是静默的（函数被忽略、Symbol 被忽略、undefined 被转为 null），不符合“禁止用 `JSON.stringify` 作为边界校验”的约束；必须显式拒绝
- **替代方案**：仅依赖 `JSON.stringify`（rejected：直接违反 PRD 约束）

### 2. `assertSerializable` 使用递归而非 `JSON.stringify` try/catch
- **选择**：手动递归遍历结构进行校验
- **理由**：`JSON.stringify` 的错误信息不透明（对循环引用抛 `TypeError`，对 BigInt 抛 `TypeError`），且无法区分“可修复的格式问题”与“根本不可序列化的类型”；手动递归可提供结构化的 `JobError`，便于上游分类处理
- **替代方案**：`JSON.stringify` + 正则匹配错误信息（rejected：脆弱、不可维护）

### 3. `assertImmutable` 执行浅层 `Object.freeze` 并返回冻结对象
- **选择**：`assertImmutable<T>(value: T): Readonly<T>`，对对象/数组执行 `Object.freeze`，对 primitive 直接返回
- **理由**：step handoff 的 immutable 约束当前阶段以“浅层冻结”为最小可接受保证；深度冻结成本较高且不一定必要（取决于 handoff 的数据形状）；返回类型标注 `Readonly<T>` 在 TypeScript 层面提供不可变语义提示
- **替代方案**：深度递归冻结（rejected：性能成本、当前无明确需求）、返回新对象而非冻结原对象（rejected：增加内存开销，且原对象仍可能被外部修改）

### 4. 校验失败统一抛出 `JobError` 而非返回 boolean
- **选择**：`assertSerializable` 和 `assertImmutable` 在失败时抛出 `JobError`
- **理由**：与“失败显式”原则一致；返回 boolean 容易导致调用点遗漏检查（silent fallback）；抛出错误可强制上游处理或传播
- **替代方案**：返回 `{ ok: boolean, error?: JobError }`（rejected：增加调用点样板代码，且容易被忽略）

### 5. `safeStringify` 仅作为调试辅助，不替代校验
- **选择**：提供 `safeStringify`，对循环引用和 BigInt 做安全降级处理（如替换为 `"[Circular]"`、BigInt 转为 string），用于日志输出
- **理由**：运行时调试需要查看对象内容，但标准 `JSON.stringify` 会在循环引用和 BigInt 上抛错；提供一个安全的辅助函数避免调试代码自身崩溃
- **替代方案**：不提供此函数，让调试代码自行处理（rejected：会导致各处重复编写不安全的 JSON 序列化逻辑）

## Risks / Trade-offs

- **[Risk] 递归校验在大对象上性能不佳** → **Mitigation**：当前 engine 处理的是 workflow step 级别的 payload，数据量预期可控；若后续出现性能瓶颈，可在 `details` 中增加深度限制参数，或引入迭代式遍历
- **[Risk] `assertImmutable` 浅层冻结不足以防止深层 mutation** → **Mitigation**：在 design 中明确标记为“浅层”；若 runner 的 handoff 数据包含嵌套对象，调用方应在构造阶段保证嵌套对象本身也是冻结的；后续可根据实际使用情况升级为深度冻结选项
- **[Trade-off] `assertSerializable` 的递归实现增加代码量** → 接受此 trade-off；与依赖 `JSON.stringify` 相比，手动递归提供更清晰的错误分类和更可控的行为
- **[Trade-off] `safeStringify` 的降级表示可能丢失信息** → 接受此 trade-off；该函数仅用于日志/调试，不影响业务逻辑

## Migration Plan

无需迁移。本 change 仅新增工具函数，不修改现有运行时行为。`src/index.ts` 将追加导出，不删除现有导出。

## Open Questions

- `assertSerializable` 是否需要支持 `Date`、`RegExp`、`Map`、`Set` 等内置对象（`JSON.stringify` 对它们有特定序列化行为，但可能不符合跨包预期）
- `assertImmutable` 是否需要在后续 change 中提供深度冻结选项（取决于 runner handoff 的实际数据形状）
- 校验的最大递归深度是否应可配置（当前暂定固定深度，待 store/runner 实现后根据实测调整）
