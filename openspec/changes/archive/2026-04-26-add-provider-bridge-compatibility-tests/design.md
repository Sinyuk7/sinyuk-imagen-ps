## Context

`packages/workflows` 当前已具备 `provider-generate` 与 `provider-edit` 两个 builtin workflows，并已在 `stabilize-builtin-request-contract` 中验证了：

- 导出正确性与 immutability
- `core-engine` `createWorkflowRegistry()` 注册无 shape 错误
- `core-engine` `createRuntime()` 的 provider-generate / provider-edit happy path
- `mock provider` bridge adapter 的最小 happy path（generate 与 edit 各一条）

然而，当前测试存在以下缺口：

- **边界输入未覆盖**：缺失可选字段、空 `inputAssets`、额外字段透传等场景未验证
- **deep-freeze / immutability 跨包未验证**：workflow spec 经 runtime 装配后，是否仍保持不可变未测试
- **错误路径未覆盖**：dispatch 失败、provider 未注册、bridge 返回异常 shape 等场景未测试
- **真实 provider 场景缺失**：仅测试了 `mock provider`，未验证 `openai-compatible` 等真实 provider bridge 与 builtin workflow 的集成

根级 `OPEN_ITEMS.md` 与 `packages/core-engine/OPEN_ITEMS.md` 均将此标记为验证缺口。

## Goals / Non-Goals

**Goals:**
- 在 `packages/workflows/tests/` 内建立跨包兼容性测试入口，覆盖边界输入、错误路径与真实 provider 场景
- 验证 workflow spec 经 `core-engine` runtime 装配后的 deep-freeze / immutability 兼容性
- 验证 mock provider bridge adapter 的错误路径（dispatch 失败、返回异常 shape、provider 未注册）
- 验证至少一个真实 provider bridge adapter（`openai-compatible`）与 builtin workflow 的集成 happy path
- 补充可复用的测试夹具与辅助构造器，降低后续测试的重复代码

**Non-Goals:**
- 不修改 `packages/providers` 的源码、接口或 provider 功能
- 不扩展新的 provider family 或 adapter
- 不引入端到端（E2E）harness、UI 测试或网络调用
- 不修改 `packages/core-engine` 的 runtime 实现
- 不将 `maskAsset`、`output`、`providerOptions` 提升为稳定 contract（保持 tentative）

## Decisions

### Decision 1: 测试文件按关注点拆分，而非全部塞进 `builtins.test.ts`
**Rationale**: 当前 `builtins.test.ts` 已覆盖基础导出、immutability、registry 与最小 happy path。若将大量边界与错误路径测试混入同一文件，会导致文件膨胀、定位困难。
**拆分方案**:
- `builtins.test.ts`：保留现有基础测试（导出、immutability、registry、最小 happy path）
- `cross-package-compat.test.ts`（或类似名称）：新增跨包兼容性测试，包括边界输入、deep-freeze、错误路径与真实 provider 场景
- `fixtures.ts`（或 `test-utils.ts`）：集中存放可复用的 helper、构造器与 mock 配置
**Alternative**: 全部写入 `builtins.test.ts`。被拒绝，因为会导致测试文件过大，不利于维护。

### Decision 2: 优先使用 `mock provider` 覆盖错误路径，避免引入真实网络依赖
**Rationale**: `mock provider` 支持 `failMode`（固定失败、概率失败）与 `delayMs`，是验证错误路径最可控的手段。真实 provider 场景仅保留最小 happy path，确认 bridge shape 兼容即可。
**Layer 1**: `mock provider` 错误路径测试（validation 失败、invoke 失败、abort 信号）
**Layer 2**: `openai-compatible` 最小 `generate` happy path 测试（仅验证 request shape 被正确消费，不触发真实 HTTP）；`edit` 仅保留为当前边界拒绝断言，不作为兼容性成功路径
**Alternative**: 对真实 provider 也做错误路径测试。被拒绝，因为这会引入网络脆弱性、外部配置依赖，且超出 `workflows` 包的职责边界。

