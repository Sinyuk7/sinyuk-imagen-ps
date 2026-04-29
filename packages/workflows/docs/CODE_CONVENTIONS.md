# Code Conventions — @imagen-ps/workflows

## 命名约定

### Workflow 命名

| 类型 | 约定 | 示例 |
|------|------|------|
| Workflow name | `kebab-case`，动词-名词结构 | `provider-generate`、`provider-edit` |
| Workflow 变量 | `camelCase` + `Workflow` 后缀 | `providerGenerateWorkflow` |
| Step name | `camelCase`，动词优先 | `generate`、`edit` |

### 文件命名

| 类型 | 约定 | 示例 |
|------|------|------|
| Workflow spec 文件 | `kebab-case.ts` | `provider-generate.ts` |
| 导出聚合文件 | `index.ts` | `src/builtins/index.ts` |
| 测试文件 | `*.test.ts` | `builtins.test.ts` |

### 类型命名

| 类型 | 约定 | 示例 |
|------|------|------|
| 接口 | `PascalCase` | `Workflow`、`Step` |
| 类型别名 | `PascalCase` | `StepKind` |
| 常量 | `camelCase`（非全大写） | `builtinWorkflows` |

## 禁用模式

### ❌ 禁止在 workflow spec 中包含可执行逻辑

```typescript
// ❌ 错误：workflow 不应包含函数
export const badWorkflow = {
  name: 'bad',
  steps: [{
    execute: () => { /* logic */ }, // 禁止
  }],
};

// ✅ 正确：workflow 只是 pure data
export const goodWorkflow = Object.freeze({
  name: 'good',
  version: '1',
  steps: Object.freeze([{
    name: 'generate',
    kind: 'provider',
    input: { provider: '${provider}' },
  }]),
});
```

### ❌ 禁止运行时修改 workflow

```typescript
// ❌ 错误：修改已冻结的 workflow
providerGenerateWorkflow.name = 'renamed';
providerGenerateWorkflow.steps.push(newStep);

// ✅ 正确：创建新的 workflow 对象
const customWorkflow = Object.freeze({
  ...providerGenerateWorkflow,
  name: 'custom-generate',
});
```

### ❌ 禁止在 workflow 模块中引入 IO 或副作用

```typescript
// ❌ 错误：workflows 模块不应有副作用
import fs from 'fs';
const config = fs.readFileSync('./config.json');

// ❌ 错误：workflows 模块不应有网络请求
await fetch('https://api.example.com');

// ✅ 正确：workflows 只导出 pure data
export const workflow = Object.freeze({ /* ... */ });
```

### ❌ 禁止依赖 providers 或 app 模块

```typescript
// ❌ 错误：违反依赖方向
import { someProvider } from '@imagen-ps/providers';
import { uiHelper } from '../../../app/src/ui';

// ✅ 正确：只依赖 core-engine 的类型
import type { Workflow } from '@imagen-ps/core-engine';
```

## 推荐模式

### 深度冻结所有导出

```typescript
// 推荐：逐层冻结确保完全 immutable
const step = Object.freeze({
  name: 'generate',
  kind: 'provider',
  input: Object.freeze({
    provider: '${provider}',
    request: Object.freeze({
      operation: 'generate',
      prompt: '${prompt}',
    }),
  }),
  outputKey: 'image',
}) satisfies Workflow['steps'][number];

export const myWorkflow = Object.freeze({
  name: 'my-workflow',
  version: '1',
  steps: Object.freeze([step]),
}) satisfies Workflow;
```

### 使用 `satisfies` 进行类型检查

```typescript
// 推荐：使用 satisfies 保持字面类型的同时确保类型正确
export const providerGenerateWorkflow = Object.freeze({
  name: 'provider-generate',
  version: '1',
  steps: Object.freeze([generateStep]),
}) satisfies Workflow;
```

### 集中导出

```typescript
// src/builtins/index.ts
export { providerGenerateWorkflow } from './provider-generate.js';
export { providerEditWorkflow } from './provider-edit.js';

export const builtinWorkflows: readonly Workflow[] = Object.freeze([
  providerGenerateWorkflow,
  providerEditWorkflow,
]);
```

## 代码审查要点

| 检查项 | 说明 |
|--------|------|
| Immutability | 所有导出是否通过 `Object.freeze()` 深度冻结 |
| 依赖方向 | 是否只依赖 `core-engine`，未引入 `providers` 或 `app` |
| 无副作用 | 模块是否为 pure data，无 IO 或运行时副作用 |
| 命名规范 | workflow name 是否使用 `kebab-case` |
| 类型正确 | 是否使用 `satisfies Workflow` 进行类型检查 |
| 文档对齐 | 新增 workflow 是否已更新 SPEC.md |
