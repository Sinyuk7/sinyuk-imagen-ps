# 项目状态

- 状态：早期阶段，文档结构已收敛为单应用模式；core-engine 已实现，providers / workflows 待建
- 更新时间：2026-04-25

## 当前活跃模块

- `app`：唯一应用，负责 Photoshop / UXP、UI 和应用侧桥接
- `packages/core-engine`：已实现 7 个 change，包含完整 types、errors、invariants、store、events、registry、dispatch、runner、runtime；测试覆盖通过
- `packages/providers`：文档意图清楚，代码仍接近占位（仅空 `src/index.ts`）
- `packages/workflows`：文档意图清楚，代码仍接近占位（仅空 `src/index.ts`）

## 当前范围外

- `web` 应用不在当前版本范围内

## 当前已知偏差

- `MEMORY.md` 和部分旧设计文档仍保留少量多应用或旧命名痕迹
- 根级 `STATUS.md` 此前对 `core-engine` 的状态描述严重滞后（曾标记为"仅含空 `types/` 目录"），已于本次修正

## 当前文档策略

- 根目录只做索引、范围和跨模块边界
- `app/` 与各 `packages/*` 目录承担本地真相
- 暂不新增 `TESTING.md`、`RUNBOOK.md`、`examples/`
