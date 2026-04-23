# AGENTS.md

- 先读根级 `README.md`、`STATUS.md`，再进入目标模块读取本地 `README.md`、`SPEC.md`、`STATUS.md`、`AGENTS.md`。
- 根目录只负责索引、范围和跨模块约束；模块细节以下层文档为准。
- 文档优先级：`AGENTS.md` > PRD / 设计文档 > README / 现有模块文档 > 目录结构 > 代码。
- 当前活跃模块：`app`、`packages/core-engine`、`packages/providers`、`packages/workflows`。
- 当前唯一应用目录是 `app/`，不要再按多应用仓库假设补结构。
- `core-engine` 只做 host-agnostic runtime。
- `providers` 只做 provider 语义、校验与 API 映射。
- `workflows` 只放 declarative spec，不放可执行逻辑。
- `app` 属于 host / app 层，不拥有 runtime 或 provider 语义。
- 所有 IO 必须停留在 `app/host` 或 adapter 边界，不能回流进 engine。
- 不要把早期代码形状写成稳定架构；事实不稳定时，用“暂定”表述。
- 文档与代码冲突时，先保留已写明的意图，再把偏差记入对应 `STATUS.md`。
- `AGENTS.md` 保持短小，只写索引和本地规则。

