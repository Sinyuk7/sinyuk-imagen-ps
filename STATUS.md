# 项目状态

- 状态：早期阶段，文档结构已收敛为单应用模式；`core-engine`、`providers` 已实现，`workflows` 已落地最小 builtin workflow baseline
- 更新时间：2026-04-25

## 当前活跃模块

- `app`：唯一应用，负责 Photoshop / UXP、UI 和应用侧桥接
- `packages/core-engine`：已实现完整 runtime / engine 基础能力
- `packages/providers`：contract、registry、mock provider、bridge、`openai-compatible` provider 已落地，并补充了关键测试
- `packages/workflows`：已导出 `provider-generate`、`provider-edit` 最小 builtin workflow spec，稳定了最小 request contract，并补充了包内测试与最小 bridge adapter 验证

## 当前范围

- `web` 应用不在当前版本范围内

## 当前已知偏差

- `MEMORY.md` 已归档到 `.archive/`，不再作为活跃上下文
- 根级 `STATUS.md` 之前对 `core-engine` 的状态描述较旧，已在本次更新中修正
- `packages/providers` 现在不再是“仅有占位入口”的状态，`openai-compatible` 已有完整实现和测试
- `core-engine` 与 `providers`、`workflows` 的更完整跨包集成验证仍未完成；当前 `workflows` 已验证 runtime 最小装配 happy path，以及基于 `mock provider` dispatch adapter 的最小 bridge happy path

## 当前文档策略

- 根目录只做索引、范围与跨模块边界
- `app/` 与各 `packages/*` 目录承担本地真实情况
- 暂不新增 `TESTING.md`、`RUNBOOK.md`、`examples/`
