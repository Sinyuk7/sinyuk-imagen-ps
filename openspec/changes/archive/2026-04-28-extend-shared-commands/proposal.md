## Why

首版 `shared/commands` 已实现 `submitJob`、`getJob`、`subscribeJobEvents` 三命令，验证了 UI ↔ runtime 链路。但根据 `IMPLEMENTATION_PLAN.md` 的预期命令面，仍缺少 provider 配置相关命令（`listProviders`、`describeProvider`、`getProviderConfig`、`saveProviderConfig`）和任务重试命令（`retryJob`）。这些命令是 Phase 3 完整交付和 Phase 4 CLI Surface 的前置依赖。

## What Changes

- 新增 `listProviders` 命令：列出所有已注册 provider 的 descriptor
- 新增 `describeProvider` 命令：获取单个 provider 的详细描述
- 新增 `getProviderConfig` 命令：获取 provider 的当前配置
- 新增 `saveProviderConfig` 命令：保存 provider 配置（通过 adapter 持久化）
- 新增 `retryJob` 命令：重试失败的 job
- 扩展 `runtime.ts`：暴露 provider registry 访问能力
- 引入 `ConfigStorageAdapter` 接口：支持 config 持久化的依赖注入

## Capabilities

### New Capabilities

- `shared-commands-provider-config`: Provider 配置相关命令（`listProviders`、`describeProvider`、`getProviderConfig`、`saveProviderConfig`）及 ConfigStorageAdapter 依赖注入
- `shared-commands-retry`: Job 重试命令（`retryJob`）

### Modified Capabilities

- `shared-commands`: 扩展 runtime 单例以支持 provider registry 访问，更新导出清单

## Impact

- `app/src/shared/runtime.ts`：需要暴露 provider registry 访问方法，支持 config adapter 注入
- `app/src/shared/commands/types.ts`：添加 `ConfigStorageAdapter` 接口定义
- `app/src/shared/commands/`：新增 5 个命令文件
- `app/src/shared/commands/index.ts`：追加导出二期命令和类型
- `app/tests/commands.test.ts`：新增对应测试用例
- **依赖**：需要 `@imagen-ps/providers` 的 `ProviderRegistry`、`ProviderDescriptor` 和 `ProviderConfig` 类型
