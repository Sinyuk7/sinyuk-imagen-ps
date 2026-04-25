# providers

`providers` 是 provider 语义层。它负责把外部 provider API 与内部 runtime contract 隔离开来，承担配置校验、请求校验、调用、响应归一化和错误映射。

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

当前不单独创建 `TESTING.md`、`RUNBOOK.md`、`examples/`。这些内容还没有稳定到值得独立维护。
