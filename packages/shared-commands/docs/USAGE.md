# Usage

## 核心 API

### Job 执行命令

| 函数 | 签名 | 说明 |
|------|------|------|
| `submitJob` | `(input: SubmitJobInput) => Promise<CommandResult<Job>>` | 提交 workflow 执行并等待结果 |
| `getJob` | `(jobId: string) => Job \| undefined` | 同步查询 job 快照 |
| `subscribeJobEvents` | `(handler: JobEventHandler) => Unsubscribe` | 订阅 job 生命周期事件 |
| `retryJob` | `(jobId: string) => Promise<CommandResult<Job>>` | 用原始输入重执行已有 job |

### Provider 管理命令

| 函数 | 签名 | 说明 |
|------|------|------|
| `listProviders` | `() => ProviderDescriptor[]` | 列出所有已注册 providers |
| `describeProvider` | `(providerId: string) => ProviderDescriptor \| undefined` | 获取 provider 元数据 |
| `getProviderConfig` | `(providerId: string) => Promise<CommandResult<ProviderConfig>>` | 读取已保存的 provider 配置 |
| `saveProviderConfig` | `(providerId: string, config: unknown) => Promise<CommandResult<void>>` | 验证并持久化 provider 配置 |

### 适配器注入

| 函数 | 签名 | 说明 |
|------|------|------|
| `setConfigAdapter` | `(adapter: ConfigStorageAdapter) => void` | 注入 surface-specific 配置存储 |

## 典型用法

### 场景 1：提交图像生成任务

```typescript
import { submitJob } from '@imagen-ps/shared-commands'

const result = await submitJob({
  workflow: 'provider-generate',
  input: {
    prompt: 'A sunset over mountains',
    width: 1024,
    height: 1024,
  },
})

if (result.ok) {
  console.log('Job 完成:', result.value.id)
} else {
  console.error('失败:', result.error.category, result.error.message)
}
```

### 场景 2：监听 Job 事件

```typescript
import { subscribeJobEvents } from '@imagen-ps/shared-commands'

const unsubscribe = subscribeJobEvents((event) => {
  switch (event.type) {
    case 'job:started':
      console.log('开始执行:', event.jobId)
      break
    case 'job:completed':
      console.log('执行完成:', event.jobId)
      break
    case 'job:failed':
      console.error('执行失败:', event.error.message)
      break
  }
})

// 不再需要时取消订阅
unsubscribe()
```

### 场景 3：配置 Provider

```typescript
import {
  listProviders,
  saveProviderConfig,
  setConfigAdapter,
} from '@imagen-ps/shared-commands'

// 1. 注入存储适配器（应用启动时执行一次）
setConfigAdapter(myFileSystemAdapter)

// 2. 查看可用 providers
const providers = listProviders()
console.log(providers.map((p) => p.id))

// 3. 保存配置
const result = await saveProviderConfig('openai', {
  apiKey: 'sk-...',
  model: 'dall-e-3',
})

if (!result.ok) {
  console.error('配置无效:', result.error.message)
}
```

## 注意事项

1. **CommandResult 模式** — 所有异步命令返回 `CommandResult<T>` 而非抛异常，消费方必须检查 `result.ok` 后再访问 `value` 或 `error`。
2. **单例生命周期** — Runtime 在首次命令调用时创建，进程存活期间保持不变。`setConfigAdapter()` 应在首次命令调用前执行。
3. **Workflow 名称** — 只允许使用 `BuiltinWorkflowName` 类型声明的值（`'provider-generate'` | `'provider-edit'`），TypeScript 编译期会检查。
4. **retryJob 依赖** — `retryJob` 依赖原始 job 的 `_workflowName` 元数据，仅对 `submitJob` 创建的 job 有效。
