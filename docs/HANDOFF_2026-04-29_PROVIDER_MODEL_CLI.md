# Handoff: Provider Profile Foundation → CLI Provider/Model 闭环

日期：2026-04-29（更新）

> **⚠️ 路径已废弃（更新于 `provider-model-discovery-foundation` change）**
>
> 本文档原文中所有 `imagen provider profile *` 的命令路径**已被破坏性废弃**。
> 新路径已扁平化为 `imagen profile *`：
>
> - `imagen provider profile list / get / save / delete / test`
>   → `imagen profile list / get / save / delete / test`
> - `imagen provider profile models / refresh-models / set-default-model / enable / disable`
>   → `imagen profile models / refresh-models / set-default-model / enable / disable`
>
> 详见 `apps/cli/README.md` 的 “Profile Management” 章节。本文剩余内容仅作历史
> 上下文保留，CLI 命令拼写以 `apps/cli/README.md` 为唯一权威来源。

## 1. 当前上下文摘要

本轮完成并归档了两个 OpenSpec change。

### 1.1 已归档 Change: `provider-storage-discovery-foundation`

归档位置：

```text
openspec/changes/archive/2026-04-29-provider-storage-discovery-foundation/
```

归档时已同步主线 specs：

- `openspec/specs/provider-profile-discovery/spec.md`
- `openspec/specs/runtime-assembly/spec.md`
- `openspec/specs/shared-commands-provider-config/spec.md`

### 1.2 已归档 Change: `provider-model-selection-foundation`

归档位置：

```text
openspec/changes/archive/2026-04-29-provider-model-selection-foundation/
```

归档时已同步主线 specs：

- `openspec/specs/model-selection/spec.md`（新建）
- `openspec/specs/mock-provider/spec.md`（修改：增加 model fallback chain + raw.model 回显）
- `openspec/specs/builtin-workflow-contract/spec.md`（修改：providerOptions 从 tentative 升级为 stable）

最终验证已通过：

```bash
pnpm --filter @imagen-ps/providers build && test   # 9 passed
pnpm --filter @imagen-ps/workflows build && test   # 23 passed
pnpm --filter @imagen-ps/shared-commands build && test  # 31 passed
pnpm --filter @imagen-ps/cli build && test          # 32 passed
```

## 2. 已建立的能力边界

### 2.1 Provider Profile 基础

当前系统已经区分三类概念：

| 概念 | 含义 | 示例 |
|------|------|------|
| provider implementation id | 编译期注册的 provider 实现 id | `mock`, `openai-compatible` |
| provider family | provider 家族/协议类型 | `openai-compatible` |
| provider profile id | 用户配置的 provider instance id | `mock-dev`, `openai-prod` |

`ProviderProfile` 当前核心字段：

```ts
interface ProviderProfile {
  readonly profileId: string;
  readonly providerId: string;
  readonly family: ProviderFamily;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly config: ProviderProfileConfig;
  readonly secretRefs?: Readonly<Record<string, string>>;
  readonly models?: readonly ProviderModelConfig[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
```

重要约束：

- `config` 只保存非敏感配置，例如 `baseURL`、`defaultModel`、`timeoutMs`。
- API key / token 等 secret value 不进入 profile JSON。
- secret value 通过 `SecretStorageAdapter` 保存，只在 resolver / validation / dispatch 调用栈内短暂出现。
- profile-facing commands 不返回 secret value。

### 2.2 Model Selection 三级优先级（✅ 本轮新增）

已定义并实现 model selection 三级优先级语义：

```text
job input explicit model (providerOptions.model)
  > provider profile defaultModel (config.defaultModel)
  > provider implementation fallback default (mock: 'mock-image-v1')
```

实现分两层协作：

1. **Profile-aware dispatch adapter**（`packages/shared-commands/src/runtime.ts`）：resolve profile 后，从 `providerConfig.defaultModel` 读取 defaultModel，注入到 `providerOptions.model`（仅在缺失时）。不 mutate 原 params，兼容两种 params 结构。
2. **Provider invoke**（每个 provider 的 `invoke` 实现）：从 `request.providerOptions.model` 读取 model，fallback 到 `config.defaultModel`，再 fallback 到硬编码默认值。

Mock provider invoke 已增强：`raw.model` 回显 effective model。

```ts
// raw 形态
{
  mock: true,
  operation: 'generate',
  prompt: '...',
  model: 'mock-image-v1',  // ← effective model 回显
  assetCount: 1
}
```

