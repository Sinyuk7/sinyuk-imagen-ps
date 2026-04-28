# Code Conventions

## 命名约定

| 元素 | 规范 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `submit-job.ts`, `get-provider-config.ts` |
| 命令函数 | camelCase 动词开头 | `submitJob`, `getProviderConfig` |
| 类型/接口 | PascalCase | `CommandResult`, `SubmitJobInput` |
| 常量 | UPPER_SNAKE_CASE | `WORKFLOW_NAME_KEY` |
| 内部函数 | camelCase，不导出 | `getRuntime()`, `toJobError()` |

## 文件组织

- 每个命令函数独立一个文件（`commands/<verb>-<noun>.ts`）
- 公共类型集中在 `commands/types.ts`
- 导出汇总在 `commands/index.ts`
- Runtime 管理独立在 `runtime.ts`

## 注释规范

- JSDoc 用中文撰写，描述函数的「职责 → 参数 → 返回值语义」
- 行内注释用中文，解释「为什么」而非「做了什么」
- 类型名、函数名保持英文

```typescript
/**
 * 提交一个 workflow 执行并等待结果。
 *
 * @param input - 包含 workflow 名称与 job 输入
 * @returns 成功时 `{ ok: true, value: Job }`，失败时 `{ ok: false, error: JobError }`
 */
```

## 推荐模式

### 1. CommandResult 包装

所有可失败的异步命令统一使用 `CommandResult<T>` 返回：

```typescript
export async function myCommand(): Promise<CommandResult<MyResult>> {
  try {
    const value = await doSomething()
    return { ok: true, value }
  } catch (error) {
    return { ok: false, error: toJobError(error) }
  }
}
```

### 2. 同步查询直接返回

纯查询（无副作用、不可能抛出用户可恢复异常）直接返回值：

```typescript
export function getJob(jobId: string): Job | undefined {
  return getRuntime().store.getJob(jobId)
}
```

### 3. 验证前置

在执行业务逻辑前先验证输入，快速返回错误：

```typescript
const provider = runtime.providerRegistry.get(providerId)
if (!provider) {
  return { ok: false, error: createValidationError(`Provider "${providerId}" not found`) }
}
```

### 4. readonly 类型约束

公共类型使用 `readonly` 防止消费方意外修改：

```typescript
export type CommandResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: JobError }
```

## 禁用模式

| 禁止 | 原因 | 替代方案 |
|------|------|----------|
| 命令函数内抛异常到 surface | 破坏 CommandResult 契约 | 用 `try/catch` + `toJobError()` 包装 |
| 导出 `getRuntime()` | 暴露内部单例破坏封装 | 仅在 `commands/` 内部使用 |
| 导入 surface 依赖 (React/DOM/Node fs) | 违反架构边界 | 通过 adapter 注入 |
| 在类型中使用 `any` | 类型安全退化 | 用 `unknown` + 类型守卫 |
| 可变状态泄露到消费方 | 引发不可预期副作用 | 返回 readonly 类型或快照 |

## 代码审查要点

1. **边界检查** — 新增的 import 不得引入 surface-specific 包
2. **Result 模式一致性** — 异步可失败命令必须返回 `CommandResult<T>`
3. **错误分类正确性** — `toJobError` 是否保留了原始 error category
4. **测试覆盖** — 每个新命令必须有对应的单测（happy path + error path）
5. **JSDoc 完整性** — 公共函数必须有中文 JSDoc
