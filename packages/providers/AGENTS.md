# AGENTS.md

## Project Overview

`@imagen-ps/providers` — Provider 语义层。负责把外部 provider API 与内部 runtime contract 隔离，承担配置校验、请求校验、调用、响应归一化和错误映射。不负责 runtime lifecycle、job store、facade orchestration、host IO、settings persistence。

## Docs Map

| 主题 | 路径 |
|------|------|
| 环境与构建 | [docs/SETUP.md](docs/SETUP.md) |
| 组件接入 | [docs/USAGE.md](docs/USAGE.md) |
| 代码规范 | [docs/CODE_CONVENTIONS.md](docs/CODE_CONVENTIONS.md) |
| 稳定性规范 | [docs/STABILITY.md](docs/STABILITY.md) |
| 架构说明 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 待解决项 | [OPEN_ITEMS.md](OPEN_ITEMS.md) |