### 2.3 Workflow providerOptions 绑定（✅ 本轮新增）

`provider-generate` workflow step input 已绑定 `providerOptions`：

```ts
request: {
  operation: 'generate',
  prompt: '${prompt}',
  providerOptions: '${providerOptions}',  // ← 新增
}
```

`providerOptions` 已从 tentative 升级为 stable（仅 `provider-generate`）。

注意：mock request schema 增加了 `z.preprocess` 处理未解析的模板字符串，避免非 object 值导致 schema validation 失败。

### 2.4 Shared Commands 能力

`@imagen-ps/shared-commands` 已有：

- `ProviderProfileRepository`
- `SecretStorageAdapter`
- `ProviderConfigResolver`
- `ResolvedProviderConfig`
- `setProviderProfileRepository(...)`
- `setSecretStorageAdapter(...)`
- `setProviderConfigResolver(...)`

Profile lifecycle commands：

- `listProviderProfiles()`
- `getProviderProfile(profileId)`
- `saveProviderProfile(input)`
- `deleteProviderProfile(profileId, options?)`
- `testProviderProfile(profileId)`

### 2.5 Runtime Dispatch 能力

Runtime 已支持 profile-targeted dispatch：

```ts
provider: 'profile'
providerProfileId: '<profile-id>'
```

或：

```ts
provider: 'profile'
profileId: '<profile-id>'
```

dispatch path 会：

1. 读取 profile。
2. 解析 `secretRefs`。
3. 根据 `profile.providerId` 找到 provider implementation。
4. 合成 secret-bearing runtime config。
5. 注入 profile `defaultModel` 到 `providerOptions.model`（如果 job input 未提供）。
6. 调用 provider validation / invocation。

注意：`profileId` 不是 provider implementation id；不能用 `profileId` 查 provider registry。

### 2.6 CLI Adapter 能力

CLI 已注入独立 adapter：

- `FileProviderProfileRepository`
  - 默认文件：`~/.imagen-ps/provider-profiles.json`
  - schema：`{ schemaVersion: 1, profiles: [...] }`
- `FileSecretStorageAdapter`
  - 默认文件：`~/.imagen-ps/provider-secrets.json`
  - schema：`{ schemaVersion: 1, secrets: {...} }`

CLI 已有 profile commands：

```bash
imagen provider profile list
imagen provider profile get <profileId>
imagen provider profile save <profileJson>
imagen provider profile delete <profileId>
imagen provider profile delete <profileId> --retain-secrets
imagen provider profile test <profileId>
```

### 2.7 自动化测试覆盖（✅ 本轮新增）

`packages/shared-commands/tests/model-selection.test.ts` 覆盖：

- profile A `defaultModel = 'mock-a'`，dispatch profile A → 使用 `mock-a`
- profile B `defaultModel = 'mock-b'`，dispatch profile B → 使用 `mock-b`
- job input `providerOptions.model = 'override'` + profile A → 使用 `override`
- profile 无 `defaultModel`，job input 无 explicit model → 使用 `mock-image-v1`
- profile 更新 `defaultModel` 后下一次 dispatch 立即生效

`packages/providers/tests/mock-provider.test.ts` 覆盖：

- explicit providerOptions.model 覆盖 config.defaultModel
- fallback 到 config.defaultModel
- fallback 到硬编码 `mock-image-v1`
- providerOptions 存在但 model 缺失时的 fallback
- raw 中包含 model 与其他必需字段

## 3. 关键文档入口

建议下一个 session 先阅读：

- `AGENTS.md`
- `archive/DOCUMENTATION.md`
- `docs/STORAGE_DESIGN.md`
- `openspec/specs/model-selection/spec.md`（✅ 新增）
- `openspec/specs/mock-provider/spec.md`（✅ 已更新）
- `openspec/specs/builtin-workflow-contract/spec.md`（✅ 已更新）
- `openspec/specs/provider-profile-discovery/spec.md`
- `openspec/specs/runtime-assembly/spec.md`
- `openspec/specs/shared-commands-provider-config/spec.md`
- `packages/shared-commands/src/commands/types.ts`
- `packages/shared-commands/src/commands/provider-profiles.ts`
- `packages/shared-commands/src/runtime.ts`
- `packages/shared-commands/tests/model-selection.test.ts`（✅ 新增）
- `packages/providers/tests/mock-provider.test.ts`（✅ 新增）
- `apps/cli/src/adapters/file-provider-profile-adapter.ts`
- `apps/cli/src/commands/provider/profile.ts`

