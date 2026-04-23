## 1. JobError 类型定义

- [x] 1.1 创建 `packages/core-engine/src/errors.ts`，定义 `ErrorCategory` string literal union 类型（`'validation' | 'provider' | 'runtime' | 'workflow' | 'unknown'`）
- [x] 1.2 在 `errors.ts` 中定义 `JobError` interface（含 `category`、`message`、`details?` 字段），确保所有字段类型均为 serializable

## 2. 工厂函数实现

- [x] 2.1 在 `errors.ts` 中实现 `createValidationError(message, details?)` 工厂函数
- [x] 2.2 在 `errors.ts` 中实现 `createProviderError(message, details?)` 工厂函数
- [x] 2.3 在 `errors.ts` 中实现 `createRuntimeError(message, details?)` 工厂函数
- [x] 2.4 在 `errors.ts` 中实现 `createWorkflowError(message, details?)` 工厂函数
- [x] 2.5 在 `errors.ts` 中实现 `createUnknownError(message, details?)` 工厂函数
- [x] 2.6 确保所有工厂函数返回的 plain object 可通过 `JSON.stringify` / `JSON.parse` 往返

## 3. 聚合导出与编译验证

- [x] 3.1 更新 `packages/core-engine/src/index.ts`，从 `./errors.js` 导入并导出 `JobError`、`ErrorCategory` 及所有工厂函数
- [x] 3.2 运行 TypeScript 编译检查，确保模块无类型错误且可正常编译
