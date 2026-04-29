## ADDED Requirements

### Requirement: Mock provider SHALL declare defaultModels and omit discoverModels

Mock provider MUST 在 `describe()` 返回的 `ProviderDescriptor` 中声明 `defaultModels: [{ id: 'mock-image-v1' }]`，作为 implementation 自带的 fallback model 候选清单。

Mock provider MUST NOT 实现 `discoverModels` 方法；其 `discoverModels` 字段 MUST 为 `undefined`。这反映 mock 没有可询问的远端来源，将 discovery 失败语义留给 `refreshProfileModels` 验证场景。

`defaultModels` 与 mock provider 的 `invoke()` model fallback 互不耦合：`invoke()` 仍按 `model-selection` 三级优先级解析 effective model（`request.providerOptions.model` → `config.defaultModel` → 硬编码默认值 `mock-image-v1`），不读取 `descriptor.defaultModels`。

#### Scenario: Mock describes defaultModels

- **WHEN** 调用方读取 `mockProvider.describe().defaultModels`
- **THEN** 它 MUST 返回 `[{ id: 'mock-image-v1' }]`
- **AND** 该值 MUST NOT 影响 `invoke()` 的 effective model 解析

#### Scenario: Mock omits discoverModels

- **WHEN** 调用方读取 `mockProvider.discoverModels`
- **THEN** 该字段 MUST 为 `undefined`

#### Scenario: refreshProfileModels against mock fails with validation error

- **WHEN** `refreshProfileModels(profileId)` 被调用，且 `profile.providerId === 'mock'`
- **THEN** 它 MUST 返回 `{ ok: false, error: JobError }`
- **AND** `error.category` SHALL be `'validation'`
- **AND** persisted `profile.models` MUST 保持调用前的值

#### Scenario: listProfileModels falls back to mock defaultModels

- **WHEN** `listProfileModels(profileId)` 被调用，`profile.providerId === 'mock'`，且 `profile.models` 为空或未定义
- **THEN** 它 MUST 返回 `{ ok: true, value: [{ id: 'mock-image-v1' }] }`
