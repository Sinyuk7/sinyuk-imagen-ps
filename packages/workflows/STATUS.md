# Workflows Status

## 1. Confirmed Baseline

### Responsibilities
- 承载 declarative workflow specs。
- 定义 builtin workflow、step ordering、input binding、output key 与 workflow metadata。
- 向 `@imagen-ps/core-engine` 提供可直接消费的稳定 workflow shape。

### Boundaries
- `workflows` 只放 pure data，不承载可执行逻辑。
- 不承担 provider transport、provider config schema、host IO、network、文件系统或 UI-facing shape。
- 可以依赖 `core-engine` 的共享类型，但不应混入 `providers` 或 host 语义。

### Non-goals
- 不扩写 DAG、visual editor、branch / loop / condition。
- 不实现 host writeback、inline transform logic、runtime persistence 或 queue 语义。
- 不把 surface 编排、CLI 参数格式或 runtime state mutation 放进本包。

### Constraints
- 当前阶段只确认最小 builtin workflow 范围。
- 文档与代码冲突时，先以 `STATUS.md` 记录，不把 Proposed 结构写成既成事实。
- `src/index.ts` 现已导出最小 builtin workflows；包内测试已覆盖导出正确性、registry 注册、runtime happy path，以及最小 provider bridge adapter happy path。

## 2. Open Questions / Risks
- [ ] `packages/workflows/PRD.md` 当前缺失；更细的 builtin 命名与目录建议只能参考 `/.archive/modules/workflows/PRD.md`，该来源仅能作为 `(tentative)` external reference。
- [ ] 现有 builtin request shape 只稳定覆盖最小 happy path：`provider-generate` 依赖 `provider + prompt`，`provider-edit` 依赖 `provider + prompt + inputAssets`；更丰富的 output / providerOptions / maskAsset 绑定仍未收敛。
- [x] 本包当前已补充跨包兼容性测试（`tests/cross-package-compat.test.ts`），覆盖边界输入、deep-freeze、mock provider 错误路径与 `openai-compatible` 最小 happy path。测试过程中暴露了若干边界问题，已记录至 §7。

## 3. Change Sequence (Ordered)

### Change 1: stabilize-builtin-request-contract
- status: completed
- goal: 将 `provider-generate` 与 `provider-edit` 的 job input / output 契约收敛成稳定 baseline，而不是停留在最小示例 shape。
- outcome:
  - `provider-generate` / `provider-edit` 的稳定输入字段、稳定 `outputKey` 与 tentative 字段边界已写清
  - 已新增并导出 builtin workflows
  - 已补齐 `core-engine` runtime happy path 与最小 `mock provider` bridge adapter happy path 测试
  - 已同步主 spec，并归档到 `openspec/changes/archive/2026-04-25-stabilize-builtin-request-contract/`

### Change 2: add-provider-bridge-compatibility-tests
- status: completed
- goal: 在已完成的 `stabilize-builtin-request-contract` 最小验证之上，补充更完整的跨包集成验证（覆盖更多边界、错误路径和真实 provider 场景）。
- scope: `tests/` 内增加跨包兼容性验证入口，必要时补充本包测试夹具
- out_of_scope: 修改 `packages/providers` 的实现细节或扩展 provider 功能
- why_now: 根级 `OPEN_ITEMS.md` 与 `packages/core-engine/OPEN_ITEMS.md` 都已把 `providers` / `workflows` 真实集成标记为验证缺口。
- depends_on: none
- touches: `tests/fixtures.ts`, `tests/cross-package-compat.test.ts`, `vitest.config.ts`, `tsconfig.json`
- acceptance_criteria: 至少一个真实 provider bridge adapter 能通过 `provider-generate` 或 `provider-edit` 的更多边界场景，或测试明确收敛出仍待解决的边界问题。
- openspec_timing: now

### Change 3: restore-authoritative-module-baseline
- status: planned
- goal: 恢复 `packages/workflows` 的本地权威 baseline，避免后续规划继续依赖归档 PRD。
- scope: 本模块文档基线的收敛方式
- out_of_scope: 根级文档重构、跨模块 roadmap、实现代码扩展
- why_now: 模块 `PRD.md` 缺失会让 agent 在读取本地真相时只能回退到 archive 文档，增加误判风险。
- depends_on: none
- touches: `README.md`, `SPEC.md`, `STATUS.md`, `PRD.md` `(tentative)`
- acceptance_criteria: 仅通过 `packages/workflows` 目录内的活跃文档，就能确定 builtin workflow 的职责、命名与边界，不再需要 archive 兜底。
- openspec_timing: later

