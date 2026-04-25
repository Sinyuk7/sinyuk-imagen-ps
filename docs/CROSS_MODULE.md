# 跨模块通信

## 通信机制选型

本项目为 TypeScript monorepo，包间通信采用**直接 import**方式。

### 包间依赖

| 场景 | 机制 |
|------|------|
| 类型共享 | TypeScript import |
| 函数调用 | 直接 import 并调用 |
| 事件通信 | `core-engine` 提供的 EventBus |

### 运行时通信

| 场景 | 机制 |
|------|------|
| runtime 内部事件 | `mitt` 事件总线（封装于 `core-engine/events.ts`） |
| provider 调度 | dispatch adapter 模式 |
| workflow 执行 | runner 同步/异步调用 |

## 接口定义规范

### 类型定义位置

所有跨包共享的类型定义于 `core-engine`：

```
packages/core-engine/src/types/
├── index.ts      # 统一导出
├── asset.ts      # Asset 相关类型
├── events.ts     # 事件类型
├── job.ts        # Job 相关类型
├── provider.ts   # Provider dispatch 类型
└── workflow.ts   # Workflow 相关类型
```

### 契约定义位置

Provider 契约定义于 `providers`：

```
packages/providers/src/contract/
├── index.ts        # 统一导出
├── capability.ts   # Provider 能力声明
├── config.ts       # Provider 配置 schema
├── diagnostics.ts  # 诊断信息类型
├── provider.ts     # Provider 接口
├── request.ts      # 请求类型
└── result.ts       # 结果类型
```

## 禁止事项

| 禁止行为 | 原因 |
|----------|------|
| 直接依赖其他业务模块内部实现 | 破坏封装，导致耦合 |
| `core-engine` import `providers` 或 `workflows` | 违反分层依赖方向 |
| `providers` import `workflows` | 违反分层依赖方向 |
| 在 `app` 中绕过 `shared/` 直接使用底层包内部 API | 破坏收口约定 |
| 使用全局变量进行跨模块状态共享 | 难以追踪，破坏可测试性 |

## Bridge / Adapter 模式

### dispatch adapter

`providers` 提供 `createDispatchAdapter` 用于桥接 `core-engine` 和具体 provider：

```typescript
// packages/providers/src/bridge/create-dispatch-adapter.ts
import type { ProviderDispatch } from '@imagen-ps/core-engine';

export function createDispatchAdapter(registry: ProviderRegistry): ProviderDispatch {
  // 将 provider registry 适配为 core-engine 的 dispatch 接口
}
```

这种模式的好处：
- `core-engine` 不需要知道 `providers` 的存在
- 依赖方向正确（`providers` 依赖 `core-engine`，反之不成立）
- 便于测试（可以 mock dispatch）

## 事件系统

### EventBus

`core-engine` 提供基于 `mitt` 的事件总线：

```typescript
import { createEventBus } from '@imagen-ps/core-engine';

const bus = createEventBus();

// 订阅
bus.on('job:created', (job) => { /* ... */ });
bus.on('job:completed', (job) => { /* ... */ });

// 发布
bus.emit('job:created', job);
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

1. **通过公开入口导入**：使用包的 `index.ts` 导出，不直接导入内部文件
2. **类型优先**：跨包通信优先定义清晰的类型契约
3. **单向依赖**：保持依赖方向一致，上层依赖下层
4. **adapter 隔离**：跨层通信通过 adapter 模式桥接
