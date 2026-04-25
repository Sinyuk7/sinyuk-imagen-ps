# 架构说明

## 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                        app                               │
│           (UI / Host / 应用侧薄桥接)                      │
└─────────────────────────┬───────────────────────────────┘
                          │ depends on
┌─────────────────────────▼───────────────────────────────┐
│                   packages/workflows                     │
│              (declarative workflow specs)                │
└─────────────────────────┬───────────────────────────────┘
                          │ depends on
┌─────────────────────────▼───────────────────────────────┐
│                   packages/providers                     │
│         (provider 语义、校验、映射、registry)             │
└─────────────────────────┬───────────────────────────────┘
                          │ depends on
┌─────────────────────────▼───────────────────────────────┐
│                  packages/core-engine                    │
│              (共享 runtime、无外部依赖)                   │
└─────────────────────────────────────────────────────────┘
```

依赖方向：**上层依赖下层，禁止反向依赖**。

## 各层定义

### app

- **职责**：唯一应用目录，承接 Photoshop / UXP、React UI 和应用侧薄桥接
- **内部结构**：`ui/` / `host/` / `shared/`
- **核心约束**：
  - 不拥有 runtime lifecycle 或 provider 参数语义
  - 所有 UXP / Photoshop IO 必须停留在 `host/` 或 adapter 边界
  - 对共享模块的调用通过 `shared/` 收口

### packages/workflows

- **职责**：declarative workflow spec 定义
- **包名**：`@imagen-ps/workflows`
- **核心约束**：
  - 只定义 spec，不含可执行逻辑
  - 不负责 surface 编排或 host side effects

### packages/providers

- **职责**：provider 语义层，隔离外部 provider API 与内部 runtime contract
- **包名**：`@imagen-ps/providers`
- **核心约束**：
  - 负责配置校验、请求校验、调用、响应归一化、错误映射
  - 不负责 runtime lifecycle 与 engine state
  - 不负责 settings / secret 持久化

### packages/core-engine

- **职责**：共享 runtime 层，host-agnostic
- **包名**：`@imagen-ps/core-engine`
- **核心约束**：
  - 负责 job lifecycle、workflow 执行、provider dispatch 边界、运行时状态管理
  - 不负责 provider 参数语义与外部 API 映射
  - 不负责 UI、CLI、Photoshop host 逻辑
  - 不负责文件系统、网络或宿主 IO

## 依赖约束

| 层 | 允许依赖 | 禁止依赖 |
|---|---|---|
| `app` | `workflows`, `providers`, `core-engine` | - |
| `workflows` | `core-engine` | `app`, `providers` |
| `providers` | `core-engine` | `app`, `workflows` |
| `core-engine` | 外部 npm 包（`mitt`, `zod`） | `app`, `workflows`, `providers` |

## IO 规则

- **IO 只能存在于 `app/host` 或 adapter 边界**
- **不允许 IO 进入 `core-engine`**
- 网络请求、文件读写、Photoshop API 调用等 IO 操作由 `app` 层或 adapter 承担

## 目录结构

```
sinyuk-imagen-ps/
├── app/                          # 唯一应用
│   ├── src/
│   │   ├── ui/                   # React UI
│   │   ├── host/                 # Photoshop / UXP 相关
│   │   └── shared/               # 对共享模块的薄桥接
│   ├── package.json
│   ├── AGENTS.md
│   ├── SPEC.md
│   ├── STATUS.md
│   └── README.md
├── packages/
│   ├── core-engine/              # 共享 runtime
│   ├── providers/                # provider 语义层
│   └── workflows/                # workflow spec
├── docs/                         # 项目文档
├── openspec/                     # 变更规范与 spec 存档
├── AGENTS.md                     # 根级规则
├── ARCHITECTURE.md               # 本文件
├── README.md                     # 项目摘要
├── STATUS.md                     # 项目状态
├── package.json                  # 根级配置
├── pnpm-workspace.yaml           # workspace 配置
└── turbo.json                    # Turborepo 配置
```

## 业务链路

当前优先验证的业务链路：

```
surface -> shared commands -> runtime -> provider -> adapter
```

- `surface`：当前阶段优先指 CLI，后续为 UXP UI
- `shared commands`：面向 surface 的轻量命令入口
- `runtime`：`core-engine` 提供的 job lifecycle 和 workflow 执行
- `provider`：`providers` 提供的 provider 调度与响应归一化
- `adapter`：settings storage、secret storage、asset IO 等边界适配
