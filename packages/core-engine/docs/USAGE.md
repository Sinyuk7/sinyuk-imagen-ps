# Usage

## 核心 API 列表

### Runtime 创建

| 函数 | 说明 |
|------|------|
| `createRuntime(options?)` | 创建完整 runtime 实例，包含 store、events、registry、dispatcher |

### Job 操作

| 方法 | 说明 |
|------|------|
| `runtime.runWorkflow(name, input)` | 提交并执行 workflow，返回最终 job |
| `runtime.store.submitJob(input)` | 仅创建 job，不执行 |
| `runtime.store.getJob(id)` | 根据 id 查询 job |
| `runtime.store.retryJob(id)` | 重试失败的 job |

### Event 订阅

| 方法 | 说明 |
|------|------|
| `runtime.events.on(type, handler)` | 订阅 job lifecycle 事件 |
| `runtime.events.off(type, handler)` | 取消订阅 |

### Workflow 管理

| 方法 | 说明 |
|------|------|
| `runtime.registry.register(workflow)` | 注册 workflow |
| `runtime.registry.getWorkflow(name)` | 查找 workflow |

### Provider Dispatch

| 方法 | 说明 |
|------|------|
| `runtime.dispatcher.registerAdapter(adapter)` | 注册 provider adapter |
| `runtime.dispatcher.dispatch(ref, params)` | 调用 provider |

## 典型用法

### 1. 基本 workflow 执行

```typescript
import { createRuntime } from '@imagen-ps/core-engine';
import type { Workflow, JobInput } from '@imagen-ps/core-engine';

// 定义 workflow
const myWorkflow: Workflow = {
  name: 'generate-image',
  steps: [
    {
      kind: 'provider',
      providerRef: { name: 'openai', model: 'dall-e-3' },
      params: { size: '1024x1024' },
    },
  ],
};

// 创建 runtime
const runtime = createRuntime({
  initialWorkflows: [myWorkflow],
});

// 执行 workflow
const input: JobInput = { prompt: 'A beautiful sunset' };
const job = await runtime.runWorkflow('generate-image', input);

console.log(job.status); // 'completed' or 'failed'
console.log(job.output); // workflow 输出
```

### 2. 订阅 Job 事件

```typescript
import { createRuntime } from '@imagen-ps/core-engine';

const runtime = createRuntime();

// 订阅所有事件
runtime.events.on('created', (event) => {
  console.log('Job created:', event.job.id);
});

runtime.events.on('completed', (event) => {
  console.log('Job completed:', event.job.id);
});

runtime.events.on('failed', (event) => {
  console.log('Job failed:', event.job.id, event.job.error);
});
```

### 3. 注册 Provider Adapter

```typescript
import { createRuntime } from '@imagen-ps/core-engine';
import type { ProviderDispatchAdapter } from '@imagen-ps/core-engine';

// 实现 adapter
const openaiAdapter: ProviderDispatchAdapter = {
  name: 'openai',
  async dispatch(ref, params) {
    // 调用实际 provider API
    const result = await callOpenAI(ref.model, params);
    return { assets: [result] };
  },
};

const runtime = createRuntime({
  adapters: [openaiAdapter],
});
```

## 注意事项

1. **Input 必须可序列化** — `JobInput` 会经过 `assertSerializable` 检查
2. **Job 为 immutable** — 返回的 job 对象不可修改，修改不会影响内部状态
3. **只能重试失败的 job** — `retryJob()` 只接受 `status === 'failed'` 的 job
4. **Workflow 名称唯一** — 同名 workflow 注册会覆盖
5. **Adapter 名称匹配** — `providerRef.name` 必须与注册的 adapter 名称一致
