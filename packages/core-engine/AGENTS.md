# AGENTS.md

- 先读 `README.md`、`SPEC.md`、`OPEN_ITEMS.md`。
- 本模块层级是 `core-engine`，只负责 host-agnostic runtime。
- 允许内容：共享类型、错误模型、边界守卫、job store、event bus、workflow registry、provider dispatch、runtime orchestration。
- 禁止内容：DOM、Browser API、UXP / Photoshop API、文件系统、网络请求、provider 参数语义、UI 逻辑。
- 只通过抽象边界依赖其他层：`ProviderDispatcher`、`WorkflowRegistry`、adapter contract。
- engine 负责 lifecycle、执行顺序和状态记录，不负责 provider 语义解释。
- 发现文档与代码不一致时，记录到 `OPEN_ITEMS.md`，不要直接把实现细节提升为稳定规范。
- 保持文件小、控制流浅、失败显式。
