## Context

`packages/workflows` 当前有 4 份本地活跃文档：
- `README.md`：模块入口与索引
- `SPEC.md`：当前阶段规范
- `STATUS.md`：实现状态、偏差与开放问题
- `AGENTS.md`：模块级约束

但 `PRD.md` 缺失，导致 agent 在理解模块职责时只能回退到 `/.archive/modules/workflows/PRD.md`。这份 archive 文档只能作为 `(tentative)` 外部参考，不能作为当前权威基线。

这个 change 的目标不是重构规范，而是恢复 `packages/workflows` 的本地权威基线，让阅读顺序、职责边界和已知偏差都能仅靠当前目录内的文档成立。

## Goals / Non-Goals

### Goals
- 新建 `PRD.md`，作为 `packages/workflows` 的产品需求基线
- 更新 `README.md`、`SPEC.md`、`STATUS.md`，使四份文档互相补足且不冲突
- 明确 current baseline、tentative 项和 archive 参考的边界

### Non-Goals
- 不修改 `src/` 或 `tests/`
- 不重构根级文档
- 不把 tentative 字段提升为稳定 contract
- 不新增 `TESTING.md`、`RUNBOOK.md`、`examples/` 等超出当前最小范围的文档

## Decisions

### Decision 1: `PRD.md` 只记录当前已收敛的权威信息
**Rationale**: `PRD.md` 的职责是做模块级产品需求基线，而不是保存未验证的愿景。把 archive 里的假设直接写进 `PRD.md` 会让它持续变成“理想蓝图”，削弱它作为权威参考的价值。

**Content scope**
- 模块定位与目标用户
- builtin workflow 的职责、命名约定与边界
- 稳定 contract 与 tentative 字段的明确区分
- 与 `core-engine`、`providers` 的交互边界

**Alternative**: 直接复制 archive PRD，再在其上做最小修订。  
**Rejected because**: archive 内容无法证明与当前实现一致，且会把历史决策假设重新引入当前基线。

### Decision 2: `README.md` 作为模块入口和索引
**Rationale**: `README.md` 是 agent 和开发者第一眼会读到的文档，应该快速回答“这里有哪些文档、每份文档负责什么、当前有没有缺口”。

**Changes**
- 在“当前文档集”中新增 `PRD.md`
- 明确 `README.md` 负责索引与导航，不重复展开 `PRD.md`、`SPEC.md` 的细节
- 说明本模块当前不再依赖 archive PRD 作为权威来源

**Alternative**: 让 `PRD.md` 成为唯一入口，`README.md` 只做极简目录。  
**Rejected because**: 这会把“入口文档”和“权威语义来源”混在一起，降低首读效率，也不符合当前仓库“README 作为模块索引”的习惯。

### Decision 3: `SPEC.md` 只保留当前阶段的技术规范
**Rationale**: `SPEC.md` 应该描述当前阶段已经收敛的 shape 和约束，而不是同时承担产品定义、历史背景和未来规划。

**Changes**
- 保留当前已验证的 workflow shape、step 约束和输出 key 约定
- 对仍然 tentative 的字段做显式标注，并把其状态记录在 `STATUS.md` 或 `PRD.md`
- 避免 `SPEC.md` 与 `PRD.md` 的职责重叠

**Alternative**: 把产品需求、阶段规范和当前实现说明全部并入 `PRD.md`。  
**Rejected because**: 这会让产品意图和技术 shape 混写，后续任一侧变化都需要反复改同一份文档，增加漂移和冲突概率。

### Decision 4: `STATUS.md` 作为 drift ledger 和执行序列记录
**Rationale**: `STATUS.md` 适合承载“当前状态、已知偏差、开放问题、变更序列”，而不适合承担产品需求本身。

**Changes**
- 关闭 `PRD.md` 缺失这一项开放问题
- 将 `restore-authoritative-module-baseline` 标记为 completed
- 如仍存在文档与实现偏差，集中记录在 `STATUS.md`

**Alternative**: 把所有状态、偏差和结论都写回 `PRD.md`。  
**Rejected because**: 这会让 `PRD.md` 同时承担需求基线和变更日志，失去稳定参考点，也不利于后续审阅漂移。

## Risks / Trade-offs

- 新建 `PRD.md` 时若过度依赖 archive，仍可能把历史假设写回当前基线
  - Mitigation: 以当前 `src/`、`SPEC.md`、`STATUS.md` 为主，archive 只作背景参考
- `PRD.md` 与 `SPEC.md` 的边界若写得不清楚，可能再次出现重复
  - Mitigation: `PRD.md` 讲产品需求与职责，`SPEC.md` 讲技术 shape 与当前约束
- 文档更新后若实现继续演进，基线可能再次失效
  - Mitigation: 将偏差明确记录到 `STATUS.md`，避免把未收敛假设写成既成事实

## Migration Plan

- 本 change 不涉及代码、配置或数据迁移
- 实施顺序：
  1. 新建 `PRD.md`
  2. 更新 `README.md`
  3. 收敛 `SPEC.md`
  4. 同步 `STATUS.md`
- 回滚方式：
  - 删除 `PRD.md`
  - 恢复 `README.md`、`SPEC.md`、`STATUS.md` 的前一版本

## Open Questions

- `PRD.md` 是否需要包含版本历史，还是统一交给 `STATUS.md` 的变更序列
- 未来若 `workflows` 扩展新的 builtin workflow，`PRD.md` 是否要列出全部 workflow，还是只描述通用职责和边界