## 4. Execution Order
1. `stabilize-builtin-request-contract` → 已完成；先把 builtin 输入输出契约稳定下来，避免后续 surface 和测试基于不同假设接入。
2. `add-provider-bridge-compatibility-tests` → 在最小 contract 已稳定后补更完整跨包验证，尽早暴露 provider bridge 与 workflow shape 的边界问题。
3. `restore-authoritative-module-baseline` → 等验证范围进一步收敛后，再把缺失的本地 baseline 文档补回权威状态，减少维护噪音。

## 5. Suggested Next OpenSpec Change
- name: add-provider-bridge-compatibility-tests
- reason: 这是当前序列中的 `Change 2`。`Change 1` 已完成后，最直接的后续工作就是扩大跨包验证覆盖，而不是先回补文档基线。
- expected_outcome: `workflows` 与 `providers` 的集成测试覆盖从“最小可用”提升到“能暴露真实边界问题”的层级。

## 7. Cross-Package Compatibility Boundaries (Exposed by Change 2)

以下问题在 `add-provider-bridge-compatibility-tests` 的测试实施过程中暴露，当前通过测试夹具中的 workaround 绕过，不作为本 change 的修复目标：

1. **`diagnostics: undefined` 导致 `assertSerializable` 失败**
   - 位置：`core-engine/src/dispatch.ts` 的 `assertSerializable(result)`
   - 现象：mock 与 openai-compatible provider 在 diagnostics 为空时返回 `diagnostics: undefined`，被 `assertSerializable` 以 `"Value at \"root.diagnostics\" is undefined and not serializable."` 拒绝。
   - 影响：任何通过 `createDispatchAdapter` 且 diagnostics 为空的 provider，在经 `core-engine` runtime 调用时都会失败。
   - 状态：待后续 change 在 provider 层或 engine 层统一收敛。

2. **`Uint8Array` 导致 `deepFreeze` 抛出 `TypeError`**
   - 位置：`core-engine/src/dispatch.ts` 的 `deepFreeze(snapshot)`
   - 现象：provider 返回的 `Asset.data` 为 `Uint8Array` 时，`Object.freeze` 抛出 `"Cannot freeze array buffer views with elements"`。
   - 影响：任何返回包含 `Uint8Array` 的 assets 的 provider，在经 `core-engine` runtime 调用时都会失败。
   - 状态：待后续 change 在 engine dispatch 边界处理 typed array，或在 provider 层统一归一化数据格式。

3. **workflow binding 在缺失字段时不自动报错**
   - 位置：`core-engine/src/runner.ts` 的 `resolveValue`
   - 现象：当 job input 缺少 workflow step 中绑定的字段（如 `prompt`）时，`resolveValue` 保留占位符字符串（如 `'${prompt}'`），不会自动抛出 validation 错误。错误只能在 provider `validateRequest` 阶段暴露，具体行为取决于 provider schema 的严格程度。
   - 影响：workflow 层无法独立保证输入完整性，部分缺失字段场景可能以 provider 错误而非 workflow validation 错误的形式暴露。
   - 状态：当前设计意图（workflow 为 declarative shape，不承担 validation 语义），但需在文档中显式声明。

4. **`openai-compatible` edit 拒绝被映射为 `provider` 错误而非 `validation` 错误**
   - 位置：`providers/src/bridge/create-dispatch-adapter.ts` 的 `toJobError`
   - 现象：`openai-compatible` provider 在 `invoke` 阶段对 `edit` 操作抛出 validation 错误，但 `createDispatchAdapter` 的 invoke catch 块使用 `defaultCategory: 'provider'`，导致错误 category 为 `'provider'`。
   - 影响：调用方无法通过 `category === 'validation'` 区分请求参数问题与 provider 运行时问题。
   - 状态：待后续 change 在 bridge adapter 中细化错误分类逻辑。

## 6. Notes
- 当前实现新增了 `src/builtins/provider-generate.ts`、`src/builtins/provider-edit.ts`、`src/builtins/index.ts`，并由 `src/index.ts` 统一导出。
- 当前测试位于 `tests/builtins.test.ts`（基础导出、registry、最小 happy path）与 `tests/cross-package-compat.test.ts`（边界输入、deep-freeze、错误路径、真实 provider 场景）。
- `/.archive/modules/workflows/PRD.md` 只作为补充参考，不能覆盖当前活跃文档与代码现实。
