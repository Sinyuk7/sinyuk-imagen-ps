# Handoff: Provider Profile Foundation → CLI Provider/Model 闭环

日期：2026-04-29

## 1. 当前上下文摘要

本轮完成并归档了 OpenSpec change：`provider-storage-discovery-foundation`。

归档位置：

```text
openspec/changes/archive/2026-04-29-provider-storage-discovery-foundation/
```

归档时已同步主线 specs：

- `openspec/specs/provider-profile-discovery/spec.md`
- `openspec/specs/runtime-assembly/spec.md`
- `openspec/specs/shared-commands-provider-config/spec.md`

最终验证已通过：

```bash
pnpm --filter @imagen-ps/workflows build
pnpm --filter @imagen-ps/shared-commands build
pnpm --filter @imagen-ps/shared-commands test
pnpm --filter @imagen-ps/cli build
pnpm --filter @imagen-ps/cli test
```

关键测试结果：

- `@imagen-ps/shared-commands` tests：26 passed
- `@imagen-ps/cli` tests：32 passed

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

### 2.2 Shared Commands 能力

`@imagen-ps/shared-commands` 已新增：

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

### 2.3 Runtime Dispatch 能力

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
5. 调用 provider validation / invocation。

注意：`profileId` 不是 provider implementation id；不能用 `profileId` 查 provider registry。

### 2.4 CLI Adapter 能力

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

设计决策：当前 app 尚未发布给用户，因此不实现旧 `~/.imagen-ps/config.json` provider config shape 的 read-time migration，避免过度设计。

## 3. 关键文档入口

建议下一个 session 先阅读：

- `AGENTS.md`
- `archive/DOCUMENTATION.md`
- `docs/STORAGE_DESIGN.md`
- `openspec/specs/provider-profile-discovery/spec.md`
- `openspec/specs/runtime-assembly/spec.md`
- `openspec/specs/shared-commands-provider-config/spec.md`
- `packages/shared-commands/src/commands/types.ts`
- `packages/shared-commands/src/commands/provider-profiles.ts`
- `packages/shared-commands/src/runtime.ts`
- `apps/cli/src/adapters/file-provider-profile-adapter.ts`
- `apps/cli/src/commands/provider/profile.ts`

## 4. 下一步推荐方向

用户明确倾向：不要马上进入 UXP/UI；先用 CLI 作为完整验证端，把 Provider + Model + Profile 的核心链路稳定后，再开发界面。

这个判断是合理的，因为 CLI 和 UXP 的底层业务逻辑应该共用：

```text
surface adapter 不同
  ↓
shared-commands 相同
  ↓
runtime / profile resolver 相同
  ↓
providers / workflows 相同
```

CLI 与 UXP 的差异主要是 adapter：

| 层 | CLI | Photoshop UXP |
|----|-----|---------------|
| profile repository | Node file adapter | `localFileSystem.getDataFolder()` adapter |
| secret storage | CLI file adapter / later OS keychain | UXP `secureStorage` |
| IO surface | JSON stdout/stderr | React panel + Photoshop host |

因此下一阶段推荐 **CLI-first Provider/Model 闭环**。

## 5. 推荐实施顺序

### Change 1: `provider-model-selection-foundation`

目标：稳定 model selection 语义，并用 mock provider 完成无外部依赖的自动化验证。

建议 scope：

1. 明确 model selection 优先级：

   ```text
   job input explicit model
     > provider profile defaultModel
     > provider implementation fallback default
   ```

2. 让 `provider-generate` workflow 支持绑定 `providerOptions.model`。

3. 增强 `mock` provider：

   - 读取 `request.providerOptions.model`
   - fallback 到 `config.defaultModel`
   - 再 fallback 到 mock 默认 model，例如 `mock-image-v1`
   - 在 result `raw` 中回显 selected model

   期望 raw 形态：

   ```ts
   {
     mock: true,
     operation: 'generate',
     prompt: '...',
     model: 'mock-image-v1',
     assetCount: 1
   }
   ```

4. 增加自动化测试：

   - profile A default model = `mock-a`
   - profile B default model = `mock-b`
   - dispatch profile A 使用 `mock-a`
   - dispatch profile B 使用 `mock-b`
   - job input override model 使用 override model
   - 更新 profile 后下一次 dispatch 立即生效

建议优先做这个 change。

### Change 2: `cli-provider-profile-ops`

目标：让 CLI 更适合人工与脚本操作 provider profile / model。

可能 scope：

- `imagen provider profile models <profileId>`
- `imagen provider profile set-default-model <profileId> <modelId>`
- `imagen provider profile enable <profileId>`
- `imagen provider profile disable <profileId>`
- CLI README 增加完整 profile/model/job submit 脚本示例

建议在 Change 1 的 model semantics 稳定后再做。

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
- 当前 Provider/Profile/Model 语义还没有在单端完整打穿。
- 先在 CLI 上稳定一端，可以减少后续 UI 层返工。

### 6.2 暂不建议做跨 surface 自动共享

目前已明确：CLI 默认 store 与 UXP store 不自动共享。跨 surface 共享以后应通过：

- shared repository adapter
- import/export flow
- UXP picker / persistent token 授权

当前阶段不需要提前实现。

### 6.3 暂不建议做旧 config migration

当前 app 仍在开发中，没有真实用户存量数据。继续兼容旧 `~/.imagen-ps/config.json` provider config shape 会增加复杂度，已明确不做。

## 7. 下个 session 的建议开场指令

可以直接说：

```text
请基于 docs/HANDOFF_2026-04-29_PROVIDER_MODEL_CLI.md，创建 OpenSpec change: provider-model-selection-foundation。目标是 CLI-first 跑通 Provider Profile + Model Selection 自动化闭环，先不要做 UXP/UI。
```

建议创建 OpenSpec proposal 后再实现，不要直接改代码。
