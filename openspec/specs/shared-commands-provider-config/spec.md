# shared-commands-provider-config Specification

## Purpose
TBD - created by archiving change extend-shared-commands. Update Purpose after archive.
## Requirements
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

`@imagen-ps/shared-commands` SHALL 定义 `ConfigStorageAdapter` 接口用于 config 持久化。`packages/shared-commands/src/runtime.ts` SHALL 支持通过 `setConfigAdapter(adapter)` 设置 adapter。默认 SHALL 使用 in-memory adapter。

```typescript
interface ConfigStorageAdapter {
  get(providerId: string): Promise<ProviderConfig | undefined>;
  save(providerId: string, config: ProviderConfig): Promise<void>;
}
```

#### Scenario: 设置 config adapter
- **WHEN** 调用 `setConfigAdapter(customAdapter)` from `@imagen-ps/shared-commands`
- **THEN** 后续 `getProviderConfig` 和 `saveProviderConfig` SHALL 使用该 adapter

#### Scenario: 默认使用 in-memory adapter
- **WHEN** 未调用 `setConfigAdapter`
- **THEN** `getProviderConfig` 和 `saveProviderConfig` SHALL 使用内置 in-memory adapter

#### Scenario: 测试重置时重置 adapter
- **WHEN** 调用 `_resetForTesting()`
- **THEN** config adapter SHALL 重置为默认 in-memory adapter

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

### Requirement: Provider profile lifecycle commands
`@imagen-ps/shared-commands` SHALL expose provider profile lifecycle commands for listing, reading, saving, deleting, and testing configured provider profiles. These commands MUST use injected repository and secret abstractions and MUST NOT directly access UXP APIs, DOM APIs, Node filesystem, `path`, `os`, or environment variables.

#### Scenario: List provider profiles
- **WHEN** `listProviderProfiles()` is called
- **THEN** it SHALL return configured provider profiles from the injected provider profile repository
- **AND** returned values MUST NOT include secret values

#### Scenario: Get provider profile
- **WHEN** `getProviderProfile(profileId)` is called for an existing profile
- **THEN** it SHALL return that provider profile without secret values

#### Scenario: Save provider profile
- **WHEN** `saveProviderProfile(input)` is called with valid non-secret config and secret input
- **THEN** it SHALL persist non-secret profile data through the provider profile repository
- **AND** it SHALL persist sensitive values through the injected secret storage abstraction
- **AND** it SHALL return a `CommandResult` without secret values

#### Scenario: Delete provider profile
- **WHEN** `deleteProviderProfile(profileId)` is called for an existing profile
- **THEN** it SHALL delete the profile from the provider profile repository
- **AND** it SHALL delete associated secrets by default unless the caller explicitly requests retain-secrets mode

### Requirement: Provider profile validation through registered implementation
Provider profile save and test commands SHALL validate profile runtime config through the registered provider implementation for the profile family. If no implementation is registered for the profile family, the command SHALL fail with a validation error.

#### Scenario: Save profile for supported family
- **WHEN** `saveProviderProfile(input)` is called for a family with a registered provider implementation
- **THEN** the command SHALL validate the resolved provider config using that implementation before reporting success

#### Scenario: Save profile for unsupported family
- **WHEN** `saveProviderProfile(input)` is called for a family with no registered provider implementation
- **THEN** the command SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`

#### Scenario: Save profile fails provider validation
- **WHEN** `saveProviderProfile(input)` resolves a runtime config but `provider.validateConfig()` fails
- **THEN** the command SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`
- **AND** no new provider profile SHALL be persisted for that failed save
- **AND** any secrets written only for that failed save SHALL be cleaned up or made unreachable according to the documented compensation policy

### Requirement: Provider profile save partial-write handling
`saveProviderProfile(input)` SHALL define deterministic compensation behavior for partial-write failures across profile repository and secret storage. It MUST NOT report success if either profile persistence or required secret persistence fails.

#### Scenario: Secret storage fails during save
- **WHEN** `saveProviderProfile(input)` cannot persist a required secret value
- **THEN** the command SHALL return `{ ok: false, error: JobError }`
- **AND** it SHALL NOT persist a profile that references the missing secret

#### Scenario: Profile repository save fails after secret write
- **WHEN** `saveProviderProfile(input)` writes one or more new secrets but then profile repository save fails
- **THEN** the command SHALL return `{ ok: false, error: JobError }`
- **AND** it SHALL attempt to delete secrets written only for that failed save
- **AND** the command result MUST NOT include secret values even if cleanup fails

#### Scenario: Updating existing profile fails after new secret write
- **WHEN** `saveProviderProfile(input)` updates an existing profile and writes a replacement secret but repository save fails
- **THEN** the previously persisted profile SHALL remain the effective profile if the repository supports atomic replacement
- **AND** the command SHALL attempt to remove replacement secrets that are not referenced by the effective profile

### Requirement: Test provider profile command
`testProviderProfile(profileId)` SHALL resolve a provider profile, validate it through the registered provider implementation, and return a `CommandResult` that does not expose secret values. The test operation MAY be validation-only unless a provider-specific lightweight connectivity check is explicitly available.

#### Scenario: Test existing valid profile
- **WHEN** `testProviderProfile(profileId)` is called for an existing profile with resolvable secrets and valid runtime config
- **THEN** it SHALL return `{ ok: true, value: ... }`
- **AND** the returned value MUST NOT include secret values

#### Scenario: Test missing profile
- **WHEN** `testProviderProfile(profileId)` is called for a profile id that does not exist
- **THEN** it SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`

#### Scenario: Test profile with missing secret
- **WHEN** `testProviderProfile(profileId)` resolves a profile whose required secret value is missing
- **THEN** it SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`
- **AND** the error MUST NOT include secret values

#### Scenario: Test profile with provider validation failure
- **WHEN** `testProviderProfile(profileId)` resolves config but provider validation fails
- **THEN** it SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`

#### Scenario: Test profile connectivity failure
- **WHEN** `testProviderProfile(profileId)` performs a lightweight connectivity check and the upstream provider fails
- **THEN** it SHALL return `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'provider'`
- **AND** the error MUST NOT include secret values

### Requirement: Backward-compatible provider config path
Existing `getProviderConfig` and `saveProviderConfig` behavior SHALL remain available during migration, but new provider discovery behavior SHALL be based on provider profiles. Backward-compatible commands MUST NOT introduce new secret leakage behavior.

#### Scenario: Existing config command remains usable
- **WHEN** existing callers use `saveProviderConfig(providerId, config)` during the migration period
- **THEN** the command SHALL continue to validate config through the registered provider implementation
- **AND** the command MUST NOT expose secret values in returned command results

#### Scenario: Profile commands are preferred for new discovery
- **WHEN** UI or CLI needs to display configured provider instances
- **THEN** it SHALL use provider profile lifecycle commands rather than deriving configured instances from implementation descriptors alone

