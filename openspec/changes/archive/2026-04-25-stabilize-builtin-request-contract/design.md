## Context

`packages/workflows` 当前已经导出 `provider-generate` 与 `provider-edit` 两个 builtin workflows，并且包内测试证明它们可以被 `@imagen-ps/core-engine` 的 `createRuntime()` 直接消费。但这些 workflows 的 request binding 仍偏实现导向：

- `provider-generate` 目前只隐含表达了 `provider + prompt`
- `provider-edit` 目前只隐含表达了 `provider + prompt + inputAssets`
- `maskAsset`、`output`、`providerOptions` 等字段是否属于当前稳定范围尚未文档化
- 与 `packages/providers` bridge 的真实跨包兼容路径尚未验证

如果在这个状态下继续推进 `shared commands` 或 CLI，调用侧只能从实现猜测输入 shape，风险会从 `workflows` 包外溢到上层 surface。

## Goals / Non-Goals

**Goals:**
- 明确 `provider-generate` 与 `provider-edit` 的当前稳定输入字段和必要字段
- 固定两个 builtin workflows 的输出 key 与最小 step shape，使其可被上层稳定依赖
- 补充覆盖 contract 的测试，包括与真实 provider bridge 的最小兼容路径
- 保持 `packages/workflows` 继续作为 pure data package，不引入执行逻辑

**Non-Goals:**
- 不修改 `packages/core-engine` 的 runner、registry 或 lifecycle 行为
- 不扩展 `packages/providers` 的 canonical request schema
- 不把 `maskAsset`、`output`、`providerOptions` 一次性提升为全部稳定公开 contract，除非本 change 明确选择纳入
- 不进入 DAG、branch / loop、host writeback、UI 参数编排或 CLI 交互格式

## Decisions

### Decision 1: 稳定 contract 由 `workflows` 自身声明，不回退到 provider schema 作为唯一真相源
**Rationale**: `providers` 负责 canonical request schema，但 `shared commands`、CLI 与后续 app surface 消费的是 builtin workflow，而不是直接消费 provider schema。若不在 `workflows` 层明确 builtin contract，调用方仍需要跨包推断。
**Alternative**: 仅引用 `packages/providers` 的 `CanonicalImageJobRequest`，不在 `workflows` 层额外收敛。被拒绝，因为这不能说明哪些字段对某个 builtin workflow 是“当前必需”。

### Decision 2: 当前稳定 baseline 只固定最小 happy path 字段
**Rationale**: 当前 change 的目标是消除接入歧义，而不是一次性冻结完整 image request 模型。`provider-generate` 先固定 `provider` 与 `prompt`；`provider-edit` 先固定 `provider`、`prompt`、`inputAssets`，与现有实现和测试一致。
**Alternative**: 直接把 `maskAsset`、`output`、`providerOptions` 都纳入稳定 contract。被拒绝，因为现阶段没有足够测试与消费方验证支持这一冻结。

### Decision 3: `image` 继续作为两个 builtin workflows 的稳定输出 key
**Rationale**: `shared commands` 和后续 surface 需要稳定读取结果位置。继续统一使用 `image`，可以避免上层为 generate / edit 维护不同结果分支。
**Alternative**: 让 generate 使用 `image`，edit 使用 `edited-image` 或默认 step name。被拒绝，因为会增加 surface 条件分支，且当前无文档要求支持不同 key。

### Decision 4: 兼容性验证分为两层
**Rationale**: 单纯 stub dispatcher 只能证明 workflow shape 被 runtime 接受，不能证明真实 provider bridge 能消费同一 request shape。本 change 需要同时保留纯 runtime 测试和至少一条 bridge-level happy path。
**Layer 1**: `packages/workflows/tests/*` 中保留对 `createRuntime()` 的直接装配测试。
**Layer 2**: 新增对 `packages/providers` bridge 的最小兼容验证，优先使用 `mock provider`，避免引入网络依赖。
**Alternative**: 只做 bridge-level 测试。被拒绝，因为失去对纯 workflow shape 的快速回归保护。

### Decision 5: 未纳入当前稳定范围的字段在文档中显式标记为 tentative
**Rationale**: 当前最大风险不是字段太少，而是“看起来可用但没有被承诺”。把未收敛字段显式标为 tentative，比沉默保留更能约束后续实现。
**Alternative**: 保持不写，等未来 change 再说。被拒绝，因为这会让调用侧继续从实现细节中猜测 contract。

## Risks / Trade-offs

- **[Risk]** 过早冻结字段集合，后续 provider / surface 验证发现缺项。
  → **Mitigation**: 只冻结最小 happy path，并把其余字段明确标为 tentative，避免假稳定。
- **[Risk]** bridge-level 兼容测试跨包后可能引入测试脆弱性。
  → **Mitigation**: 优先使用 `mock provider` 和同步本地 adapter，避免网络或外部配置依赖。
- **[Risk]** `packages/workflows/PRD.md` 缺失，设计依据部分来自现有代码和 `STATUS.md`。
  → **Mitigation**: 本 change 完成后将新的 contract 事实写回模块文档，并避免把 archive 文档当作权威来源。

## Migration Plan

- 本 change 不涉及持久化数据、配置迁移或运行时迁移。
- 实施顺序为：先更新 builtin contract 文档与 spec，再收敛代码注释/shape，最后补齐兼容测试。
- 回滚方式：删除本 change 对 `packages/workflows/src/builtins/*` 和 `packages/workflows/tests/*` 的 contract 收敛改动，并移除新增 spec/docs。

## Open Questions

- `provider-edit` 是否需要在当前阶段把 `maskAsset` 一并提升为稳定字段，还是继续保留为 tentative？
- `output` 与 `providerOptions` 是否应该在 `shared commands` 启动前再统一收敛，而不是在 `workflows` 包提前冻结？
- 模块级 `PRD.md` 是否应在本 change 之后恢复，以免后续变更继续依赖 archive 文档？
