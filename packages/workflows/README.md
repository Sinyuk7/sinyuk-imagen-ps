# workflows

`workflows` 只承载 declarative workflow specs。它描述执行顺序、输入绑定和输出交接，但不包含可执行逻辑本身。

## 先读哪里

- `SPEC.md`：当前公开面与 shape 约束
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

- `AGENTS.md`：模块约束与 Docs Map
- `SPEC.md`：当前公开面与 shape 约束
- `OPEN_ITEMS.md`：已知未解决问题
- `docs/`：操作参考（SETUP、USAGE、CODE_CONVENTIONS、STABILITY）
