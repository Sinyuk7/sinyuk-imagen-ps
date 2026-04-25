# Usage — @imagen-ps/workflows

## 核心 API 列表

| 导出 | 类型 | 说明 |
|------|------|------|
| `builtinWorkflows` | `readonly Workflow[]` | 当前阶段稳定公开的 builtin workflow 只读集合 |
| `providerGenerateWorkflow` | `Workflow` | image generation workflow spec |
| `providerEditWorkflow` | `Workflow` | image edit workflow spec |

## 典型用法

### 场景 1：注册 builtin workflows 到 runtime

```typescript
import { createRuntime } from '@imagen-ps/core-engine';
import { builtinWorkflows } from '@imagen-ps/workflows';

// 创建 runtime 时注入所有 builtin workflows
const runtime = createRuntime({
  initialWorkflows: builtinWorkflows,
  adapters: [yourProviderAdapter],
});

// 执行 image generation workflow
const job = await runtime.runWorkflow('provider-generate', {
  provider: 'openai',
  prompt: 'A beautiful sunset over the ocean',
});

console.log(job.status); // 'completed' | 'failed'
console.log(job.output?.image); // provider 返回的结果
```

### 场景 2：使用 image edit workflow

```typescript
import { createRuntime } from '@imagen-ps/core-engine';
import { builtinWorkflows } from '@imagen-ps/workflows';

const runtime = createRuntime({
  initialWorkflows: builtinWorkflows,
  adapters: [yourProviderAdapter],
});

// 执行 image edit workflow
const job = await runtime.runWorkflow('provider-edit', {
  provider: 'openai',
  prompt: 'Add a rainbow to the sky',
  inputAssets: [
    {
      type: 'image',
      name: 'source.png',
      url: 'https://example.com/source.png',
      mimeType: 'image/png',
    },
  ],
});
```

### 场景 3：单独注册特定 workflow

```typescript
import { createWorkflowRegistry } from '@imagen-ps/core-engine';
import { providerGenerateWorkflow } from '@imagen-ps/workflows';

// 只注册需要的 workflow
const registry = createWorkflowRegistry([providerGenerateWorkflow]);

// 查询已注册的 workflows
const workflow = registry.get('provider-generate');
const allWorkflows = registry.list();
```

## Workflow Input Contract

### provider-generate

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `provider` | `string` | 是 | provider 标识符 |
| `prompt` | `string` | 是 | 生成提示词 |

**Output key**: `image`

### provider-edit

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `provider` | `string` | 是 | provider 标识符 |
| `prompt` | `string` | 是 | 编辑提示词 |
| `inputAssets` | `Asset[]` | 是 | 输入图片资源数组 |

**Output key**: `image`

### Asset 结构

```typescript
interface Asset {
  type: 'image';
  name: string;
  url: string;
  mimeType: string;
}
```

## 注意事项

### Immutability

所有导出的 workflow spec 都是深度冻结的，禁止在运行时修改：

```typescript
// ❌ 错误：尝试修改会抛出 TypeError（strict mode）或静默失败
providerGenerateWorkflow.name = 'custom-name';

// ✅ 正确：如需自定义，创建新的 workflow 对象
const customWorkflow = Object.freeze({
  name: 'custom-generate',
  version: '1',
  steps: Object.freeze([/* your steps */]),
});
```

### Tentative 字段

以下字段当前为 tentative，不保证 binding 或输出语义：

- `maskAsset`
- `output`
- `providerOptions`

如需使用这些字段，请自行扩展 workflow spec。

### 依赖 core-engine 版本

本模块依赖 `@imagen-ps/core-engine` 的 `Workflow` 类型定义。确保两个包版本兼容。在 monorepo 环境下使用 `workspace:*` 可保证一致性。
