## ADDED Requirements

### Requirement: Registry SHALL support registering a provider instance by stable id
Provider registry MUST 允许调用方以 provider 的 `id` 为键注册一个 `Provider` 实例，后续可通过同一 `id` 获取或列出该 provider。

#### Scenario: Register a provider instance
- **WHEN** 调用方使用 `registry.register(provider)` 注册一个 `Provider` 实例
- **THEN** registry MUST 接受该实例
- **AND** 后续通过 `registry.get(provider.id)` MUST 返回同一实例
- **AND** `registry.list()` MUST 包含该 provider 的 `ProviderDescriptor`

### Requirement: Registry SHALL reject duplicate provider id registration
Provider registry MUST 对重复的 `id` 注册采取显式拒绝策略，避免同一标识符对应不同实例导致的不可预期路由行为。

#### Scenario: Attempt to register duplicate provider id
- **WHEN** 调用方使用已存在 `id` 再次调用 `registry.register(provider)`
- **THEN** registry MUST 抛出包含 `message` 的结构化错误
- **AND** 该错误 MUST 可被映射为 `JobError { category: 'validation' }`
- **AND** 原有 provider 实例 MUST 不受影响

### Requirement: Registry SHALL support retrieving a provider instance by id
Provider registry MUST 提供按 `id` 精确获取 provider 实例的能力，返回类型应为 `Provider | undefined`。

#### Scenario: Get an existing provider
- **WHEN** 调用方使用 `registry.get(existingId)` 获取已注册 provider
- **THEN** registry MUST 返回对应的 `Provider` 实例

#### Scenario: Get a non-existent provider
- **WHEN** 调用方使用 `registry.get(unknownId)` 获取未注册 provider
- **THEN** registry MUST 返回 `undefined`
- **AND** MUST NOT 抛出异常

### Requirement: Registry SHALL support listing all registered provider descriptors
Provider registry MUST 提供列出全部已注册 provider 元数据的能力，返回结果为 `ProviderDescriptor[]`，不直接暴露 provider 实例内部状态。

#### Scenario: List registered providers
- **WHEN** 调用方使用 `registry.list()`
- **THEN** registry MUST 返回所有已注册 provider 的 `ProviderDescriptor` 数组
- **AND** 返回顺序 MUST 稳定（按注册顺序）
- **AND** 返回结果 MUST 不包含未暴露的 provider 内部实现细节

### Requirement: Registry SHALL NOT hold runtime state or config persistence
Provider registry MUST 只承担 provider 实例的内存路由表职责，不持有 job lifecycle、runtime state、config 持久化或 settings 存储。

#### Scenario: Registry remains stateless across unrelated operations
- **WHEN** registry 已完成 provider 注册
- **THEN** registry MUST NOT 自动保存或恢复注册信息到磁盘
- **AND** registry MUST NOT 持有 `ProviderInvokeResult`、`JobState` 或任何 runtime 状态
- **AND** registry 的 list/get/register 行为 MUST 仅依赖内部 provider 映射表
