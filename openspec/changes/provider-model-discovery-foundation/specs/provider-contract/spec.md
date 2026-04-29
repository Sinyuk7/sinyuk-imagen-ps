## ADDED Requirements

### Requirement: Provider model info SHALL be a minimal shared type

`packages/providers` MUST 在公开 contract 中导出 `ProviderModelInfo` 类型，作为所有 model 候选位点（`ProviderDescriptor.defaultModels`、`Provider.discoverModels` 返回值、`ProviderProfile.models` 持久化形态）的统一形态。

`ProviderModelInfo` MUST 仅包含：

- `id: string`：model 的稳定标识，等同于 provider 调用时 `request.providerOptions.model` 的值。
- `displayName?: string`：可选的展示名，供 UI 渲染。

`ProviderModelInfo` MUST NOT 包含 `capabilities`、`metadata`、`paramSchema`、`limits`、`cost` 或任何能力声明字段；这些维度若未来需要，必须通过单独 capability 引入，不得搭载到本类型上。

#### Scenario: Consumer imports ProviderModelInfo from package root

- **WHEN** 上层模块从 `@imagen-ps/providers` 导入 `ProviderModelInfo`
- **THEN** 该导入 MUST 解析到一个 readonly object 类型 `{ id: string; displayName?: string }`
- **AND** 它 MUST NOT 暴露 `capabilities` 或 `metadata` 字段

#### Scenario: ProviderModelInfo is reused across all model candidate sites

- **WHEN** `ProviderDescriptor.defaultModels`、`Provider.discoverModels` 与 `ProviderProfile.models` 三者出现 model 列表
- **THEN** 它们 MUST 使用同一个 `ProviderModelInfo` 类型，而不是各自定义同义结构

### Requirement: Provider descriptor SHALL declare optional fallback model candidates

`ProviderDescriptor` MUST 提供 OPTIONAL 字段 `defaultModels?: readonly ProviderModelInfo[]`，用于声明该 provider implementation 自带的 fallback model 候选清单。

`defaultModels` 的语义 MUST 为 "当没有任何 profile-side discovery 缓存可用时，作为该 implementation 的兜底候选"。`defaultModels` MUST NOT 参与 `provider.invoke()` 的 model 解析（model 解析仍由 `model-selection` 三级优先级负责，不得耦合到本字段）。

provider implementation 是否声明 `defaultModels` MUST 由该 implementation 自由决定；空数组与未声明在 `listProfileModels` 行为上等价（均视为"无 implementation 兜底"）。

#### Scenario: Mock implementation declares defaultModels

- **WHEN** 调用方读取 `mockProvider.describe().defaultModels`
- **THEN** 它 MUST 返回 `[{ id: 'mock-image-v1' }]`
- **AND** 该字段 MUST NOT 被 `provider.invoke()` 内部读取

#### Scenario: Implementation omits defaultModels

- **WHEN** provider implementation 不声明 `defaultModels`
- **THEN** `descriptor.defaultModels` MUST 为 `undefined`
- **AND** 调用方在 fallback chain 中 MUST 将其视为"无候选"

### Requirement: Provider SHALL declare optional model discovery capability

`Provider` MUST 提供 OPTIONAL 方法 `discoverModels?(config: ProviderConfig): Promise<readonly ProviderModelInfo[]>`，作为 implementation 的运行时 model discovery 能力位。

`discoverModels` 的语义 MUST 为 "向上游或 implementation 内部数据源询问当前可用的 model 候选清单"。该方法 MUST 是无状态的查询：不得修改 `config`、不得写入任何 host 持久化状态。

provider implementation 是否实现 `discoverModels` MUST 由该 implementation 自由决定。未实现该方法时，调用方 MUST 在 `refreshProfileModels` 路径上视为"该 implementation 不支持 discovery"。

#### Scenario: Mock implementation does not implement discoverModels

- **WHEN** 调用方读取 `mockProvider.discoverModels`
- **THEN** 该字段 MUST 为 `undefined`
- **AND** 任何依赖 discovery 的命令 MUST 将其视为"该 implementation 不支持 discovery"

#### Scenario: Implementation declares discoverModels

- **WHEN** provider implementation 实现了 `discoverModels(config)`
- **THEN** 该方法 MUST 返回 `Promise<readonly ProviderModelInfo[]>`
- **AND** 该方法 MUST NOT mutate `config` 或 host persisted state
- **AND** 该方法 MAY 抛出错误以表示 discovery 失败；调用方 SHALL 按 `refreshProfileModels` 失败语义处理
