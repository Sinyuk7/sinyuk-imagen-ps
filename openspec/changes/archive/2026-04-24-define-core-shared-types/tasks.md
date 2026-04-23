## 1. Job 类型定义

- [x] 1.1 创建 `packages/core-engine/src/types/job.ts`，定义 `JobStatus` 联合类型（`'created' | 'running' | 'completed' | 'failed'`）
- [x] 1.2 在 `job.ts` 中定义 `Job` interface（含 `id`、`status`、`input`、`output`、`error` 等字段）
- [x] 1.3 在 `job.ts` 中定义 `JobInput`、`JobOutput` 辅助类型
- [x] 1.4 在 `job.ts` 中定义 `JobStore` interface（暂定方法签名：`submitJob`、`getJob`、`retryJob`）

## 2. Workflow 类型定义

- [x] 2.1 创建 `packages/core-engine/src/types/workflow.ts`，定义 `StepKind` 联合类型（`'provider' | 'transform' | 'io'`）
- [x] 2.2 在 `workflow.ts` 中定义 `Step` interface（含 `name`、`kind`、`input`、`outputKey` 等字段）
- [x] 2.3 在 `workflow.ts` 中定义 `Workflow` interface（含 `name`、`steps`、`version` 等字段）

## 3. Provider 类型定义

- [x] 3.1 创建 `packages/core-engine/src/types/provider.ts`，定义 `ProviderRef` interface（含 `provider`、`params`）
- [x] 3.2 在 `provider.ts` 中定义 `ProviderDispatcher` 函数类型签名（抽象边界，不引入具体 HTTP 逻辑）

## 4. Asset 类型定义

- [x] 4.1 创建 `packages/core-engine/src/types/asset.ts`，定义 `AssetType` 联合类型（如 `'image'`）
- [x] 4.2 在 `asset.ts` 中定义 `Asset` interface（含 `type`、`url`、`data` 等字段，host-agnostic）

## 5. 聚合导出与入口更新

- [x] 5.1 创建 `packages/core-engine/src/types/index.ts`，聚合并统一导出 `job.ts`、`workflow.ts`、`provider.ts`、`asset.ts` 中的所有公共类型
- [x] 5.2 更新 `packages/core-engine/src/index.ts`，从 `./types` 导入并导出所有公共类型（保留现有占位符导出直至后续 change 替换）
- [x] 5.3 运行 TypeScript 编译检查，确保模块无类型错误且可正常编译
