# 模块使用

## 包依赖声明

本项目为 monorepo 结构，包间依赖通过 pnpm workspace 管理。

### 在 app 中使用共享包

```json
// app/package.json
{
  "dependencies": {
    "@imagen-ps/core-engine": "workspace:*",
    "@imagen-ps/providers": "workspace:*",
    "@imagen-ps/workflows": "workspace:*"
  }
}
```

### 在 providers 中依赖 core-engine

```json
// packages/providers/package.json
{
  "dependencies": {
    "@imagen-ps/core-engine": "workspace:*"
  }
}
```

### 在 workflows 中依赖 core-engine

```json
// packages/workflows/package.json
{
  "dependencies": {
    "@imagen-ps/core-engine": "workspace:*"
  }
}
```

## 导入方式

### core-engine

```typescript
import {
  // Runtime
  createRuntime,
  
  // Registry
  createWorkflowRegistry,
  
  // Runner
  createWorkflowRunner,
  
  // Store
  createJobStore,
  
  // Events
  createEventBus,
  
  // Types
  type Job,
  type JobRequest,
  type WorkflowSpec,
  type ProviderDispatch,
} from '@imagen-ps/core-engine';
```

### providers

```typescript
import {
  // Registry
  createProviderRegistry,
  getBuiltinProviders,
  
  // Bridge
  createDispatchAdapter,
  
  // Contract
  type Provider,
  type ProviderDescriptor,
  type ProviderConfig,
  type ProviderRequest,
  type ProviderResult,
} from '@imagen-ps/providers';
```

### workflows

```typescript
import {
  // Builtin workflows
  providerGenerateWorkflow,
  providerEditWorkflow,
} from '@imagen-ps/workflows';
```

## 典型集成流程

### 1. 创建 runtime

```typescript
import { createRuntime } from '@imagen-ps/core-engine';
import { createProviderRegistry, createDispatchAdapter } from '@imagen-ps/providers';

// 创建 provider registry
const providerRegistry = createProviderRegistry();

// 创建 dispatch adapter（桥接 providers 和 core-engine）
const dispatch = createDispatchAdapter(providerRegistry);

// 创建 runtime
const runtime = createRuntime({ dispatch });
```

### 2. 注册 workflow

```typescript
import { providerGenerateWorkflow } from '@imagen-ps/workflows';

runtime.registerWorkflow(providerGenerateWorkflow);
```

### 3. 提交任务

```typescript
const job = await runtime.submitJob({
  workflowId: 'provider-generate',
  params: {
    providerId: 'mock',
    prompt: 'a cat',
  },
});
```

## 注意事项

- 当前阶段 API 可能变动，以各包 `SPEC.md` 和源码为准
- `app` 层通过 `shared/` 收口对共享包的调用，不直接在 UI 中引用底层包
- IO 操作（网络、文件、Photoshop API）只能在 `app/host` 或 adapter 边界发生
