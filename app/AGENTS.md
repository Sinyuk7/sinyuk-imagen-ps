# AGENTS.md

- 先读 `README.md`、`SPEC.md`、`STATUS.md`，再读根级 `docs/DESIGN.md`、`docs/TOKEN.md`、`docs/UI_MAIN_PAGE.md`。
- 本模块是唯一应用目录，属于 host / app 层。
- 优先保持轻量结构：`ui / host / shared`。
- `ui` 只放 React UI，不直接拥有 runtime 或 provider 内部对象。
- `host` 只放 Photoshop / UXP 相关代码。
- `shared` 只放对共享模块的薄桥接，不要拔高成复杂架构层。
- 所有 UXP / Photoshop IO 都必须停留在 `host` 或 adapter 边界。
- 当前实现仍是入口占位；不要把未来目录草图写成现状。
- 文档与代码冲突时，先写入 `STATUS.md`。

