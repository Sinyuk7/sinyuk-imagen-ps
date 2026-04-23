# providers

`providers` 是 provider 语义层。它负责把外部 provider API 与内部 runtime contract 隔离开来，承担配置校验、请求校验、调用、响应归一化和错误映射。

## 先读哪里

- `SPEC.md`：当前阶段的本地规范
- `STATUS.md`：实现状态、偏差与不确定项
- `AGENTS.md`：模块级短规则
- `PRD.md`：更完整但更偏设计输入的说明

## 本模块负责什么

- provider contract 与 descriptor
- config / request 校验
- provider registry
- `mock provider`
- 当前阶段的 `openai-compatible` baseline
- transport helper、error map、response normalization

## 本模块不负责什么

- runtime lifecycle 与 engine state
- facade 命令编排
- settings / secret 持久化
- host-specific IO 或 UI-facing model
- 跨 provider 参数统一

## 当前文档集

- `README.md`：模块摘要
- `SPEC.md`：当前阶段规范
- `STATUS.md`：已实现、未实现、偏差与待定项
- `AGENTS.md`：模块级短规则

当前不单独创建 `TESTING.md`、`RUNBOOK.md`、`examples/`。这些内容还没有稳定到值得独立维护。

