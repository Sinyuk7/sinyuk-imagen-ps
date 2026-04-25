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
- `src/index.ts` 现已导出最小 builtin workflows；包内测试已覆盖导出正确性、registry 注册与 runtime happy path。

## 2. Open Questions / Risks
- [ ] `packages/workflows/PRD.md` 当前缺失；更细的 builtin 命名与目录建议只能参考 `/.archive/modules/workflows/PRD.md`，该来源仅能作为 `(tentative)` external reference。
- [ ] 现有 builtin request shape 只稳定覆盖最小 happy path：`provider-generate` 依赖 `provider + prompt`，`provider-edit` 依赖 `provider + prompt + inputAssets`；更丰富的 output / providerOptions / maskAsset 绑定仍未收敛。
- [ ] 本包当前只验证了与 `core-engine` 的直接 runtime 装配；与 `packages/providers` bridge 的真实跨包集成仍是验证缺口。

## 3. Planned Changes (Ordered)

### Change 1: stabilize-builtin-request-contract
- goal: 将 `provider-generate` 与 `provider-edit` 的 job input / output 契约收敛成稳定 baseline，而不是停留在最小示例 shape。
- scope: `src/builtins/`、`tests/`、`STATUS.md`
- out_of_scope: `core-engine` runner 语义调整、`providers` request schema 变更、surface 参数编排
- why_now: `shared commands` 与 CLI 要消费 workflow 时，需要清楚知道 job input 应该长什么样，不能继续依赖推断。
- depends_on: none
- touches: `src/builtins/`, `tests/`, `STATUS.md`
- acceptance_criteria:
  - `provider-generate` / `provider-edit` 的输入字段、必要字段与输出 key 在本模块文档和测试中一致且可验证
  - 包含一条使用 mock provider 的最小 bridge 兼容 happy path，验证 workflow binding 可被真实 adapter 消费
- openspec_timing: now

### Change 2: add-provider-bridge-compatibility-tests
- goal: 在 Change 1 的最小验证之上，补充更完整的跨包集成验证（覆盖更多边界、错误路径和真实 provider 场景）。
- scope: `tests/` 内增加跨包兼容性验证入口，必要时补充本包测试夹具
- out_of_scope: 修改 `packages/providers` 的实现细节或扩展 provider 功能
- why_now: 根级 `OPEN_ITEMS.md` 与 `packages/core-engine/OPEN_ITEMS.md` 都已把 `providers` / `workflows` 真实集成标记为验证缺口。
- depends_on: `stabilize-builtin-request-contract`
- touches: `tests/` `(tentative)`
- acceptance_criteria: 至少一个真实 provider bridge adapter 能通过 `provider-generate` 或 `provider-edit` 的更多边界场景，或测试明确收敛出仍待解决的边界问题。
- openspec_timing: now

### Change 3: restore-authoritative-module-baseline
- goal: 恢复 `packages/workflows` 的本地权威 baseline，避免后续规划继续依赖归档 PRD。
- scope: 本模块文档基线的收敛方式
- out_of_scope: 根级文档重构、跨模块 roadmap、实现代码扩展
- why_now: 模块 `PRD.md` 缺失会让 agent 在读取本地真相时只能回退到 archive 文档，增加误判风险。
- depends_on: none
- touches: `README.md`, `SPEC.md`, `STATUS.md`, `PRD.md` `(tentative)`
- acceptance_criteria: 仅通过 `packages/workflows` 目录内的活跃文档，就能确定 builtin workflow 的职责、命名与边界，不再需要 archive 兜底。
- openspec_timing: later

## 4. Execution Order
1. `stabilize-builtin-request-contract` → 先把 builtin 输入输出契约说清楚，避免后续 surface 和测试基于不同假设接入。
2. `add-provider-bridge-compatibility-tests` → 在契约稳定后补真实跨包验证，尽早暴露 provider bridge 与 workflow shape 的边界问题。
3. `restore-authoritative-module-baseline` → 等实现与验证收敛后，再把缺失的本地 baseline 文档补回权威状态，减少维护噪音。

## 5. Suggested Next OpenSpec Change
- name: stabilize-builtin-request-contract
- reason: 当前代码已落地最小 builtin workflows，但其 job input / output 契约仍偏薄，继续推进 shared commands 或 CLI 前需要先收敛这层 baseline。
- expected_outcome: `provider-generate` 与 `provider-edit` 的输入字段、必要字段、输出 key 和最小兼容测试被统一写清并固化。

## 6. Notes
- 当前实现新增了 `src/builtins/provider-generate.ts`、`src/builtins/provider-edit.ts`、`src/builtins/index.ts`，并由 `src/index.ts` 统一导出。
- 当前测试位于 `tests/builtins.test.ts`，已验证 builtin exports、immutability、registry 注册以及与 `core-engine` runtime 的最小 happy path 兼容性。
- `/.archive/modules/workflows/PRD.md` 只作为补充参考，不能覆盖当前活跃文档与代码现实。
