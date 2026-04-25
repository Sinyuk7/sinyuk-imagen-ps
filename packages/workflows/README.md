# workflows

`workflows` 只承载 declarative workflow specs。它描述执行顺序、输入绑定和输出交接，但不包含可执行逻辑本身。

## 先读哪里

- `SPEC.md`：当前阶段的本地规范
- `STATUS.md`：实现状态、偏差与不确定项
- `AGENTS.md`：模块级短规则

## 本模块负责什么

- builtin workflow specs
- step ordering
- input binding / output key
- 提供给 `core-engine` 直接消费的稳定 shape

## 本模块不负责什么

- executable logic
- provider transport 或参数语义
- host IO / network / 文件系统
- UI-facing 数据结构
- runtime state mutation 或 persistence

## 当前文档集

- `README.md`：模块摘要
- `SPEC.md`：当前阶段规范
- `STATUS.md`：现状与偏差
- `AGENTS.md`：模块级短规则

当前不单独创建 `TESTING.md`、`RUNBOOK.md`、`examples/`。原因是模块仍处于最小 shape 定义阶段。

