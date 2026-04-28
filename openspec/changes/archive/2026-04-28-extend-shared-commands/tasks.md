## 1. 基础设施扩展

- [x] 1.1 扩展 `runtime.ts`：创建 `ProviderRegistry` 实例并挂载到 runtime 返回对象上（`runtime.registry`）
- [x] 1.2 扩展 `runtime.ts`：实现 `ConfigStorageAdapter` 接口和默认 in-memory adapter
- [x] 1.3 扩展 `runtime.ts`：实现 `setConfigAdapter(adapter)` 方法和 `getConfigAdapter()` 内部访问
- [x] 1.4 扩展 `runtime.ts`：更新 `_resetForTesting()` 以同时重置 config adapter

## 2. Provider 发现命令

- [x] 2.1 创建 `app/src/shared/commands/list-providers.ts` — `listProviders(): ProviderDescriptor[]`
- [x] 2.2 创建 `app/src/shared/commands/describe-provider.ts` — `describeProvider(providerId: string): ProviderDescriptor | undefined`

## 3. Provider 配置命令

- [x] 3.1 扩展 `types.ts`：添加 `ConfigStorageAdapter` 接口定义
- [x] 3.2 创建 `app/src/shared/commands/get-provider-config.ts` — `getProviderConfig(providerId: string): Promise<CommandResult<ProviderConfig>>`
- [x] 3.3 创建 `app/src/shared/commands/save-provider-config.ts` — `saveProviderConfig(providerId: string, config: unknown): Promise<CommandResult<void>>`

## 4. Job 重试命令

- [x] 4.1 创建 `app/src/shared/commands/retry-job.ts` — `retryJob(jobId: string): Promise<CommandResult<Job>>`

## 5. Barrel 导出更新

- [x] 5.1 更新 `app/src/shared/commands/index.ts`：追加导出二期五命令
- [x] 5.2 更新 `app/src/shared/commands/index.ts`：追加导出 `ConfigStorageAdapter` 类型
- [x] 5.3 更新 `app/src/shared/commands/types.ts`：Re-export `ProviderDescriptor` 类型（从 `@imagen-ps/providers`）
- [x] 5.4 更新 `app/src/shared/commands/types.ts`：Re-export `ProviderConfig` 类型（从 `@imagen-ps/providers`）

## 6. 单元测试

- [x] 6.1 测试 `listProviders`：返回已注册 provider 列表
- [x] 6.2 测试 `describeProvider`：已存在 / 不存在场景
- [x] 6.3 测试 `getProviderConfig`：已保存 / 未保存 / provider 不存在场景
- [x] 6.4 测试 `saveProviderConfig`：有效 config / 无效 config / provider 不存在场景
- [x] 6.5 测试 `retryJob`：已完成 job / 不存在 job 场景（使用 _workflowName 从 input 获取 workflow）
- [x] 6.6 测试 `setConfigAdapter`：自定义 adapter 生效、`_resetForTesting()` 重置 adapter

## 7. 边界验证

- [x] 7.1 验证 v1 三命令签名未改变（类型兼容性检查）
- [x] 7.2 验证 `index.ts` 导出清单不含 `runtime` / `getRuntime` / `store` / `dispatcher` / `registry`（`setConfigAdapter` 是故意导出的 DI 接口）
- [x] 7.3 更新 `app/STATUS.md` 记录新增的命令
