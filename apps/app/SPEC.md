# app 规范

- 状态：当前阶段规范
- 依据：根级 `AGENTS.md`、`docs/IMPLEMENTATION_PLAN.md`、`docs/DESIGN.md`、`docs/TOKEN.md`、`docs/UI_MAIN_PAGE.md`

## 模块目的

作为当前唯一应用目录，承接 Photoshop / UXP、React UI 和应用侧桥接。

## 稳定边界

- `app/` 属于 host / app 层
- 不拥有 runtime lifecycle 或 provider 参数语义
- 任何 UXP / Photoshop IO 都必须留在 `host` 或 adapter 边界
- 应用侧对共享模块的调用应通过 `shared/` 收口

## 当前阶段可确认的内容

- 包名：`@imagen-ps/app`
- 依赖共享包：`@imagen-ps/core-engine`、`@imagen-ps/providers`、`@imagen-ps/workflows`
- 当前代码仍是早期占位，模块以边界定义为主
- `ui / host / shared` 最小骨架已落地

## 当前阶段不应写成既成事实的内容

- 完整的页面树
- 完整的 host guard / writeback 流程
- 复杂的 view-model 分层
- 任何比“薄桥接”更重的应用层抽象

## 暂定信息

- 与共享命令面的精确交互形态
- writeback 与 asset adapter 的最终边界

## 当前刻意省略

- `RUNBOOK.md`
- `TESTING.md`
- `examples/`
- Photoshop 操作分步手册
