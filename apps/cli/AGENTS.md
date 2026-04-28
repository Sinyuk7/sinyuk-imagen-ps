# AGENTS.md

## Project Overview

`@imagen-ps/cli` — imagen-ps 的 Node.js CLI surface，提供 provider 管理与 job 提交/查询的 automation 命令。负责命令行解析、JSON I/O、exit code 管理与 Node-only adapter（FileConfigAdapter）注入。不负责 UI 渲染、Photoshop/UXP 集成或业务逻辑（由 `@imagen-ps/shared-commands` 承载）。

## Docs Map

| 主题 | 路径 |
|------|------|
| 环境与构建 | [docs/SETUP.md](docs/SETUP.md) |
| 组件接入 | [docs/USAGE.md](docs/USAGE.md) |
| 代码规范 | [docs/CODE_CONVENTIONS.md](docs/CODE_CONVENTIONS.md) |
| 稳定性规范 | [docs/STABILITY.md](docs/STABILITY.md) |
| 架构说明 | [ARCHITECTURE.md](ARCHITECTURE.md) |
