# CLAUDE.md

> **Note**: This file mirrors `AGENTS.md`. In Unix environments, this would be a symlink (`ln -sf AGENTS.md CLAUDE.md`).

## Project Overview

`@imagen-ps/workflows` — declarative workflow specs 模块。只定义 workflow shape（step ordering、input binding、output key、metadata），不含可执行逻辑。向 `core-engine` 提供可直接消费的稳定 builtin workflow 集合。不负责 provider transport、host IO、runtime state mutation 或 UI-facing shape。

## Docs Map

| 主题 | 路径 |
|------|------|
| 环境与构建 | [docs/SETUP.md](docs/SETUP.md) |
| 模块使用 | [docs/USAGE.md](docs/USAGE.md) |
| 代码规范 | [docs/CODE_CONVENTIONS.md](docs/CODE_CONVENTIONS.md) |
| 稳定性规范 | [docs/STABILITY.md](docs/STABILITY.md) |
| 架构说明 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 模块规范 | [SPEC.md](SPEC.md) |
| 模块状态 | [STATUS.md](STATUS.md) |
