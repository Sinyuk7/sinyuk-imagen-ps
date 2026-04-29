# Architecture

> **边界契约的权威来源是 [SPEC.md](./SPEC.md)。** 本文件只说明内部结构、流程与模块职责，不重复定义稳定边界与公开面。

## 概述

`@imagen-ps/core-engine` 是 imagen-ps monorepo 中的核心 runtime 层，提供 host-agnostic 的 workflow 执行能力。它位于上层应用（`app`）与底层能力包（`providers`、`workflows`）之间，负责：

- **Job Lifecycle** — 统一的 job 状态机（created → running → completed/failed）
- **Workflow Orchestration** — workflow 注册、查找与执行
- **Provider Dispatch** — 通过抽象 adapter 边界调用外部 provider
- **Event Bus** — job lifecycle 事件订阅与广播
- **State Store** — in-memory job 存储与查询

```
┌─────────────────────────────────────────────────────────────────┐
│                            app                                  │
│                    (UXP / Photoshop host)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       core-engine                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  Runtime │──│  Store   │──│  Events  │──│  Registry        │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
│       │                                           │             │
│       └────────────┬──────────────────────────────┘             │
│                    ▼                                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Runner + Dispatcher (抽象边界)                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │providers │   │workflows │   │  其他包  │
        └──────────┘   └──────────┘   └──────────┘
```

## 模块结构

```
src/
├── index.ts           # 公开 API 聚合导出
├── types/             # 共享类型定义
│   ├── index.ts       # 类型聚合导出
│   ├── job.ts         # Job、JobStore、JobStoreController
│   ├── workflow.ts    # Workflow、Step、WorkflowRegistry
│   ├── provider.ts    # ProviderRef、ProviderDispatchAdapter、ProviderDispatcher
│   ├── asset.ts       # Asset、AssetType
│   └── events.ts      # JobEvent、JobEventBus
├── errors.ts          # 统一错误模型（JobError、ErrorCategory）
├── invariants.ts      # 边界守卫（assertSerializable、assertImmutable）
├── store.ts           # In-memory job store 与状态机
├── events.ts          # Job lifecycle event bus（基于 mitt）
├── registry.ts        # Workflow registry
├── dispatch.ts        # Provider dispatch 抽象边界
├── runner.ts          # Workflow runner
└── runtime.ts         # Runtime 组装入口
```

### 各模块职责

| 模块 | 职责 |
|------|------|
| `types/` | 定义所有核心类型，确保跨模块类型一致性 |
| `errors.ts` | 提供分类明确的错误模型，所有错误均为 serializable 对象 |
| `invariants.ts` | 边界守卫函数，确保数据 serializable 且 immutable |
| `store.ts` | Job 状态存储与状态机，返回 immutable snapshot |
| `events.ts` | Job lifecycle 事件广播，使用 mitt 实现 |
| `registry.ts` | Workflow 注册与查找 |
| `dispatch.ts` | Provider 调用的抽象边界，通过 adapter 模式解耦 |
| `runner.ts` | Workflow 执行器，按顺序执行 steps |
| `runtime.ts` | 组装所有部件，提供统一的 `Runtime` 接口 |

## 核心流程

### Job 执行流程

```
1. 用户调用 runtime.runWorkflow(workflowName, input)
   │
2. store.submitJob(input)
   │ → 创建 job，状态: created
   │ → 返回 immutable snapshot
   │
3. events.emit({ type: 'created', job })
   │
4. registry.getWorkflow(workflowName)
   │ → 查找 workflow 定义
   │
5. runner.executeWorkflow(job, workflow)
   │ → controller.markRunning(job.id)
   │ → 遍历 workflow.steps
   │   └─ 对于 provider step: dispatcher.dispatch(ref, params)
   │ → 成功: controller.markCompleted(job.id, output)
   │ → 失败: controller.markFailed(job.id, error)
   │
6. events.emit({ type: 'completed' | 'failed', job })
   │
7. 返回最终 job snapshot
```

### 状态迁移

```
created ──► running ──► completed
                   └──► failed
```

- `created` → `running`：job 开始执行
- `running` → `completed`：所有 steps 成功完成
- `running` → `failed`：任意 step 失败
- `completed` / `failed` 为终态，不可再迁移

## 关键依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| mitt | ^3.0.1 | 轻量级 event emitter，用于 job lifecycle 事件 |
| zod | ^4.3.6 | 运行时类型校验（保留，当前主要用于边界验证） |

## 设计约束

稳定边界与公开面定义见 [SPEC.md](./SPEC.md)。本模块内部遵循以下实现约束：

1. **Host-agnostic** — 不依赖 DOM、Browser API、UXP、Photoshop API、文件系统、网络
2. **Serializable** — 所有跨边界数据（input、output、error）必须可序列化
3. **Immutable snapshots** — 对外返回的 Job 对象均为 immutable，内部状态隔离
4. **显式失败** — 失败必须以显式错误模型暴露，不允许 silent fallback
5. **抽象边界** — engine 通过 adapter 模式调用 provider，不直接理解 provider 参数语义
6. **单向数据流** — store 是状态真相，event bus 只做通知，不承载状态
