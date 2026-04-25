# AGENTS.md

- 先读 `README.md`、`OPEN_ITEMS.md`。
- 本模块层级是 `providers`，负责 provider 语义、校验、外部 API 映射与错误归一化。
- 允许内容：provider descriptor、config / request 校验、registry、mock provider、transport helper、response normalization。
- 禁止内容：runtime lifecycle、job store、facade orchestration、host IO、UI model、settings persistence。
- engine 不应理解 provider 参数语义；这些语义必须留在本模块。
- 当前只写当前阶段确定的 family 与 contract，不扩写未来 provider 矩阵。
- 文档与代码冲突时，先写入 `OPEN_ITEMS.md`，不要把空实现包装成已落地能力。
