# shared-commands Specification

## Purpose
TBD - created by archiving change bootstrap-shared-commands. Update Purpose after archive.
## Requirements
### Requirement: Runtime 单例管理

`app/src/shared/runtime.ts` SHALL 持有唯一的 `Runtime` 实例，通过 `getRuntime()` 懒初始化。首次调用时 SHALL 注入 `builtinWorkflows` 与 provider adapters。仅 `commands/` 模块 SHALL 被允许 import `getRuntime()`；`ui/`、`host/` 层 MUST NOT 直接引用。

**扩展**：`getRuntime()` 返回的对象 SHALL 额外暴露 `registry` 属性，提供对 `ProviderRegistry` 的只读访问（`list()` 和 `get()` 方法）。

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
- **WHEN** 调用 `getRuntime().registry.list()`
- **THEN** 返回所有已注册 provider 的 `ProviderDescriptor[]`

---

### Requirement: submitJob 命令

`submitJob(input: SubmitJobInput)` SHALL 提交一个 workflow 执行并等待结果。内部 SHALL 调用 `runtime.runWorkflow(input.workflow, input.input)`。所有执行期异常 SHALL 被捕获并映射为 `{ ok: false, error: JobError }`。

`SubmitJobInput.workflow` SHALL 使用 union 类型约束为 `'provider-generate' | 'provider-edit'`（v1 builtin workflow 名称）。

#### Scenario: generate 主路径 happy path
- **WHEN** 调用 `submitJob({ workflow: 'provider-generate', input: { provider: 'mock', prompt: 'test' } })`
- **THEN** 返回 `{ ok: true, value: Job }`，`Job.status` 为 `'completed'`，`Job.output` 包含 assets

#### Scenario: workflow 不存在
- **WHEN** 调用 `submitJob({ workflow: 'nonexistent' as any, input: {} })`
- **THEN** 返回 `{ ok: false, error: JobError }`，`error.category` 为 `'workflow'`（与 `runtime-assembly` spec 中 `runWorkflow` 对未注册 workflow 的 category 保持一致）

#### Scenario: binding 缺失
- **WHEN** 调用 `submitJob({ workflow: 'provider-generate', input: { provider: 'mock' } })`（缺少 `prompt`）
- **THEN** 返回 `{ ok: false, error: JobError }`，`error.category` 为 `'workflow'`

#### Scenario: provider invoke 失败
- **WHEN** 调用 `submitJob` 且 mock provider 配置为 `failMode: { type: 'always' }`
- **THEN** 返回 `{ ok: false, error: JobError }`，`error.category` 为 `'provider'`

---

### Requirement: getJob 命令

`getJob(jobId: string)` SHALL 同步查询指定 job 的当前快照，直接返回 `Job | undefined`。`getJob` 为纯同步查询，不存在异步错误场景，MUST NOT 使用 `CommandResult` 包装。

#### Scenario: 查询已存在的 job
- **WHEN** 调用 `getJob(jobId)` 且该 jobId 对应的 job 存在
- **THEN** 返回 `Job` 对象

#### Scenario: 查询不存在的 jobId
- **WHEN** 调用 `getJob('nonexistent-id')`
- **THEN** 返回 `undefined`

---

### Requirement: subscribeJobEvents 命令

`subscribeJobEvents(handler: JobEventHandler)` SHALL 订阅所有 job lifecycle 事件，内部 SHALL 调用 `runtime.events.onAny(handler)`（对应 `lifecycle-events` spec 的 `onAny` API），返回 `Unsubscribe` 函数。handler SHALL 接收所有事件类型（`created` / `running` / `completed` / `failed`）。

#### Scenario: 接收 lifecycle 事件
- **WHEN** 调用 `subscribeJobEvents(handler)` 后提交一个成功的 job
- **THEN** handler 依次接收到 `{ type: 'created', job }`、`{ type: 'running', job }` 和 `{ type: 'completed', job }` 事件

#### Scenario: 取消订阅
- **WHEN** 调用返回的 `unsubscribe()` 函数后再提交 job
- **THEN** handler 不再接收任何事件

#### Scenario: handler 异常不影响其他订阅者
- **WHEN** 已注册两个 handler（`handlerA` 抛出异常，`handlerB` 正常）
- **AND** 提交一个 job 触发事件
- **THEN** `handlerB` 仍被正常调用
- **AND** `handlerA` 的异常不中断事件分发

---

### Requirement: CommandResult 类型契约

commands 层 SHALL 使用 `CommandResult<T> = { ok: true, value: T } | { ok: false, error: JobError }` 作为统一 Result 包装。MUST NOT 引入独立的 `CommandError` 类型。

#### Scenario: 成功路径形状
- **WHEN** 命令执行成功
- **THEN** 返回对象包含 `ok: true` 与 `value` 字段，`value` 类型与命令签名一致

#### Scenario: 失败路径形状
- **WHEN** 命令执行失败
- **THEN** 返回对象包含 `ok: false` 与 `error` 字段，`error` 类型为 `JobError`（含 `category`）

---

### Requirement: 依赖方向与边界禁止

commands 层 SHALL 遵循 `ui → commands → runtime → packages/*` 单向依赖方向。commands MUST NOT 访问 UXP / DOM / 文件系统，MUST NOT 暴露 `runtime` 实例本身，MUST NOT import core-engine 的工厂函数（如 `createJobStore`），MUST NOT 引入新的状态（cache / queue / retry buffer）。

#### Scenario: UI 层无直接 runtime 调用
- **WHEN** 对 `app/src/ui/` 执行 `grep -rn 'createRuntime\|mockProvider'`
- **THEN** 结果为空（零匹配）

#### Scenario: commands 不暴露 runtime 实例
- **WHEN** 检查 `app/src/shared/commands/index.ts` 的导出清单
- **THEN** 仅包含三个命令函数 + 三个类型（`CommandResult` / `SubmitJobInput` / `JobEventHandler`），不包含 `runtime` / `getRuntime` / `store` / `dispatcher`

---

### Requirement: v1 稳定性与扩展策略

首版三命令（`submitJob` / `getJob` / `subscribeJobEvents`）+ 三类型（`CommandResult` / `SubmitJobInput` / `JobEventHandler`）的签名 SHALL 在首版发布后视为 v1 stable。二期命令 SHALL 以新文件 + barrel 追加导出方式引入，MUST NOT 修改 v1 已有文件的导出签名。

**扩展**：二期命令包括 `listProviders`、`describeProvider`、`getProviderConfig`、`saveProviderConfig`、`retryJob`。二期类型包括 `ConfigStorageAdapter`、`ProviderConfig`（re-export from providers）。

#### Scenario: 二期命令追加不破坏 v1
- **WHEN** 新增 `list-providers.ts`、`describe-provider.ts`、`get-provider-config.ts`、`save-provider-config.ts`、`retry-job.ts` 并在 `index.ts` 追加导出
- **THEN** v1 三命令的类型签名与导入路径保持不变

#### Scenario: 导出清单包含二期命令
- **WHEN** 检查 `app/src/shared/commands/index.ts` 的导出清单
- **THEN** 包含 v1 三命令 + 二期五命令 + 所有公开类型
- **AND** 不包含 `runtime` / `getRuntime` / `store` / `dispatcher` / `registry`

