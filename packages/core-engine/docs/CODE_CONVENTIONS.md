# Code Conventions

## 命名约定

### 类型与接口

| 类型 | 命名规则 | 示例 |
|------|---------|------|
| 类型 | PascalCase | `Job`, `JobStatus`, `Workflow` |
| 接口 | PascalCase | `JobStore`, `JobEventBus`, `ProviderDispatcher` |
| 类型参数 | 单字母大写 | `T`, `K`, `V` |
| 联合类型 | PascalCase + 语义后缀 | `ErrorCategory`, `JobEventType` |

### 函数与变量

| 类型 | 命名规则 | 示例 |
|------|---------|------|
| 工厂函数 | `create` + 名词 | `createJobStore`, `createRuntime` |
| 断言函数 | `assert` + 条件 | `assertSerializable`, `assertImmutable` |
| 谓词函数 | `is` + 形容词 | `isSerializable` |
| 私有变量 | camelCase（无前缀） | `jobs`, `adapters` |
| 常量 | UPPER_SNAKE_CASE | `ALLOWED_TRANSITIONS` |

### 文件命名

| 类型 | 命名规则 | 示例 |
|------|---------|------|
| 模块文件 | 小写单词，无连字符 | `store.ts`, `events.ts`, `runtime.ts` |
| 类型定义 | 按领域划分 | `types/job.ts`, `types/workflow.ts` |
| 测试文件 | `*.test.ts` | `store.test.ts`, `runner.test.ts` |

## 代码结构

### 文件组织

```typescript
/**
 * 文件级 JSDoc 注释
 */

// 1. 类型导入（type-only imports 优先）
import type { Job, JobInput } from './types/job.js';

// 2. 值导入
import { createValidationError } from './errors.js';

// 3. 内部类型定义
type InternalRecord = { ... };

// 4. 常量定义
const ALLOWED_TRANSITIONS = { ... };

// 5. 内部辅助函数
function helperFunction() { ... }

// 6. 导出函数/类
export function publicFunction() { ... }
```

### JSDoc 规范

遵循 `archive/DOCUMENTATION.md` 的 docstring 格式：

```typescript
/**
 * Short English summary.
 *
 * INTENT: 中文说明函数做什么。
 * INPUT: 关键输入的语义说明。
 * OUTPUT: 返回结果的含义。
 * SIDE EFFECT: None 或具体副作用。
 * FAILURE: 失败时的行为（抛错 / 默认值 / 忽略）。
 */
```

简单函数不需要完整 docstring，单行注释即可。

## 禁用模式

### 禁止：直接修改对外返回的对象

```typescript
// ❌ 错误：返回内部可变对象
return this.jobs.get(id);

// ✅ 正确：返回 immutable snapshot
return toSnapshot(this.jobs.get(id));
```

### 禁止：在 core-engine 中引入宿主依赖

```typescript
// ❌ 错误：引入 DOM API
const element = document.createElement('div');

// ❌ 错误：引入 Node.js API
import fs from 'fs';

// ❌ 错误：引入 UXP API
import photoshop from 'photoshop';
```

### 禁止：Silent fallback

```typescript
// ❌ 错误：静默忽略错误
try {
  doSomething();
} catch {
  // 什么都不做
}

// ✅ 正确：显式错误处理
try {
  doSomething();
} catch (e) {
  throw createRuntimeError('Operation failed', { cause: e });
}
```

### 禁止：非 serializable 数据跨边界

```typescript
// ❌ 错误：传递函数或 class 实例
store.submitJob({ callback: () => {} });

// ✅ 正确：只传递 plain object
store.submitJob({ prompt: 'text', options: { size: 1024 } });
```

## 推荐模式

### 使用 `Object.freeze` 确保 immutable

```typescript
export function createValidationError(message: string): JobError {
  return Object.freeze({ category: 'validation', message });
}
```

### 使用类型守卫进行状态检查

```typescript
function assertTransition(from: JobStatus, to: JobStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw createRuntimeError(`Illegal transition: ${from} → ${to}`);
  }
}
```

### 使用工厂函数返回配对的 public/internal 接口

```typescript
// 对外只暴露 store，controller 仅内部使用
export function createJobStore(): { store: JobStore; controller: JobStoreController } {
  // ...
}
```

## 代码审查要点

1. **边界隔离** — 是否有宿主 API 泄漏？是否有 provider 语义倒灌？
2. **Serializable** — 跨边界数据是否可序列化？
3. **Immutable** — 对外返回是否为 frozen snapshot？
4. **显式失败** — 错误是否使用标准 `JobError` 结构？是否有 silent fallback？
5. **状态机完整性** — 状态迁移是否合法？是否处理了所有 edge case？
6. **测试覆盖** — 关键路径是否有单元测试？边界条件是否覆盖？
