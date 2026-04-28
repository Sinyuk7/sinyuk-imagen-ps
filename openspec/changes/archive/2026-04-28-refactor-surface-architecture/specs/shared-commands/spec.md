## MODIFIED Requirements

### Requirement: Runtime 单例管理

`packages/shared-commands/src/runtime.ts` SHALL 持有唯一的 `Runtime` 实例，通过 `getRuntime()` 懒初始化。首次调用时 SHALL 注入 `builtinWorkflows` 与 provider adapters。仅 `packages/shared-commands/src/commands/` 模块 SHALL 被允许 import `getRuntime()`；`apps/app`、`apps/cli`、UI 层、host 层 MUST NOT 直接引用。

**扩展**：`getRuntime()` 返回的对象 SHALL 额外暴露 `providerRegistry` 属性，提供对 `ProviderRegistry` 的只读访问（`list()` 和 `get()` 方法）。

`_resetForTesting()` SHALL 将单例重置为 `null`，同时重置 config adapter 为默认 in-memory adapter，仅供测试使用。

#### Scenario: 首次调用 getRuntime 创建实例
- **WHEN** `getRuntime()` 在 `instance === null` 时被调用
- **THEN** 创建新的 `Runtime` 实例，注入 `builtinWorkflows` 与 adapters，返回该实例

#### Scenario: 后续调用返回同一实例
- **WHEN** `getRuntime()` 在实例已存在时被调用
- **THEN** 返回同一个 `Runtime` 实例

#### Scenario: 测试重置
- **WHEN** `_resetForTesting()` 被调用后再调用 `getRuntime()`
- **THEN** 创建新的 `Runtime` 实例（旧实例被丢弃）
- **AND** config adapter 重置为默认 in-memory adapter

#### Scenario: 访问 provider registry
- **WHEN** 调用 `getRuntime().providerRegistry.list()`
- **THEN** 返回所有已注册 provider 的 `ProviderDescriptor[]`

---

### Requirement: 依赖方向与边界禁止

commands 层 SHALL 遵循 `surface apps -> @imagen-ps/shared-commands -> packages/*` 单向依赖方向。commands MUST NOT 访问 UXP / DOM / React / 文件系统，MUST NOT 暴露 `runtime` 实例本身，MUST NOT import surface app 模块，MUST NOT 引入 surface-specific 状态（CLI file storage、UXP storage、UI state）。

#### Scenario: Surface 层无直接 runtime 调用
- **WHEN** 对 `apps/app/src/` 和 `apps/cli/src/` 执行 runtime factory 引用检查
- **THEN** 结果不包含用于 command execution 的 `createRuntime`、`builtinWorkflows` 或 provider adapter assembly 直接调用

#### Scenario: commands 不暴露 runtime 实例
- **WHEN** 检查 `packages/shared-commands/src/commands/index.ts` 的导出清单
- **THEN** 包含 command 函数与公开 command 类型
- **AND** 不包含 `runtime` / `getRuntime` / `store` / `dispatcher` / mutable registry instance

---

### Requirement: v1 稳定性与扩展策略

首版三命令（`submitJob` / `getJob` / `subscribeJobEvents`）+ 三类型（`CommandResult` / `SubmitJobInput` / `JobEventHandler`）的签名 SHALL 在首版发布后视为 v1 stable。二期命令 SHALL 以新文件 + barrel 追加导出方式引入，MUST NOT 修改 v1 已有公开签名。迁移到 `@imagen-ps/shared-commands` 后，公开命令 SHALL 从该 package 导出。

**扩展**：二期命令包括 `listProviders`、`describeProvider`、`getProviderConfig`、`saveProviderConfig`、`retryJob`。二期类型包括 `ConfigStorageAdapter`、`ProviderConfig`（re-export from providers）。

#### Scenario: 二期命令追加不破坏 v1
- **WHEN** 新增 `list-providers.ts`、`describe-provider.ts`、`get-provider-config.ts`、`save-provider-config.ts`、`retry-job.ts` 并在 `packages/shared-commands/src/commands/index.ts` 追加导出
- **THEN** v1 三命令的类型签名保持不变

#### Scenario: 导出清单包含二期命令
- **WHEN** 检查 `packages/shared-commands/src/commands/index.ts` 的导出清单
- **THEN** 包含 v1 三命令 + 二期五命令 + 所有公开类型
- **AND** 不包含 `runtime` / `getRuntime` / `store` / `dispatcher` / mutable registry instance
