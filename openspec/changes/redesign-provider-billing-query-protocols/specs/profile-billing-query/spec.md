## ADDED Requirements

### Requirement: Profile billing query SHALL use source-based configuration
系统 MUST 使用 source-based `billing` 配置替换旧 `mode` 结构。每个 profile 的 billing 查询配置 MUST 仅允许 `disabled`、`profile-api-key`、`billing-token` 三种 source，并将 billing `path` 存放在 `config.billing` 中，而不是复用 generation `paths`。

#### Scenario: 保存使用当前 API key 的 billing 配置
- **WHEN** 用户为某个 profile 选择 `Use current API key` 并填写 billing `path`
- **THEN** 系统 MUST 在该 profile 的 `config.billing` 中保存 `source=profile-api-key` 与 `path`
- **THEN** 系统 MUST NOT 为该配置新增独立 billing token secret

#### Scenario: 保存使用 billing token 的 billing 配置
- **WHEN** 用户为某个 profile 选择 `Use billing token` 并填写 billing `path` 与 token
- **THEN** 系统 MUST 在该 profile 的 `config.billing` 中保存 `source=billing-token` 与 `path`
- **THEN** 系统 MUST 将 token 通过 `secretRefs/secretValues` 持久化，而不是写入 profile `config`

### Requirement: Billing query SHALL use global protocol registry
系统 MUST 维护全局 billing protocol registry，并用它描述 protocol 的请求构造与响应解析规则。首批 registry MUST 包含 `credits-api-key-json-v1`、`credits-token-json-v1`、`new-api-user-bearer-v1`。

#### Scenario: profile-api-key source 触发 registry 查询
- **WHEN** 某个 profile 的 billing source 为 `profile-api-key`
- **THEN** 系统 MUST 仅从全局 registry 中选择适用于 `profile-api-key` 的 protocol 候选

#### Scenario: billing-token source 触发 registry 查询
- **WHEN** 某个 profile 的 billing source 为 `billing-token`
- **THEN** 系统 MUST 仅从全局 registry 中选择适用于 `billing-token` 的 protocol 候选

### Requirement: Billing query SHALL stop at first successful protocol
系统 MUST 按候选顺序尝试 billing protocol，并在首个 protocol 成功返回可解析余额结果后立即停止。只有当所有候选 protocol 都失败时，系统才可以向调用方返回最终错误。

#### Scenario: 第二个 protocol 成功
- **WHEN** 某个 profile 的第一个候选 protocol 失败而第二个候选 protocol 成功
- **THEN** 系统 MUST 返回第二个 protocol 的余额结果
- **THEN** 系统 MUST NOT 继续尝试后续 protocol

#### Scenario: 全部 protocol 失败
- **WHEN** 某个 profile 的所有候选 protocol 都无法成功返回可解析余额结果
- **THEN** 系统 MUST 返回单个最终错误给调用方
- **THEN** 系统 MUST NOT 将中间失败逐条暴露为用户可见错误列表

### Requirement: Successful billing protocol SHALL be persisted on the profile
系统 MUST 在 billing query 成功后将命中的 protocol 记录为当前 profile 的 `lastSuccessfulProtocolId`，并更新该 profile 的 `updatedAt`。后续查询 MUST 优先尝试该 protocol。

#### Scenario: 首次命中新 protocol
- **WHEN** 某个 profile 的 billing query 首次成功命中一个与当前持久化 hint 不同的 protocol
- **THEN** 系统 MUST 将该 protocol 写入当前 profile 的 `config.billing.lastSuccessfulProtocolId`
- **THEN** 系统 MUST 更新该 profile 的 `updatedAt`

#### Scenario: 下次查询优先使用成功 protocol
- **WHEN** 某个 profile 已持久化 `lastSuccessfulProtocolId`
- **THEN** 系统 MUST 在下一次 billing query 中优先尝试该 protocol

### Requirement: Billing protocol hint SHALL NOT invalidate billing cache keys
系统 MUST 将 `lastSuccessfulProtocolId` 视为查询 hint，而不是余额缓存语义的一部分。billing cache fingerprint MUST NOT 因为仅有 `lastSuccessfulProtocolId` 变化而被判定为配置变更。

#### Scenario: 仅更新 protocol hint
- **WHEN** 某个 profile 的 billing 配置只有 `lastSuccessfulProtocolId` 发生变化
- **THEN** 系统 MUST NOT 因此清空该 profile 的 billing cache state

### Requirement: Billing settings UI SHALL expose only simplified user-visible modes
系统 MUST 在 profile add/edit 页面仅暴露 `Disabled`、`Use current API key`、`Use billing token` 三种 billing 查询模式，并按 source 渲染对应字段。

#### Scenario: 当前 API key 模式显示字段
- **WHEN** 用户在 settings 页面选择 `Use current API key`
- **THEN** 系统 MUST 显示 billing `path` 输入
- **THEN** 系统 MUST NOT 显示 billing token 输入

#### Scenario: billing token 模式显示字段
- **WHEN** 用户在 settings 页面选择 `Use billing token`
- **THEN** 系统 MUST 显示 billing `path`、billing token 与 `userId`（可选）输入

### Requirement: Legacy billing mode data SHALL be rejected
系统 MUST 删除旧 `mode: 'none' | 'official' | 'new-api'` billing shape。对于仍然携带旧 billing mode 结构的数据，系统 MUST 不提供兼容读取或迁移行为。

#### Scenario: 读取旧 billing mode 数据
- **WHEN** 系统读取到仍使用旧 billing mode 结构的 profile 数据
- **THEN** 系统 MUST 将其视为无效旧数据
- **THEN** 系统 MUST NOT 自动迁移该数据为新 billing 结构
