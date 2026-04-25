## Context

`packages/workflows` 当前拥有以下本地活跃文档：

- `README.md`：模块摘要，索引 `SPEC.md`、`STATUS.md`、`AGENTS.md`
- `SPEC.md`：当前阶段规范，描述模块目的、稳定边界、当前公开面与 tentative 信息
- `STATUS.md`：实现状态、变更序列与开放问题，其中明确记录 `PRD.md` 缺失
- `AGENTS.md`：模块级短规则，约束 agent 行为

但缺少 `PRD.md`。`STATUS.md` §2 指出：更细的 builtin 命名与目录建议只能参考 `/.archive/modules/workflows/PRD.md`，该来源仅能作为 `(tentative)` external reference。归档文档与当前代码现实可能存在偏差，agent 若依赖它做判断，容易产生误判。

同时，现有文档之间存在一些可以收敛的点：
- `README.md` 未明确提及 `PRD.md` 缺失问题
- `SPEC.md` 中的 tentative 信息（如最终 builtin workflow 数量）缺乏统一记录位置
- `STATUS.md` 的 `Open Questions` 中 `PRD.md` 缺失项尚待解决

## Goals / Non-Goals

**Goals:**
- 新建 `PRD.md`，成为 `packages/workflows` 本地权威的产品需求文档基线
- 更新 `README.md`、`SPEC.md`、`STATUS.md`，使四份文档互为补充、无矛盾
- 确保仅通过 `packages/workflows/` 内的活跃文档，就能确定 builtin workflow 的职责、命名与边界
- 将文档与代码的已知偏差显式记录到 `STATUS.md`，不把未收敛的假设写入 `PRD.md`

**Non-Goals:**
- 不修改 `src/` 或 `tests/` 下的任何源码
- 不回退到 archive 文档作为权威来源
- 不将 tentative 字段（`maskAsset`、`output`、`providerOptions`）提升为稳定 contract
- 不创建超出当前最小范围的新文档（如 `TESTING.md`、`RUNBOOK.md`）
- 不重构根级文档或跨模块 roadmap

## Decisions

### Decision 1: `PRD.md` 只记录当前已收敛的权威信息，不猜测未来结构
**Rationale**: PRD 的目标是“本地权威基线”，而不是“理想蓝图”。若把未验证的假设写进 PRD，未来变更时又要修订，反而降低权威性。
**Content scope**:
- 模块定位与目标用户
- builtin workflow 的职责、命名约定与边界定义（仅限当前已实现的 `provider-generate`、`provider-edit`）
- 稳定 contract 与 tentative 字段的明确区分
- 与 `core-engine`、`providers` 的交互边界（dependency direction、不承载的语义）
**Alternative**: 把 archive PRD 的内容全盘复制并稍作修改。被拒绝，因为无法确认 archive 内容是否仍与代码现实一致。

### Decision 2: `README.md` 升级为模块文档集的入口与索引
**Rationale**: `README.md` 是 agent 和开发者最先读取的文件，应清晰告知“本模块有什么文档、每份文档的职责、缺失项是否已解决”。
**Changes**:
- 在“当前文档集”段落中新增 `PRD.md` 条目
- 明确声明“本模块不再依赖 archive PRD 作为权威来源”
- 保持简洁，不重复 `SPEC.md` 或 `PRD.md` 的详细内容

### Decision 3: `SPEC.md` 收敛当前阶段规范，将已解决的歧义移除或归档
**Rationale**: `SPEC.md` 是“当前阶段规范”，应反映已落地的结构。若某些 tentative 信息已长期未变，且后续也无计划立即变更，应在 `SPEC.md` 中明确记录其状态，而不是让它持续悬而未决。
**Changes**:
- 保留当前稳定 contract 的精确描述
- 对仍 tentative 的字段，保持标注并指明其记录位置（`STATUS.md` 或 `PRD.md`）
- 若 `SPEC.md` 与 `PRD.md` 存在内容重叠，以 `PRD.md` 为“产品需求与职责”权威来源，`SPEC.md` 为“技术规范与 shape”权威来源

### Decision 4: `STATUS.md` 同步文档基线状态，将 `PRD.md` 缺失风险标记为已解决
**Rationale**: `STATUS.md` 是“现状与偏差”的权威记录。完成本 change 后，`PRD.md` 缺失的开放问题应被关闭，同时更新 `Change Sequence` 和 `Execution Order` 以反映当前进度。
**Changes**:
- 关闭 §2 Open Questions 中 `PRD.md` 缺失项
- 将 `restore-authoritative-module-baseline` 标记为 completed
- 如有新的开放问题（如文档与代码的残余偏差），显式记录

## Risks / Trade-offs

- **[Risk]** 新建 `PRD.md` 时，若对 archive PRD 的内容了解不足，可能遗漏某些历史决策依据。
  → **Mitigation**: 以当前活跃代码（`src/builtins/*.ts`）和已有文档（`SPEC.md`、`STATUS.md`）为主要依据，archive 仅作背景参考。若发现关键历史信息缺失，记录到 `STATUS.md` 而非猜测写入 `PRD.md`。
- **[Risk]** `PRD.md` 与 `SPEC.md` 的职责边界不清，导致内容重复或矛盾。
  → **Mitigation**: `PRD.md` 聚焦“产品需求、职责、边界、目标用户”；`SPEC.md` 聚焦“技术规范、shape、接口、当前阶段约束”。重叠内容以各自视角简述，交叉引用而非复制。
- **[Risk]** 文档更新后，后续代码变更未同步更新文档，导致基线再次失效。
  → **Mitigation**: 在 `AGENTS.md` 中强化“文档与代码冲突 → 记录到 `STATUS.md`”的规则，并在 `PRD.md` 末尾注明“本文档以当前 change 完成时的代码现实为准，后续变更需同步更新”。

## Migration Plan

- 本 change 不涉及代码、配置或数据迁移。
- 实施顺序：`PRD.md` 新建 → `README.md` 更新 → `SPEC.md` 收敛 → `STATUS.md` 同步。
- 回滚方式：删除 `PRD.md`，恢复 `README.md`、`SPEC.md`、`STATUS.md` 的先前版本即可。

## Open Questions

- `PRD.md` 中是否需要包含“版本历史”或“变更日志”段落，还是由 `STATUS.md` 的 `Change Sequence` 统一承担？
- 若未来 `workflows` 扩展新的 builtin workflow，`PRD.md` 是否应作为“所有 builtin workflow 的注册表”，还是仅描述通用职责与边界？
