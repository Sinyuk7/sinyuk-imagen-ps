## Context

当前 `app/src/shared/commands` 已实现首版三命令（`submitJob`、`getJob`、`subscribeJobEvents`），验证了基础链路。但要完成 Phase 3 Shared Commands 和支撑 Phase 4 CLI Surface，还需要：

1. **Provider 发现与描述**：CLI / UI 需要知道有哪些 provider 可用
2. **Provider 配置管理**：用户需要配置 API key、endpoint 等参数
3. **任务重试**：失败的 job 需要支持一键重试

当前架构约束：
- `runtime.ts` 持有 Runtime 单例，但未暴露 provider registry 访问
- Config 持久化不属于 commands 层职责，需要通过 adapter 注入
- `core-engine` 不持有 provider 语义，registry 在 `providers` 包

## Goals / Non-Goals

**Goals:**
- 完成 `IMPLEMENTATION_PLAN.md` 中 Phase 3 预期的命令面
- 保持 commands 层"极薄"原则：只做组装和统一返回结构
- 支持 config 持久化的依赖注入，不绑定具体存储实现
- 新命令签名与 v1 三命令风格一致

**Non-Goals:**
- 不实现具体的 config storage adapter（留给 CLI / UI 各自实现）
- 不实现 provider 动态注册（v1 使用硬编码 builtin providers）
- 不实现 job cancel / abandon（超出当前 change 范围）
- 不修改 v1 三命令的签名

## Decisions

### D1: Provider 访问通过 Runtime 暴露

**决策**：扩展 `getRuntime()` 返回的对象，暴露 `registry` 属性用于 provider 访问。

**理由**：
- 保持 commands 层不直接 import `@imagen-ps/providers`
- Runtime 已经是 commands 层的唯一依赖入口
- 与现有 `runtime.store`、`runtime.events` 访问模式一致

**替代方案**：
- 直接在 commands 层 import `createProviderRegistry`：违反"commands 不创建 runtime 组件"原则
- 单独的 `getRegistry()` 函数：增加额外入口点，不如统一在 Runtime 上

### D2: Config 持久化通过 Adapter 注入

**决策**：定义 `ConfigStorageAdapter` 接口，在 runtime 初始化时注入，默认使用 in-memory adapter。

```typescript
interface ConfigStorageAdapter {
  get(providerId: string): Promise<ProviderConfig | undefined>;
  save(providerId: string, config: ProviderConfig): Promise<void>;
}
```

**理由**：
- Commands 层不直接做 IO（遵循架构约束）
- CLI 和 UXP UI 有不同的持久化需求（文件 vs UXP storage）
- In-memory 默认实现便于测试

**替代方案**：
- 直接在 commands 中写文件：违反"不直接做 IO"原则
- 不支持持久化：无法满足"配置保存"需求

### D3: `retryJob` 复用 `submitJob` 逻辑

**决策**：`retryJob(jobId)` 从 store 获取原 job 的 input，然后调用 `runtime.runWorkflow` 创建新 job。

**理由**：
- 语义清晰：重试 = 用相同输入创建新任务
- 复用现有逻辑，不引入额外状态
- 返回新 job 而非修改原 job，保持 job 不可变性

**替代方案**：
- 修改原 job 状态为 pending 重新执行：破坏 job 不可变性
- 在 runtime 层实现 retry：增加 core-engine 复杂度

### D4: 新命令分文件实现

**决策**：每个新命令一个文件（`list-providers.ts`、`describe-provider.ts`、`get-provider-config.ts`、`save-provider-config.ts`、`retry-job.ts`），通过 `index.ts` barrel 导出。

**理由**：
- 与 v1 三命令结构一致
- 便于测试和维护
- 符合 spec 中"二期命令以新文件追加"的扩展策略

## Risks / Trade-offs

### R1: Config Adapter 初始化时机

**风险**：如果 adapter 在 runtime 初始化后才设置，可能导致早期的 `getProviderConfig` 调用返回 undefined。

**缓解**：
- 提供 `setConfigAdapter(adapter)` 方法，允许延迟设置
- 在 adapter 未设置时，`getProviderConfig` 返回 in-memory 缓存或 undefined（不抛错）

### R2: Provider Registry 暴露可能被滥用

**风险**：暴露 `runtime.registry` 可能导致 UI 层直接操作 registry 或通过 `get()` 返回的 Provider 实例调用其方法。

**缓解**：
- 只暴露 `list()` 和 `get()` 方法，不暴露 `register()` 方法（即只读视图）
- `get()` 返回的 `Provider` 实例本身是可调用的（`invoke()`、`validateConfig()` 等），这是设计权衡
- 文档明确禁止 UI 层通过 `runtime.registry.get()` 获取 provider 后直接调用其方法
- UI 层应只使用 commands 层提供的命令，不直接操作 provider 实例

### R3: retryJob 对已完成 job 的行为

**风险**：用户可能对 `completed` 状态的 job 调用 retry。

**缓解**：
- 允许 retry 任意状态的 job（语义 = "用相同输入再跑一次"）
- 返回新 job，不影响原 job 状态
