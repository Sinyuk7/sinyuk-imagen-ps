# AGENTS.md

## Development Phase Invariant

This project is in a zero-user, zero-history-burden development stage.

This is the highest-priority project rule in this repository. It applies before architecture preferences, implementation convenience, review comments, OpenSpec conventions, and any generated artifact template.

This invariant applies to every conversation, OpenSpec artifact, design document, implementation plan, review result, task list, code comment, JSDoc contract note, test description, and code change.

There are no existing users, no production data, no historical API contracts, no published plugin contract, and no legacy behavior to preserve. All decisions MUST optimize for the cleanest current-state architecture and simplest correct implementation.

The following concepts are forbidden unless the user explicitly overrides this invariant in the same conversation:

- compatibility layers
- migration paths
- upgrade paths
- version gates
- feature gates for old behavior
- legacy fallbacks
- old-contract support
- deprecated behavior preservation
- phased rollout logic
- backwards/forwards compatibility analysis
- versioned API/contract/spec labels such as `Stable v1`, `Stable v1.1`, `v2 contract`, or similar version declarations
- preserving behavior because it existed in a previous artifact, task, draft, implementation, or review comment
- speculative future-proofing such as `for future support`, `future model selection`, `future compatibility`, or placeholder fields not required by the current design

OpenSpec proposals, designs, specs, tasks, review notes, and archive notes MUST NOT introduce, preserve, or discuss these concepts. If an existing artifact or review comment contains them, treat that content as invalid and remove or rewrite it into a clean current-state design.

Before editing or accepting any OpenSpec artifact, the agent MUST actively scan for and eliminate forbidden language including `Stable v`, `v1`, `v1.1`, `legacy`, `compat`, `compatibility`, `migration`, `fallback`, `deprecated`, `rollout`, `upgrade`, `old contract`, `backward`, `forward`, and `future support` when those terms describe product/API/contract behavior rather than third-party dependency versions.

Do not classify invariant violations as P1/P2/P3 polish or archive-later work. Any occurrence in OpenSpec artifacts or design text is a blocking defect and MUST be fixed immediately before implementation proceeds.

Breaking changes are acceptable by default during this stage when they improve correctness, clarity, or architecture.

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
