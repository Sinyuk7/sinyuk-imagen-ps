# Sinyuk Imagen PS

这是一个文档优先的早期 monorepo。当前仓库已经收敛为“单应用 + 共享模块”结构：只有一个 Photoshop 插件应用，其余能力都下沉到共享包里。

## 当前结构

```txt
app/
packages/
docs/
```

- `app/`：唯一应用。承接 Photoshop / UXP、React UI 和应用侧薄桥接。
- `packages/core-engine`：共享 runtime。
- `packages/providers`：provider 语义、校验与映射。
- `packages/workflows`：declarative workflow specs。

## 先读哪里

- 项目摘要与入口：`README.md`、`STATUS.md`、`AGENTS.md`
- 当前 change 范围：`docs/IMPLEMENTATION_PLAN.md`
- 文档边界：`docs/BOUNDARIES.md`
- UI 输入：`docs/DESIGN.md`、`docs/TOKEN.md`、`docs/UI_MAIN_PAGE.md`
- 模块本地真相：各模块下的 `README.md`、`SPEC.md`、`STATUS.md`、`AGENTS.md`

## 单应用口径

- 当前唯一应用目录是 `app/`
- 当前版本不包含 `web` 应用
- `app/` 内部优先使用轻量结构：`ui / host / shared`

## 文档使用规则

- 子模块优先，根目录只负责索引和范围
- 代码只作弱证据，不覆盖已写明的意图
- 文档与代码冲突时，先写对应 `STATUS.md`
- 不为“看起来完整”而补流程、示例、runbook 或测试文档