## 4. 下一步推荐方向

用户明确倾向：不要马上进入 UXP/UI；先用 CLI 作为完整验证端，把 Provider + Model + Profile 的核心链路稳定后，再开发界面。

已完成的链路（CLI-first 闭环）：

```text
✅ Provider Profile 持久化 + secret 引用
✅ Profile-targeted dispatch
✅ Model selection 三级优先级
✅ Mock provider model 回显
✅ Workflow providerOptions 绑定
✅ 自动化测试矩阵
```

CLI 与 UXP 的差异主要是 adapter：

| 层 | CLI | Photoshop UXP |
|----|-----|---------------|
| profile repository | Node file adapter | `localFileSystem.getDataFolder()` adapter |
| secret storage | CLI file adapter / later OS keychain | UXP `secureStorage` |
| IO surface | JSON stdout/stderr | React panel + Photoshop host |

## 5. 推荐实施顺序

### ~~Change 1: `provider-model-selection-foundation`~~ ✅ 已完成

已归档。Model selection 三级优先级已稳定，mock provider 回显已实现，自动化测试已覆盖完整矩阵。

### Change 2: `cli-provider-profile-ops` ✅ 已完成

目标：让 CLI 更适合人工与脚本操作 provider profile / model。

已实现命令（路径已扁平化为 `imagen profile *`）：

- `imagen profile models <profileId>` → `apps/cli/src/commands/profile/models.ts`
- `imagen profile set-default-model <profileId> <modelId>` → `apps/cli/src/commands/profile/set-default-model.ts`
- `imagen profile enable <profileId>` → `apps/cli/src/commands/profile/enable.ts`
- `imagen profile disable <profileId>` → `apps/cli/src/commands/profile/disable.ts`
- `imagen profile refresh-models <profileId>` → `apps/cli/src/commands/profile/refresh-models.ts`

底层 shared-commands 实现在 `packages/shared-commands/src/commands/profile-models.ts`：
- `listProfileModels` / `refreshProfileModels` / `setProfileDefaultModel` / `setProfileEnabled`

CLI README 已包含完整 profile/model/job submit 脚本示例。

### Change 3: `openai-compatible-cli-smoke`

目标：提供真实 provider 的手动 smoke 路径，但不依赖外网作为默认 CI。

建议 scope：

- 使用 env var 或 user-provided JSON 保存 `openai-compatible` profile。
- 手动执行 generate smoke。
- 测试 `defaultModel` 与 explicit model override 是否进入 HTTP request body。
- 默认 CI 不跑真实网络调用。

## 6. 暂不建议马上做的事情

### 6.1 暂不建议马上实现 UXP UI

原因：

- UXP adapter 与 UI 依赖 Photoshop host，调试和自动化成本高。
- 当前 Provider/Profile/Model 语义已在 CLI 端完整打穿，但 `provider-edit` workflow 的 `providerOptions` 绑定尚未做。
- 先在 CLI 上稳定一端，可以减少后续 UI 层返工。

### 6.2 暂不建议做跨 surface 自动共享

目前已明确：CLI 默认 store 与 UXP store 不自动共享。跨 surface 共享以后应通过：

- shared repository adapter
- import/export flow
- UXP picker / persistent token 授权

当前阶段不需要提前实现。

### 6.3 暂不建议做旧 config migration

当前 app 仍在开发中，没有真实用户存量数据。继续兼容旧 `~/.imagen-ps/config.json` provider config shape 会增加复杂度，已明确不做。

### 6.4 暂不建议做 `provider-edit` workflow 的 providerOptions 绑定

本轮只对 `provider-generate` 做了 `providerOptions` 绑定。`provider-edit` 的 `providerOptions` 绑定留给后续 change，避免当前 scope 膨胀。

## 7. 下个 session 的建议开场指令

可以直接说：

```text
请基于 docs/HANDOFF_2026-04-29_PROVIDER_MODEL_CLI.md，创建 OpenSpec change: cli-provider-profile-ops。目标是让 CLI 用户可以方便地操作 provider profile 的 model 配置，先不要做 UXP/UI。
```

建议创建 OpenSpec proposal 后再实现，不要直接改代码。