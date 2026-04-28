## Why

当前 `app/src/shared/commands` 承担跨 surface 的 command facade 职责，但物理上归属于 Photoshop app。随着 CLI surface 引入，`CLI -> app -> packages` 会让 Node CLI 隐式依赖 Photoshop app 边界，破坏 host-agnostic 目标。

本变更将项目重构为标准 monorepo surface 架构：`apps/app` 与 `apps/cli` 作为独立 surface，共同依赖公共 `packages/shared-commands` application 层。

## What Changes

- **BREAKING**：将顶层 `app/` 迁移为 `apps/app/`，保留 package name `@imagen-ps/app`
- 新增 `packages/shared-commands/`，承载 command facade、runtime assembly、公开 command 类型与 adapter injection
- 将现有 `app/src/shared/commands/**` 与 `app/src/shared/runtime.ts` 迁移到 `packages/shared-commands/src/**`
- 调整依赖方向为 `surface apps -> shared-commands -> core-engine/providers/workflows`
- `apps/app` 仅保留 Photoshop/UXP surface 职责：host shell、UI、surface-local model、UXP adapter 注入
- `apps/cli` 将依赖 `@imagen-ps/shared-commands`，不得依赖 `@imagen-ps/app`
- 更新 workspace/build/test 配置，将 workspace 范围从 `app + packages/*` 调整为 `apps/* + packages/*`
- 更新项目架构文档、模块注册表、跨模块通信说明与构建文档
- 增加架构守护验证，防止 shared commands 引入 Photoshop/UXP/React/DOM/Node-only 依赖

## Non-goals

- 不重写 `core-engine`、`providers`、`workflows` 的业务语义
- 不引入 Web surface 或 server surface
- 不实现 CLI npm 发布流程
- 不实现跨进程 job history 持久化
- 不改变 provider config 的业务校验规则
- 不把 Photoshop/UXP host 能力抽象进 `core-engine`

## Capabilities

### New Capabilities

- `surface-monorepo-architecture`: surface apps、application layer、runtime/domain packages 的目录结构与依赖边界
- `shared-commands-layer`: 公共 command facade、runtime assembly、adapter injection 与 host-agnostic 约束

### Modified Capabilities

- `shared-commands`: 现有 shared commands 的归属从 Photoshop app 内部模块调整为公共 package，并保持公开命令契约
- `shared-commands-provider-config`: config adapter injection 的宿主从 app 内部 runtime 调整为 shared commands package
- `shared-commands-retry`: retry command 的宿主从 app 内部 runtime 调整为 shared commands package

## Impact

- 目录结构：`app/` -> `apps/app/`，新增 `apps/cli/` 与 `packages/shared-commands/`
- Workspace：更新 `pnpm-workspace.yaml` 为 `apps/*` 与 `packages/*`
- Build graph：更新 Turbo、TypeScript project references、package exports 与 filter 文档
- Imports：`apps/app` 与 `apps/cli` 通过 `@imagen-ps/shared-commands` 调用 commands
- Documentation：更新 `AGENTS.md`、`ARCHITECTURE.md`、`docs/COMPONENT_REGISTRY.md`、`docs/CROSS_MODULE.md`、`docs/BUILD_SYSTEM.md`、`docs/SETUP.md`、`docs/USAGE.md`
- Active changes：`openspec/changes/cli-surface` 需要改为依赖 `@imagen-ps/shared-commands`，删除 `CLI -> app -> packages` 决策
