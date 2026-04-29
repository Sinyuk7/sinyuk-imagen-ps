## Why

当前 `ProviderProfile.models` 字段语义模糊，既被记作"profile 元数据"又没有产生实际行为，dispatch 完全不读它，CLI 也没有任何 surface 入口；同时用户在创建 profile 后无法以一致方式获取或刷新可选 model 列表，未来 UXP 端的"model 下拉菜单"与 CLI 的 `set-default-model` 也缺一个 surface-agnostic 的 model 候选契约。本次变更在不动 dispatch、三级优先级、secret 隔离、workflow contract 的前提下，把 `ProviderDescriptor` 与 `ProviderProfile` 围绕 model 候选的语义补齐，给 CLI 提供完整的 profile/model 操作闭环，为后续 `openai-compatible` 实现与 UXP UI 让出干净的接口。

## What Changes

- **BREAKING** `ProviderProfileInput` 移除 `models` 字段：profile 持久化形态中的 `models` 仅由 `refreshProfileModels` 写入，CLI/UI 不再以 `save` 路径接受用户传入。
- **BREAKING** `ProviderModelConfig` 重命名为 `ProviderModelInfo` 并精简为 `{ id: string; displayName?: string }`，删除 `capabilities` / `metadata` 字段。
- **BREAKING** CLI 命令路径扁平化：`imagen provider profile <sub>` → `imagen profile <sub>`；旧路径不保留。
- 在 `ProviderDescriptor` 上新增两个 OPTIONAL 字段：`defaultModels?: readonly ProviderModelInfo[]`（implementation 自带的 fallback 候选清单）与 `discoverModels?(config): Promise<readonly ProviderModelInfo[]>`（implementation 的运行时 discovery 能力）。
- `mock` provider 声明 `defaultModels: [{ id: 'mock-image-v1' }]`；不实现 `discoverModels`。
- `shared-commands` 新增 4 个命令：
  - `listProfileModels(profileId)`：内部 fallback chain 为 `profile.models` → `descriptor.defaultModels` → `[]`，不标注 source、不返回 fetchedAt。
  - `refreshProfileModels(profileId)`：调用 `descriptor.discoverModels(config)`；成功则覆盖写入 `profile.models` 并返回新列表；descriptor 未实现该接口或 discovery 抛错时返回错误，**`profile.models` 不被擦除**。
  - `setProfileDefaultModel(profileId, modelId)`：严格校验 `modelId ∈ listProfileModels(profileId)`，命中则写入 `config.defaultModel`，未命中返回 `ValidationError`。
  - `setProfileEnabled(profileId, enabled)`：写入 `profile.enabled`。
- CLI 新增 5 条命令：`profile models <id>` / `profile refresh-models <id>` / `profile set-default-model <id> <modelId>` / `profile enable <id>` / `profile disable <id>`。其中 `enable` / `disable` 对应 `setProfileEnabled` 的布尔切换，独立注册为两条 CLI 命令。README 新增 `save → models → set-default-model → submit-job` 的端到端示例。
- `ProviderProfile.models` 持久化字段保留但语义重写为"`refreshProfileModels` 的 discovery 缓存"，dispatch 路径仍不读该字段。

## Capabilities

### New Capabilities

（无新增 capability。本次变更全部落在已有 capability 的 spec delta 上。）

### Modified Capabilities

- `provider-contract`：`ProviderDescriptor` 新增两个 OPTIONAL 字段 `defaultModels` / `discoverModels`，并定义 `ProviderModelInfo` 类型。
- `provider-profile-discovery`：`ProviderProfile.models` 字段语义重定义为 discovery 缓存；类型从 `ProviderModelConfig` 改为 `ProviderModelInfo`；明确"dispatch 不读 `profile.models`"仍然成立。
- `shared-commands-provider-config`：新增 4 个命令；`saveProviderProfile` 的输入契约移除 `models` 字段；新命令使用 fallback chain 与严格校验语义。
- `mock-provider`：声明 `defaultModels`；明确不实现 `discoverModels`。

## Impact

- **代码**
  - `packages/providers`：`ProviderDescriptor` 类型扩展；`MockProvider` 声明 `defaultModels`；新增 `ProviderModelInfo` 类型并迁移既有 `ProviderModelConfig` 引用。
  - `packages/shared-commands`：`ProviderProfileInput` 删除 `models`；`saveProviderProfile` 移除接收/透传 `models` 的逻辑；新增 4 个 command；`ProviderProfile.models` 类型替换；`runtime` 注入接口不变。
  - `apps/cli`：命令路径从 `provider profile *` 扁平化为 `profile *`；新增 5 条命令；`apps/cli/README` 端到端示例更新。
- **测试**
  - `packages/providers/tests/`：`mock-provider` `defaultModels` 出现位置与值。
  - `packages/shared-commands/tests/`：新增 fallback chain、严格校验、`refresh-models on impl without discoverModels`、`save` 不再接受 `models` 字段（编译期 + 运行时）。
  - `apps/cli/tests/`：扁平化路径、5 条新命令的 happy path 与失败路径。
- **公共契约**
  - 仅 `provider-contract` 增加 OPTIONAL 字段（向前兼容已有 implementation）。
  - `ProviderProfileInput` 与 `ProviderModelConfig` 是 BREAKING 变更；项目当前处于开发期、无外部消费者，按 `docs/CHANGE_MANAGEMENT.md` 直接破坏性替换、不做兼容层。
- **不影响的范围**
  - `model-selection` 三级优先级、`builtin-workflow-contract`、`runtime-assembly` dispatch path、`SecretStorageAdapter` / `ProviderConfigResolver`、`provider-registry`、profile lifecycle commands `list/get/save/delete/test` 的核心语义。

## Non-goals

- 不实现 `openai-compatible.discoverModels()`：本次只在 `ProviderDescriptor` 上把 OPTIONAL 接口位先就位，具体实现留给后续 change（接 openai-compatible profile 时一起做）。
- 不引入 model 的 `paramSchema` / `capabilities` / `metadata` / `limits` 等"可执行 schema"字段，保持 `ProviderModelInfo` 极简。
- 不引入独立的 `ProviderAdapter` mapping 层：请求/响应映射继续放在各 provider 的 `invoke` 内部。
- 不改变 `provider.invoke` 的"同步 final-result"语义；不引入 progressive invoke / async polling 抽象。
- 不提供任何"用户手工编辑 profile.models 列表"的命令或 UI 入口。
- 不在 `listProfileModels` / `refreshProfileModels` 返回值或 `profile` 持久化数据上添加 `source` / `fetchedAt` / `fetchStatus` / `lastError` 等任何状态标注。
- 不为已有 `ProviderProfileInput.models` 字段做向后兼容（开发期，无外部用户）。
- 不动 `provider-edit` workflow 的 `providerOptions` 绑定（保持 handoff 第 6.4 节的暂缓决议）。
