# AGENTS.md

- 先读 `README.md`、`SPEC.md`、`STATUS.md`。
- 本模块层级是 `workflows`，只放 declarative workflow specs。
- 允许内容：step ordering、input binding、output key、workflow metadata、builtin specs。
- 禁止内容：可执行逻辑、provider transport、host IO、runtime state mutation、UI shape。
- `workflows` 可以依赖 `core-engine` 的共享类型，但不应承载 `providers` 或 host 语义。
- 当前只记录最小 builtin workflow 范围，不扩写 DAG、visual editor 或 writeback 方案。
- 文档与代码冲突时，先写入 `STATUS.md`，不要把 Proposed 设计写成现实结构。

