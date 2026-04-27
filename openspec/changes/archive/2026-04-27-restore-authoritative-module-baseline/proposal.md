## Why

`packages/workflows` 当前的本地活跃文档集缺少 `PRD.md`，导致 agent 在读取模块真相时只能回退到 `/.archive/modules/workflows/PRD.md`。该归档来源已失去与当前代码现实的同步，增加了误判风险。与此同时，`README.md`、`SPEC.md`、`STATUS.md` 虽然存在，但部分内容仍引用 archive 或带有 tentative 标记，未能形成完整、权威的本地基线。

本次 change 旨在恢复 `packages/workflows` 的本地权威 baseline，使 agent 仅通过模块内活跃文档即可确定 builtin workflow 的职责、命名与边界，不再需要 archive 兜底。

## What Changes

- 新建 `packages/workflows/PRD.md`，作为模块产品需求文档基线，涵盖：
  - 模块定位与目标用户
  - builtin workflow 的职责、命名约定与边界定义
  - 当前稳定 contract 与 tentative 字段的明确区分
  - 与 `core-engine`、`providers` 的交互边界
- 更新 `packages/workflows/README.md`，与新建 `PRD.md` 对齐，移除对 archive 的隐性依赖，明确当前文档集索引
- 更新 `packages/workflows/SPEC.md`，收敛当前阶段规范，移除已解决的 tentative 歧义（若仍有未收敛项，明确标注并记录到 `STATUS.md`）
- 更新 `packages/workflows/STATUS.md`，将 `PRD.md` 缺失的风险项标记为已解决，并同步文档基线状态
- **不修改**任何源码文件（`src/`、`tests/`）

## Non-goals

- 不重构根级文档或跨模块 roadmap
- 不扩展 `workflows` 的实现代码或测试
- 不将 `maskAsset`、`output`、`providerOptions` 提升为稳定 contract（保持 tentative）
- 不创建 `TESTING.md`、`RUNBOOK.md`、`examples/` 等超出当前最小范围的内容
- 不回退到 archive 文档作为权威来源

## Capabilities

### New Capabilities
（无新功能规格——本次变更为纯文档基线恢复）

### Modified Capabilities
（无需求变更——本次变更不涉及 spec-level 行为修改）

## Impact

- **文档范围**：仅影响 `packages/workflows/` 内的 `README.md`、`SPEC.md`、`STATUS.md`，并新增 `PRD.md`
- **代码影响**：零代码变更
- **构建与测试**：无需调整构建或测试配置
- **风险**：若文档与代码现实仍存在偏差，需以 `STATUS.md` 显式记录，避免把未收敛的假设写入权威基线
