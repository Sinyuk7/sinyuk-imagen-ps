# 架构说明

## 架构概述

`@imagen-ps/app` 是 `sinyuk-imagen-ps` monorepo 的唯一应用模块，位于分层架构的最上层。它承接 Photoshop/UXP host integration、React UI 组合，以及对共享模块（`core-engine`、`providers`、`workflows`）的薄桥接。

```
┌─────────────────────────────────────────────────────────┐
│                        app                              │
│           (UI / Host / 应用侧薄桥接)                    │  ← 本模块
└─────────────────────────┬───────────────────────────────┘
                          │ depends on
┌─────────────────────────▼───────────────────────────────┐
│                   packages/workflows                    │
│              (declarative workflow specs)               │
└─────────────────────────┬───────────────────────────────┘
                          │ depends on
┌─────────────────────────▼───────────────────────────────┐
│                   packages/providers                    │
│         (provider 语义、校验、映射、registry)           │
└─────────────────────────┬───────────────────────────────┘
                          │ depends on
┌─────────────────────────▼───────────────────────────────┐
│                  packages/core-engine                   │
│              (共享 runtime、无外部依赖)                 │
└─────────────────────────────────────────────────────────┘
```

依赖方向：**上层依赖下层，禁止反向依赖**。

## 模块结构

```
app/
├── src/
│   ├── ui/                   # React UI 层
│   │   └── app-shell.tsx     # 应用外壳组件
│   ├── host/                 # Photoshop/UXP 边界层
│   │   └── create-plugin-host-shell.ts
│   ├── shared/               # 共享模块桥接层
│   │   └── plugin-app-model.ts
│   └── index.tsx             # 插件入口，统一导出
├── docs/                     # 模块文档
├── AGENTS.md                 # 导航地图
├── ARCHITECTURE.md           # 本文件
├── SPEC.md                   # 本地规范
├── STATUS.md                 # 实现状态
├── README.md                 # 模块说明
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

### 各目录职责

| 目录 | 职责 | 不负责 |
|------|------|--------|
| `src/ui/` | React UI 组件、页面组合 | runtime 状态、provider 调用、host IO |
| `src/host/` | Photoshop/UXP API 调用、host capability | 业务逻辑、UI 渲染、shared module 语义 |
| `src/shared/` | 对 `core-engine`/`providers`/`workflows` 的薄桥接 | 复杂抽象层、view model、状态管理 |

## 核心流程

### 插件初始化流程

```
1. index.tsx 导入 createPluginHostShell
2. createPluginHostShell() 创建 PluginHostShell 实例
   └── 调用 createPluginAppModel() 初始化应用模型
3. 导出 pluginHost 供 UXP 宿主使用
4. AppShell 组件接收 host 实例进行渲染
```

### 业务链路（后续实现）

当前阶段为占位实现，后续完整业务链路为：

```
UI 交互 -> shared bridge -> shared commands -> runtime -> provider -> adapter
```

- UI 通过 `shared/` 层调用共享命令
- 共享命令操作 `core-engine` runtime
- runtime 调度 `providers` 执行任务
- adapter 处理 host-specific IO（如 Photoshop 文件操作）

## 关键依赖

| 依赖 | 用途 |
|------|------|
| `@imagen-ps/core-engine` | job lifecycle、workflow 执行、runtime API |
| `@imagen-ps/providers` | provider 语义、配置校验、调度 |
| `@imagen-ps/workflows` | declarative workflow spec |
| `react` | UI 组件框架 |
| `react-dom` | React DOM 渲染 |

## 设计约束

### 必须遵守

- 所有 Photoshop/UXP IO 必须停留在 `host/` 或 adapter 边界
- 不拥有 runtime lifecycle 或 provider 参数语义
- 对共享模块的调用必须通过 `shared/` 收口
- `ui/` 不直接持有 runtime 或 provider 内部对象

### 禁止行为

- 不把 host IO 回流进 `core-engine`
- 不在 `ui/` 直接调用 provider 内部逻辑
- 不把 shared 层拔高成复杂架构层
- 不把未来目录草图写成现状

## 与父工程的关系

`app` 模块是父工程 `sinyuk-imagen-ps` 的唯一应用目录。父工程还包含三个共享包：

- `packages/core-engine`：共享 runtime，host-agnostic
- `packages/providers`：provider 语义层
- `packages/workflows`：declarative workflow spec

父工程文档参考：
- 根级架构说明：`../ARCHITECTURE.md`
- 设计系统：`../archive/DESIGN.md`
- UI 主页面规范：`../archive/UI_MAIN_PAGE.md`
- 实施计划：`../archive/IMPLEMENTATION_PLAN.md`
