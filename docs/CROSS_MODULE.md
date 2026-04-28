# 跨模块通信

## 通信机制选型

本项目为 TypeScript monorepo，包间通信采用**直接 import 公开 package 入口**方式。

### 分层调用路径

```text
apps/app ─────┐
              ├──▶ packages/shared-commands ───▶ packages/core-engine
apps/cli ─────┘                                  ├──▶ packages/providers
                                                 └──▶ packages/workflows
```

### 包间依赖

| 场景 | 机制 |
|------|------|
| surface 调用业务能力 | import `@imagen-ps/shared-commands` |
| shared commands 组装 runtime | import `@imagen-ps/core-engine`、`@imagen-ps/providers`、`@imagen-ps/workflows` |
| 类型共享 | TypeScript import |
| runtime 内部事件 | `core-engine` 提供的 EventBus |
| surface-specific persistence | adapter injection |

## Surface 与 shared commands

Surface app 不直接组装 runtime，也不直接访问 provider registry 或 workflow registry。Surface 只能通过 shared commands 调用用例能力：

```typescript
import { submitJob, setConfigAdapter } from '@imagen-ps/shared-commands';
```

不同 surface 的 IO 能力通过 adapter 注入：

- `apps/app`：创建 UXP/Photoshop-specific adapter 后注入
- `apps/cli`：创建 Node-only file adapter 后注入
- `packages/shared-commands`：只接收 adapter interface，不直接 import host API 或 Node fs/path/os

## 接口定义规范

### 命令 facade

公共命令定义于 `packages/shared-commands`：

```text
packages/shared-commands/src/commands/
├── index.ts
├── types.ts
├── submit-job.ts
├── get-job.ts
├── subscribe-job-events.ts
├── list-providers.ts
├── describe-provider.ts
├── get-provider-config.ts
├── save-provider-config.ts
└── retry-job.ts
```

### 核心类型

跨 runtime 的基础类型定义于 `core-engine`：

```text
packages/core-engine/src/types/
├── index.ts
├── asset.ts
├── events.ts
├── job.ts
├── provider.ts
└── workflow.ts
```

### Provider 契约

Provider 契约定义于 `providers`：

```text
packages/providers/src/contract/
├── index.ts
├── capability.ts
├── config.ts
├── diagnostics.ts
├── provider.ts
├── request.ts
└── result.ts
```

## 禁止事项

| 禁止行为 | 原因 |
|----------|------|
| `apps/cli` 依赖 `@imagen-ps/app` | surface 之间不得相互依赖 |
| surface 绕过 `@imagen-ps/shared-commands` 直接组装 runtime | 泄漏 runtime lifecycle 与 provider registry 细节 |
| `packages/shared-commands` import React / DOM / Photoshop / UXP / Node fs/path/os | 破坏 host-agnostic application layer |
| `core-engine` import `providers`、`workflows` 或 `shared-commands` | 违反 runtime/domain 底层边界 |
| `providers` import `workflows` | 违反分层依赖方向 |
| 使用全局变量进行跨模块状态共享 | 难以追踪，破坏可测试性 |

## Bridge / Adapter 模式

### dispatch adapter

`providers` 提供 `createDispatchAdapter` 用于桥接 `core-engine` 和具体 provider：

```typescript
import type { ProviderDispatch } from '@imagen-ps/core-engine';

export function createDispatchAdapter(/* provider + config */): ProviderDispatch {
  // 将 provider 适配为 core-engine 的 dispatch 接口
}
```

这种模式的好处：
- `core-engine` 不需要知道 `providers` 的存在
- 依赖方向正确（`providers` 依赖 `core-engine`，反之不成立）
- 便于测试（可以 mock dispatch）

### config storage adapter

`packages/shared-commands` 暴露 `ConfigStorageAdapter` 与 `setConfigAdapter`：

```typescript
import { setConfigAdapter } from '@imagen-ps/shared-commands';

setConfigAdapter(surfaceSpecificAdapter);
```

Surface-specific adapter 归属 surface app，不进入 shared commands。

## 事件系统

### EventBus

`core-engine` 提供基于 `mitt` 的事件总线，并由 shared commands 通过 `subscribeJobEvents` 暴露给 surface：

```typescript
import { subscribeJobEvents } from '@imagen-ps/shared-commands';

const unsubscribe = subscribeJobEvents((event) => {
  // handle job lifecycle event
});
```

### 事件类型

| 事件 | 触发时机 |
|------|----------|
| `job:created` | job 创建时 |
| `job:running` | job 开始执行时 |
| `job:completed` | job 成功完成时 |
| `job:failed` | job 执行失败时 |

具体事件类型定义见 `packages/core-engine/src/types/events.ts`。

## 最佳实践

1. **通过公开入口导入**：使用 package exports，不直接导入内部文件
2. **Surface 只调 commands**：`apps/app` 与 `apps/cli` 通过 `@imagen-ps/shared-commands` 调用用例能力
3. **类型优先**：跨包通信优先定义清晰的类型契约
4. **单向依赖**：保持 `surface -> shared-commands -> runtime packages`
5. **adapter 隔离**：host/Node/UXP 差异通过 adapter 注入