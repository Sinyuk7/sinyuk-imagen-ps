## ADDED Requirements

### Requirement: listProviders 命令

`listProviders()` SHALL 返回所有已注册 provider 的 descriptor 列表。内部 SHALL 调用 `runtime.registry.list()`。返回类型 SHALL 为 `ProviderDescriptor[]`，不使用 `CommandResult` 包装（纯同步查询，无错误场景）。

#### Scenario: 列出所有已注册 provider
- **WHEN** 调用 `listProviders()`
- **THEN** 返回 `ProviderDescriptor[]`，包含所有已注册 provider 的元数据
- **AND** 返回顺序 SHALL 与 registry 注册顺序一致

#### Scenario: 无已注册 provider
- **WHEN** 调用 `listProviders()` 且 registry 为空
- **THEN** 返回空数组 `[]`

---

### Requirement: describeProvider 命令

`describeProvider(providerId: string)` SHALL 返回指定 provider 的详细描述。内部 SHALL 调用 `runtime.registry.get(providerId)?.describe()`。返回类型 SHALL 为 `ProviderDescriptor | undefined`。

#### Scenario: 获取已存在 provider 的描述
- **WHEN** 调用 `describeProvider('mock')` 且 mock provider 已注册
- **THEN** 返回该 provider 的 `ProviderDescriptor`
- **AND** descriptor SHALL 包含 `id`、`family`、`displayName`、`capabilities`、`operations` 字段

#### Scenario: 获取不存在 provider 的描述
- **WHEN** 调用 `describeProvider('nonexistent')`
- **THEN** 返回 `undefined`
- **AND** MUST NOT 抛出异常

---

### Requirement: ConfigStorageAdapter 依赖注入

commands 层 SHALL 定义 `ConfigStorageAdapter` 接口用于 config 持久化。`runtime.ts` SHALL 支持通过 `setConfigAdapter(adapter)` 设置 adapter。默认 SHALL 使用 in-memory adapter。

```typescript
interface ConfigStorageAdapter {
  get(providerId: string): Promise<ProviderConfig | undefined>;
  save(providerId: string, config: ProviderConfig): Promise<void>;
}
```

#### Scenario: 设置 config adapter
- **WHEN** 调用 `setConfigAdapter(customAdapter)`
- **THEN** 后续 `getProviderConfig` 和 `saveProviderConfig` SHALL 使用该 adapter

#### Scenario: 默认使用 in-memory adapter
- **WHEN** 未调用 `setConfigAdapter`
- **THEN** `getProviderConfig` 和 `saveProviderConfig` SHALL 使用内置 in-memory adapter

#### Scenario: 测试重置时重置 adapter
- **WHEN** 调用 `_resetForTesting()`
- **THEN** config adapter SHALL 重置为默认 in-memory adapter

---

### Requirement: getProviderConfig 命令

`getProviderConfig(providerId: string)` SHALL 异步获取指定 provider 的配置。内部 SHALL 调用 `configAdapter.get(providerId)`。返回类型 SHALL 为 `Promise<CommandResult<ProviderConfig>>`。

#### Scenario: 获取已保存的 config
- **WHEN** 调用 `getProviderConfig('mock')` 且该 provider 已有保存的配置
- **THEN** 返回 `{ ok: true, value: ProviderConfig }`

#### Scenario: 获取未保存的 config
- **WHEN** 调用 `getProviderConfig('mock')` 且该 provider 无保存的配置
- **THEN** 返回 `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL 为 `'validation'`
- **AND** `error.message` SHALL 包含 provider id

#### Scenario: 获取不存在 provider 的 config
- **WHEN** 调用 `getProviderConfig('nonexistent')` 且该 provider 未注册
- **THEN** 返回 `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL 为 `'validation'`

---

### Requirement: saveProviderConfig 命令

`saveProviderConfig(providerId: string, config: unknown)` SHALL 异步保存 provider 配置。内部 SHALL 先调用 `provider.validateConfig(config)` 校验，再调用 `configAdapter.save(providerId, validatedConfig)`。返回类型 SHALL 为 `Promise<CommandResult<void>>`。

#### Scenario: 保存有效 config
- **WHEN** 调用 `saveProviderConfig('mock', validConfig)` 且 config 校验通过
- **THEN** 返回 `{ ok: true, value: undefined }`
- **AND** 后续 `getProviderConfig('mock')` SHALL 返回该 config

#### Scenario: 保存无效 config
- **WHEN** 调用 `saveProviderConfig('mock', invalidConfig)` 且 config 校验失败
- **THEN** 返回 `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL 为 `'validation'`
- **AND** config adapter SHALL NOT 被调用

#### Scenario: 保存到不存在的 provider
- **WHEN** 调用 `saveProviderConfig('nonexistent', config)`
- **THEN** 返回 `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL 为 `'validation'`
