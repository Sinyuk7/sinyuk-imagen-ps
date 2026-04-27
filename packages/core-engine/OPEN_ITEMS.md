# Open Items

> Current unresolved items only. Historical planning documents are not authoritative.

## Decisions Needed

### 默认 workflow 的长期形态 ✅ resolved

- **decision**: `@imagen-ps/workflows` 的 `providerGenerateWorkflow` /
  `providerEditWorkflow` 的 v1 input contract 与 output key 已视为稳定面。
- **rationale**: 两个 builtin workflow 的 step shape 与 `outputKey: 'image'` 已经在
  workflows 包内显式声明（`provider-generate.ts` / `provider-edit.ts`），且 v1
  input 字段集合（`provider`、`prompt`，edit 额外 `inputAssets`）足以覆盖当前 surface
  的最小可用路径；进一步的扩展字段（`output.count` / `maskAsset` / `providerOptions`
  等）通过新版本 workflow 引入，不破坏 v1。runner 与 registry 的初始化方式无需调整。
- **commit_scope**:
  - `packages/workflows/src/builtins/provider-generate.ts`（注释补齐 stable
    contract，与 `provider-edit.ts` 对齐）
  - `packages/core-engine/SPEC.md`（"稳定边界"补充，"暂定信息"清理）
- **follow_up**: 无（已闭环）。

### runtime 与 facade / CLI 的最终装配位置 ✅ resolved

- **decision**: `createRuntime(options?) => Runtime` 签名为稳定面；core-engine 不
  引入额外 facade 抽象。装配位置由各 surface（app、未来 CLI / host bridge）的
  shared/ 层持有**唯一** `Runtime` 实例承担。
- **rationale**:
  - app 已有架构约束 `app/docs/CODE_CONVENTIONS.md`：UI 不得直接 `createRuntime`，
    必须通过 shared 层 commands 暴露；
  - 现有 `Runtime` 接口（`runWorkflow / store / events / registry / dispatcher`）
    已足以支撑 share_command 与 commands 层的所有最小命令；
  - 引入额外 facade 会过早抽象，反而绑定 share_command 设计；
  - 多 surface 出现时（如未来 CLI）再在 core-engine 之上独立抽 facade，不影响本签名。
- **commit_scope**: `packages/core-engine/SPEC.md`（"稳定边界" + "暂定信息"清理）。
- **follow_up**: app 层在 share_command 落地阶段，按上述结论实现 `shared/runtime.ts`
  单例 + `shared/commands/` 桥接；具体形态由 share_command PRD/SPEC/TASK 决定。

## Verification Gaps

### 与 providers、workflows 的真实集成尚未验证 ⏸ deferred

- **status**: 已**显式延后**到 share_command PRD/SPEC/TASK 完成之后的加固阶段。
- **rationale**: 当前阶段的契约层修复（OI-1/OI-2/OI-3/OI-4 + diagnostics 默认值
  + providers 公开契约）已为集成验证清掉所有已知边界缺陷；端到端集成验证的最佳
  时机是在 share_command 装配确定后，与"加固阶段"统一执行（见
  `packages/providers/OPEN_ITEMS.md` #3 同步标注）。
- **next_action**: 进入加固阶段时创建 `app` 层 + `core-engine` + `providers` +
  `workflows` 的端到端冒烟用例，并联动更新 workflows 跨包测试中需要随契约修复
  调整的断言（OI-3 `workflow` category、OI-4 `validation` category）。