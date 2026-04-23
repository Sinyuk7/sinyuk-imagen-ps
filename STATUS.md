# 项目状态

- 状态：早期阶段，文档结构已收敛为单应用模式
- 更新时间：2026-04-23

## 当前活跃模块

- `app`：唯一应用，负责 Photoshop / UXP、UI 和应用侧桥接
- `packages/core-engine`：已有 runtime 相关实现
- `packages/providers`：文档意图清楚，代码仍接近占位
- `packages/workflows`：文档意图清楚，代码仍接近占位

## 当前范围外

- `web` 应用不在当前版本范围内

## 当前已知偏差

- `MEMORY.md` 和部分旧设计文档仍保留少量多应用或旧命名痕迹

## 当前文档策略

- 根目录只做索引、范围和跨模块边界
- `app/` 与各 `packages/*` 目录承担本地真相
- 暂不新增 `TESTING.md`、`RUNBOOK.md`、`examples/`
