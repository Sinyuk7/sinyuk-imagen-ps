# provider-contract Specification

## Purpose
TBD - created by archiving change stabilize-package-contract. Update Purpose after archive.
## Requirements
### Requirement: Provider package SHALL expose a stable public contract surface
`packages/providers` MUST 从包根入口公开稳定的 contract 类型与接口，而不是继续停留在空入口或仅导出占位模块。

#### Scenario: Consumer imports provider contract from package root
- **WHEN** 上层模块从 `@imagen-ps/providers` 导入公开 API
- **THEN** 它 MUST 能获取 provider contract、descriptor、config、request、result、diagnostics 与 bridge 相关类型
- **AND** 这些导出 MUST 不要求先实现具体 provider、registry 或 transport

### Requirement: Provider config SHALL describe a provider instance, not a vendor brand
provider config MUST 以可接入实例为中心，表达稳定的连接与默认策略信息，而不是把 vendor-specific 运行时细节写入稳定 contract。

#### Scenario: OpenAI-compatible instance configuration is defined
- **WHEN** 定义一个 `openai-compatible` provider config
- **THEN** 该 config MUST 支持 `providerId`、`displayName`、`baseURL`、`apiKey`
- **AND** 它 MUST 允许 `defaultModel`、`extraHeaders`、`capabilityHints`、`timeoutMs` 这类实例级可选项
- **AND** 它 MUST NOT 依赖文件路径、host object 或 vendor SDK client instance

### Requirement: Canonical request SHALL encode only minimal provider-owned intent
provider request contract MUST 只表达 provider 层拥有的最小意图，不得把 host IO、任务准备结果或 vendor 原始字段直接写入稳定 contract。

#### Scenario: Canonical image request is validated
- **WHEN** 一个 image job request 进入 provider contract
- **THEN** 它 MUST 至少支持 `operation`、`prompt`、可选的 `inputAssets`、`maskAsset`、`output`、`providerOptions`
- **AND** 它 MUST 将 `generate` 与 `edit` 视为稳定操作类型
- **AND** 它 MUST NOT 要求 `prepared_reference_image_path`、`debug_mode` 或 raw HTTP payload snapshot

### Requirement: Provider invoke SHALL return normalized result and structured diagnostics
provider 调用结果 MUST 被归一化为稳定 result shape，并允许附带结构化 diagnostics，而不是直接暴露上游原始响应结构。

#### Scenario: Provider invocation completes successfully
- **WHEN** 一个 provider 完成调用
- **THEN** 它 MUST 返回标准化的 `assets` 集合
- **AND** 它 MUST 可以返回结构化 `diagnostics`
- **AND** 它 MAY 包含调试用途的 `raw` 字段
- **AND** runtime-facing 调用方 MUST 不依赖 vendor-specific response shape

### Requirement: Providers SHALL bridge to core-engine through an explicit adapter contract
`packages/providers` MUST 明确定义从 `Provider` 到 `@imagen-ps/core-engine` `ProviderDispatchAdapter` 的桥接契约，避免 engine 直接依赖 provider 内部语义。

#### Scenario: Provider instance is adapted for engine dispatch
- **WHEN** 一个 provider 实例被交给 `core-engine` 使用
- **THEN** 它 MUST 通过显式 bridge 或 factory 产出 `ProviderDispatchAdapter`
- **AND** bridge 层 MUST 负责把 provider-owned config/request/invoke 语义收敛到 engine 可消费的最小 dispatch 面
- **AND** `core-engine` MUST NOT 直接理解 provider-specific validation、HTTP、retry 或 response parsing 细节

### Requirement: Asset references SHALL remain compatible with core-engine asset boundary
provider contract 中的 asset reference MUST 与 `@imagen-ps/core-engine` 的 `Asset` 边界兼容，不得制造无必要的平行资源模型。

#### Scenario: Provider contract accepts input assets
- **WHEN** provider request 使用 asset 引用
- **THEN** 该引用 MUST 与 `packages/core-engine/src/types/asset.ts` 中的 `Asset` shape 等价或可直接映射
- **AND** 它 MUST 保持 serializable 与 host-agnostic
- **AND** 它 MUST NOT 引入 DOM、UXP、Photoshop 或 filesystem-specific 类型

### Requirement: Provider validation and invocation failures SHALL expose structured errors
`Provider.validateConfig()`、`validateRequest()` 与 `invoke()` 在失败时 MUST 抛出可被归一化为 `@imagen-ps/core-engine` `JobError` 的结构化错误，而不是裸 `Error` 或 vendor-specific 异常。

#### Scenario: Provider validation fails
- **WHEN** `validateConfig()` 或 `validateRequest()` 检测到非法输入
- **THEN** 它 MUST 抛出一个包含 `message` 字段的错误对象
- **AND** 该错误 SHOULD 包含 `details` 字段，携带字段级诊断信息
- **AND** 该错误 MUST 可被 bridge 层映射为 `JobError { category: 'validation' }`

#### Scenario: Provider invocation fails
- **WHEN** `invoke()` 因网络、上游错误或内部状态失败
- **THEN** 它 MUST 抛出一个包含 `message` 字段的错误对象
- **AND** 该错误 SHOULD 包含 `details` 字段，携带 provider 上下文（如请求标识、状态码）
- **AND** 该错误 MUST 可被 bridge 层映射为 `JobError { category: 'provider' }`

### Requirement: Provider package SHALL compile with the documented tooling baseline
`packages/providers` MUST 使用与当前阶段文档一致的工程基线，以确保 contract 层可独立构建与验证。

#### Scenario: Contract-only package build is executed
- **WHEN** 在 `packages/providers` 运行 build 或 test 所依赖的基础工具链
- **THEN** package manifest MUST 包含 `zod`、`@types/node`
- **AND** 它 MUST 使用 `TypeScript >= 5.9` 与 `Vitest >= 4.1`
- **AND** `clean` 脚本 MUST 在当前 monorepo 的目标平台上可用

