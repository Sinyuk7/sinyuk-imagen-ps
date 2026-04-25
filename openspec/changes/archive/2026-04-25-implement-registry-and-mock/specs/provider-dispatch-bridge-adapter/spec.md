## ADDED Requirements

### Requirement: Provider dispatch bridge adapter SHALL convert a Provider instance into a ProviderDispatchAdapter
Bridge 适配逻辑 MUST 接受一个 `Provider` 实例与已校验的 `config`，产出符合 `core-engine` `ProviderDispatchAdapter` 契约的对象，使 engine 能在不感知 provider 语义的前提下完成调用。

#### Scenario: Create dispatch adapter from mock provider
- **WHEN** 调用方使用 `createDispatchAdapter({ provider: mockProvider, config: validConfig })`
- **THEN** 它 MUST 返回一个 `ProviderDispatchAdapter` 实例
- **AND** `adapter.provider` MUST 与 `mockProvider.id` 一致

### Requirement: Dispatch adapter SHALL delegate dispatch to Provider invoke
`ProviderDispatchAdapter.dispatch()` MUST 将 engine 传入的 opaque `params` 解析为 provider 可消费的 `request`，然后调用 `Provider.invoke()`，最后将结果返回给 engine。

#### Scenario: Dispatch a valid request through adapter
- **WHEN** engine 调用 `adapter.dispatch(params)`，其中 `params` 包含合法的 canonical request 字段
- **THEN** adapter MUST 先使用 `provider.validateRequest(params)` 校验请求
- **AND** 校验通过后 MUST 调用 `provider.invoke({ config, request: validatedRequest })`
- **AND** 最终 MUST 将 `ProviderInvokeResult` 返回给 engine

#### Scenario: Dispatch fails due to invalid request
- **WHEN** engine 调用 `adapter.dispatch(params)`，其中 `params` 缺少必需字段
- **THEN** adapter MUST 让 `provider.validateRequest(params)` 抛出校验错误
- **AND** 该错误 MUST 被桥接层映射为 `JobError { category: 'validation' }`
- **AND** MUST NOT 触发 `provider.invoke()`

### Requirement: Dispatch adapter SHALL map provider errors to engine-compatible structured errors
Bridge 适配层 MUST 捕获 `Provider.invoke()` 抛出的错误，并将其映射为 `core-engine` 可消费的结构化错误（`JobError`），禁止将裸 `Error` 或 vendor-specific 异常直接抛给 engine。

#### Scenario: Provider invoke throws structured error
- **WHEN** `provider.invoke()` 抛出一个包含 `message` 与 `details` 的结构化错误
- **THEN** adapter MUST 将其包装为 `JobError { category: 'provider' }`
- **AND** 原始 `message` MUST 被保留
- **AND** 原始 `details` MUST 透传至 `JobError.details`

#### Scenario: Provider invoke throws unexpected error
- **WHEN** `provider.invoke()` 抛出一个非预期的裸 `Error` 或异常
- **THEN** adapter MUST 将其包装为 `JobError { category: 'provider' }`
- **AND** `message` MUST 包含原始错误信息
- **AND** `details` SHOULD 包含原始错误类型与堆栈上下文

### Requirement: Dispatch adapter SHALL pass AbortSignal when available
若 engine 通过某种机制（如扩展参数）传入取消信号，adapter MUST 将该信号透传至 `Provider.invoke()`，支持调用取消。

#### Scenario: Dispatch with cancellation signal
- **WHEN** adapter 在 `dispatch` 调用中检测到 `AbortSignal`
- **THEN** 它 MUST 将 `signal` 传入 `provider.invoke({ config, request, signal })`
- **AND** 若 signal 触发 abort，provider 抛出的 abort 错误 MUST 被正确映射

### Requirement: Bridge layer SHALL remain thin and provider-agnostic
Bridge 适配层 MUST 只负责参数转换与错误映射，不涉及 transport、retry、registry lookup 或 runtime lifecycle。

#### Scenario: Bridge does not implement retry
- **WHEN** `provider.invoke()` 因网络原因失败
- **THEN** bridge MUST 只做错误映射
- **AND** MUST NOT 在 bridge 层内部执行重试逻辑
- **AND** 重试 MUST 由 provider 内部或 engine 策略层负责

#### Scenario: Bridge does not hold registry reference
- **WHEN** adapter 被创建
- **THEN** 它 MUST 只持有给定的 `provider` 与 `config` 引用
- **AND** MUST NOT 直接访问 `ProviderRegistry`
