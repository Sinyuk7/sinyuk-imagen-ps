# AGENTS.md

## Project Overview

`sinyuk-imagen-ps` — Photoshop 图像生成插件 monorepo。包含两个 surface 应用 `apps/app`、`apps/cli`，以及四个共享包 `shared-commands`、`core-engine`、`providers`、`workflows`。

## Architecture Boundary

依赖方向为 `surface apps -> packages/shared-commands -> runtime packages`：

- `apps/app`：Photoshop / UXP surface，负责 host integration、React UI、surface-local model 与 UXP adapter 注入。
- `apps/cli`：Node.js CLI surface，负责命令行解析、stdout/stderr、Node-only adapter 注入。
- `packages/shared-commands`：公共 application/use-case 层，负责 command facade、runtime assembly、CommandResult 与 adapter injection。
- `packages/core-engine`、`packages/providers`、`packages/workflows`：host-agnostic runtime/domain packages。

`apps/cli` MUST NOT 依赖 `@imagen-ps/app`。`packages/shared-commands` MUST NOT 依赖 React、DOM、Photoshop、UXP、Node fs/path/os 或任意 surface app。

## Docs Map

| 主题 | 路径 |
|------|------|
| 环境与构建 | [docs/SETUP.md](docs/SETUP.md) |
| 模块使用 | [docs/USAGE.md](docs/USAGE.md) |
| 代码规范 | [docs/CODE_CONVENTIONS.md](docs/CODE_CONVENTIONS.md) |
| 文档注释规范 | [docs/CODE_CONVENTIONS.md#函数注释](docs/CODE_CONVENTIONS.md#函数注释) |
| 稳定性规范 | [docs/STABILITY.md](docs/STABILITY.md) |
| 测试规范 | [docs/TESTING.md](docs/TESTING.md) |
| 变更管理 | [docs/CHANGE_MANAGEMENT.md](docs/CHANGE_MANAGEMENT.md) |
| 构建系统 | [docs/BUILD_SYSTEM.md](docs/BUILD_SYSTEM.md) |
| 模块注册表 | [docs/COMPONENT_REGISTRY.md](docs/COMPONENT_REGISTRY.md) |
| 跨模块通信 | [docs/CROSS_MODULE.md](docs/CROSS_MODULE.md) |
| 架构说明 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 设计系统（UI 阶段参考） | [archive/DESIGN.md](archive/DESIGN.md) |
| UI 主页面（UI 阶段参考） | [archive/UI_MAIN_PAGE.md](archive/UI_MAIN_PAGE.md) |
| Token 系统（UI 阶段参考） | [archive/TOKEN.md](archive/TOKEN.md) |