### Decision 3: 边界输入场景选择“最小必要集合”
**Rationale**: 目标是从“最小可用”提升到“能暴露真实边界问题”，而非一次性覆盖所有排列组合。
**边界场景集合**:
- `provider-generate` 缺失可选字段（如 `providerOptions`、`output`）
- `provider-edit` 空 `inputAssets` 数组
- workflow job input 包含额外字段，验证是否被正确透传或忽略
- `core-engine` runtime 装配后的 workflow / job output 不可变性验证
**Alternative**:  exhaustive 参数组合测试。被拒绝，因为当前 contract 仍标记为 tentative，过度测试会在 contract 演进时产生大量维护噪音。

### Decision 4: 测试夹具放在 `packages/workflows/tests/` 内，不提升到 monorepo 根级
**Rationale**: 这些夹具主要服务于 `workflows` 包的跨包验证，当前无其他包复用需求。若未来 `core-engine` 或 `providers` 也需要同类夹具，再考虑提取到共享测试包。
**Alternative**: 在 monorepo 根级创建 `packages/test-utils/`。被拒绝，因为过早抽象会增加不必要的包间依赖。

### Decision 5: 若测试暴露出现有契约与真实 provider 不兼容的问题，记录但不阻塞
**Rationale**: 本次 change 的首要目标是“暴露边界问题”，而不是“一次性修复所有跨包问题”。若真实 provider 测试失败，应将问题收敛到 `STATUS.md` 或 `OPEN_ITEMS.md`，作为后续 change 的输入。
**Alternative**: 发现问题即修复 provider 或 engine 实现。被拒绝，因为这会扩大 change 范围，违反“不修改 providers/core-engine 源码”的 Non-goals。

### Decision 6: 跨包测试通过 package-local Vitest 配置直连 workspace 源码入口
**Rationale**: 当前仓库没有现成的 `vitest.config.ts` 或 workspace 测试配置。若直接依赖 `dist`，容易引入陈旧产物；若继续用深层相对路径，则会绕开 package 边界并增加维护成本。最稳妥的方式是在 `packages/workflows` 内添加本地 Vitest 配置，将 `@imagen-ps/core-engine` 与 `@imagen-ps/providers` 解析到各自的源码入口。
**实施方式**:
- 在 `packages/workflows/vitest.config.ts` 中配置 alias / resolve
- 测试文件仅通过 package root 或 alias 引用依赖，不再使用 `../../providers/src/...` 这类相对源码路径
- 需要共享初始化时，优先使用 `setupFiles`，但不要把配置逻辑散落到各个测试文件中
**Alternative**: 直接从 `dist` 读取已构建产物。被拒绝，因为会掩盖源码与测试结果不一致的问题。

## Risks / Trade-offs

- **[Risk]** 跨包测试引入 monorepo 包间依赖，导致测试配置复杂化。
  → **Mitigation**: 通过 `packages/workflows/vitest.config.ts` 将 `@imagen-ps/core-engine` 与 `@imagen-ps/providers` 解析到源码入口，并保持测试文件只引用 package root。
- **[Risk]** 测试暴露的边界问题数量超出预期，导致 change 范围蔓延。
  → **Mitigation**: 严格遵守 Non-goals，发现问题即记录到 `STATUS.md` / `OPEN_ITEMS.md`，不当场修复 provider 或 engine 实现。
- **[Risk]** `openai-compatible` provider 的测试需要一定了解其内部 request shape，可能让 `workflows` 测试“泄露”provider 语义。
  → **Mitigation**: 真实 provider 测试只验证“bridge 能消费 workflow 发出的 params”，不深入断言 provider 内部转换逻辑。provider 语义校验留在 `packages/providers` 的自有测试中。
- **[Risk]** 测试夹具与现有代码结构耦合过紧，后续 contract 演进时维护成本高。
  → **Mitigation**: 夹具只封装“构造合法/非法 input”与“构造 adapter”的通用逻辑，不硬编码具体字段值。字段断言保留在测试用例中。

## Migration Plan

- 本 change 不涉及持久化数据、配置迁移或运行时迁移。
- 实施顺序为：先补充测试夹具 → 再新增边界输入与 deep-freeze 测试 → 再补充 mock provider 错误路径 → 最后补充真实 provider 最小 happy path。
- 回滚方式：删除新增的测试文件与夹具即可，不影响任何源码。

## Open Questions

- 无。本 change 的测试范围、解析策略与失败边界已在上述决策中收敛。
