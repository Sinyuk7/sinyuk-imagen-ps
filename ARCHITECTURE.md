# 架构说明

## 分层架构

```text
┌─────────────────────────────────────────────────────────┐
│                    Surface Apps                         │
│  apps/app (Photoshop / UXP)   apps/cli (Node.js CLI)    │
└─────────────────────────┬───────────────────────────────┘
                          │ depends on
┌─────────────────────────▼───────────────────────────────┐
│              packages/shared-commands                    │
│        command facade / runtime assembly / DI            │
└─────────────────────────┬───────────────────────────────┘
                          │ depends on
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌──────────────┐  ┌────────────────┐  ┌────────────────┐
│ core-engine  │  │   providers    │  │   workflows    │
│ runtime      │  │ provider layer │  │ workflow specs │
└──────────────┘  └────────────────┘  └────────────────┘
```

依赖方向：**surface apps -> shared-commands -> runtime packages**，禁止反向依赖与 surface 之间相互依赖。

## 各层定义

### apps/app

- **职责**：Photoshop / UXP surface，承接 host integration、React UI、surface-local model 与 UXP adapter 注入
- **包名**：`@imagen-ps/app`
- **核心约束**：
  - 通过 `@imagen-ps/shared-commands` 调用业务命令
  - 不拥有 runtime assembly 或 provider 参数语义
  - 不作为 CLI 的依赖
  - Photoshop / UXP IO 必须停留在 `host/` 或 adapter 边界

### apps/cli

- **职责**：Node.js CLI surface，承接命令行解析、JSON stdout/stderr、exit code 与 Node-only adapter 注入
- **包名**：`@imagen-ps/cli`
- **核心约束**：
  - 通过 `@imagen-ps/shared-commands` 调用业务命令
  - MUST NOT 依赖 `@imagen-ps/app`
  - Node 文件系统能力只能停留在 CLI adapter 内，不能进入 shared commands

### packages/shared-commands

- **职责**：公共 application/use-case 层，提供 command facade、runtime assembly、CommandResult、公开命令类型与 adapter injection
- **包名**：`@imagen-ps/shared-commands`
- **核心约束**：
  - 可依赖 `core-engine`、`providers`、`workflows`
  - MUST NOT 依赖 React、DOM、Photoshop、UXP、Node fs/path/os 或任意 surface app
  - 不暴露 mutable runtime/store/dispatcher 实例

### packages/core-engine

- **职责**：共享 runtime 层，host-agnostic
- **包名**：`@imagen-ps/core-engine`
- **核心约束**：
  - 负责 job lifecycle、workflow 执行、provider dispatch 边界、运行时状态管理
  - 不负责 provider 参数语义与外部 API 映射
  - 不负责 UI、CLI、Photoshop host 逻辑
  - 不负责文件系统、网络或宿主 IO

### packages/providers

- **职责**：provider 语义层，隔离外部 provider API 与内部 runtime contract
- **包名**：`@imagen-ps/providers`
- **核心约束**：
  - 负责配置校验、请求校验、调用、响应归一化、错误映射
  - 不负责 runtime lifecycle 与 engine state
  - 不负责 settings / secret 持久化

### packages/workflows

- **职责**：declarative workflow spec 定义
- **包名**：`@imagen-ps/workflows`
- **核心约束**：
  - 只定义 spec，不含 surface 编排
  - 不负责 host side effects

## 依赖约束

| 模块 | 允许依赖 | 禁止依赖 |
|---|---|---|
| `apps/app` | `@imagen-ps/shared-commands`, React/UXP surface dependencies | `apps/cli`, runtime assembly internals |
| `apps/cli` | `@imagen-ps/shared-commands`, CLI/Node dependencies | `@imagen-ps/app`, Photoshop/UXP |
| `packages/shared-commands` | `core-engine`, `providers`, `workflows` | `apps/*`, React, DOM, Photoshop, UXP, Node fs/path/os |
| `packages/workflows` | `core-engine` | `apps/*`, `providers`, `shared-commands` |
| `packages/providers` | `core-engine` | `apps/*`, `workflows`, `shared-commands` |
| `packages/core-engine` | 外部 npm 包（`mitt`, `zod`） | `apps/*`, `shared-commands`, `providers`, `workflows` |

## IO 规则

- IO 只能存在于 surface app 的 host/adapter 边界或 provider transport 边界
- `packages/shared-commands` 不直接执行文件系统、Photoshop/UXP 或 DOM IO
- `core-engine` 不允许文件系统、网络或宿主 IO

## 目录结构

```text
sinyuk-imagen-ps/
├── apps/
│   ├── app/                       # Photoshop / UXP surface
│   │   └── src/
│   │       ├── ui/                # React UI
│   │       ├── host/              # Photoshop / UXP 相关
│   │       └── shared/            # surface-local model
│   └── cli/                       # Node.js CLI surface
├── packages/
│   ├── shared-commands/           # 公共 command facade + runtime assembly
│   ├── core-engine/               # 共享 runtime
│   ├── providers/                 # provider 语义层
│   └── workflows/                 # workflow spec
├── docs/                          # 项目文档
├── openspec/                      # 变更规范与 spec 存档
├── AGENTS.md                      # 根级规则
├── ARCHITECTURE.md                # 本文件
├── README.md                      # 项目摘要
├── STATUS.md                      # 项目状态
├── package.json                   # 根级配置
├── pnpm-workspace.yaml            # workspace 配置
└── turbo.json                     # Turborepo 配置
```

## 业务链路

```text
surface -> shared commands -> runtime -> provider -> adapter
```

- `surface`：`apps/app` 或 `apps/cli`
- `shared commands`：`packages/shared-commands` 提供的命令入口
- `runtime`：`core-engine` 提供的 job lifecycle 和 workflow 执行
- `provider`：`providers` 提供的 provider 调度与响应归一化
- `adapter`：settings storage、secret storage、asset IO 等边界适配