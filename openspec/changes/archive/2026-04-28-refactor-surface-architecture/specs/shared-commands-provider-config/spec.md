## MODIFIED Requirements

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
