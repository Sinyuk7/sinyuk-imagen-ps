# Storage Design

## 1. Status

- Status: Draft
- Scope: Project-level storage and persistence architecture
- Primary host target: Photoshop UXP
- Source implementation: Provider storage/discovery foundation in progress
- Last Updated: 2026-04-29

本文档用于固化 `sinyuk-imagen-ps` 的存储与持久化设计边界。它不是某个单一模块的实现说明，而是跨 `app/`、`shared commands`、`packages/*`、UXP host adapter、未来 CLI surface 的项目级架构文档。

当前阶段只定义设计原则、模块边界、接口方向和未来目录规划；不初始化源码目录，不引入新的 package，不实现具体 adapter。

## 2. Background

当前项目已经形成以下架构基线：

- `packages/core-engine` 负责 job lifecycle、workflow orchestration、provider dispatch、event emission、runtime API。
- `packages/core-engine` 不负责 UI、CLI、Photoshop API、文件系统、网络 IO 或 provider 参数语义。
- `packages/providers` 负责 provider contract、config schema、transport、result normalization、error mapping。
- `packages/providers` 不负责 runtime state、应用格式、settings persistence、host IO。
- `packages/workflows` 负责 declarative workflow spec、step ordering、binding 数据。
- `app/` 是当前唯一应用目录，承接 Photoshop / UXP、React UI 和应用侧薄桥接。
- 任何 UXP / Photoshop IO 都必须留在 `host` 或 adapter 边界。
- `shared commands` 必须保持极薄，不直接做网络或文件 IO。

当前代码中已经存在局部存储抽象：

```ts
interface ConfigStorageAdapter {
  get(providerId: string): Promise<ProviderConfig | undefined>;
  save(providerId: string, config: ProviderConfig): Promise<void>;
}
```

该接口目前用于 provider config 持久化注入，默认 in-memory 实现，未来 CLI / UXP UI 可以注入具体实现。它证明项目已经倾向于 adapter-first 的持久化方向，但还不足以覆盖完整存储框架。

当前 `Asset` 类型也保持 host-agnostic：

```ts
interface Asset {
  readonly type: 'image';
  readonly name?: string;
  readonly url?: string;
  readonly data?: string | Uint8Array;
  readonly mimeType?: string;
}
```

`Asset` 的二进制表示由 adapter 边界决定，`core-engine` 将其视为 opaque。这为后续图片缓存、UXP 文件落盘、Photoshop writeback 解耦预留了空间。

## 3. Goals

本设计的目标是：

1. 定义项目级存储分类和生命周期。
2. 支持 provider config、app settings 等轻量配置持久化。
3. 将 secret 与普通 config 分离，避免 API key 等敏感信息进入普通 JSON、日志、job input 或 provider descriptor。
4. 支持图片资源、缩略图、中间文件等大体积 asset cache。
5. 以 Photoshop UXP 作为首个正式 host 实现目标。
6. 保持 storage contract adapter-first，避免将 UXP 类型泄漏到 shared commands、runtime、providers 或 workflows。
7. 保持 `core-engine` host-agnostic。
8. 保持 `shared commands` 不直接 IO。
9. 为未来 CLI、测试环境、MCP surface 或其他 host 预留 adapter 扩展点。
10. 为后续实现阶段提供目录落点和边界约束。

## 4. Non-Goals

当前设计阶段明确不做：

1. 不实现任何源码。
2. 不创建 `packages/storage`。
3. 不初始化 `app/src/shared/storage/` 或 `app/src/host/uxp/storage/` 源码目录。
4. 不持久化 `core-engine` 的 in-memory job store。
5. 不引入 durable queue、后台恢复、多任务队列或 job history database。
6. 不实现 Photoshop writeback、layer insertion、mask、selection-aware edits。
7. 不将 provider output 直接绑定为 Photoshop layer。
8. 不把 UXP storage API 暴露给 `packages/*`。
9. 不把图片二进制长期塞进 config JSON。
10. 不把 secret 与普通 provider config 混存。

## 5. Storage Classes

项目中的存储对象应分为五类，而不是使用一个统一的大 storage。

### 5.1 Settings / Config

用途：

- provider baseURL
- default model
- timeout
- provider 非敏感参数
- app settings
- UI preferences
- feature flags
- 最近使用的非敏感选项

特点：

- 小型 JSON。
- 必须持久化。
- 需要 schema version。
- 需要 migration 策略。
- 可以被导出或备份，但导出前必须剔除 secret 引用或明确标记。
- 不适合保存大图或二进制资源。

### 5.2 Secrets

用途：

- API key
- access token
- refresh token
- vendor secret
- 用户授权凭据

特点：

- 必须持久化。
- 必须与普通 config 分离。
- 不应出现在日志、错误信息、job input、provider descriptor、cache index 或导出配置中。
- 不应保存在普通明文 JSON 中。
- provider config 中只保存 secret reference，例如 `apiKeyRef`。

推荐形态：

```json
{
  "baseURL": "https://api.example.com",
  "defaultModel": "gpt-image-1",
  "timeoutMs": 60000,
  "apiKeyRef": "secret:provider.openai-compatible.apiKey"
}
```

### 5.3 Asset Cache

用途：

- provider 返回图片。
- 用户输入图。
- mask 图。
- 中间处理图。
- 缩略图。
- Photoshop writeback 前的临时资源。

特点：

- 体积大。
- 写入频繁。
- 可清理。
- 需要 cache index。
- 需要 TTL / LRU / quota 策略。
- 需要二进制 IO。
- 不应长期保存在内存 job store 中。
- 不应直接写入 provider config JSON。

### 5.4 Temporary Objects

用途：

- 单次操作中间文件。
- 上传前转换文件。
- 下载后尚未 materialize 的文件。
- Photoshop host action 的临时桥接资源。

特点：

- 生命周期短。
- 可以在操作结束后清理。
- 可以在下次启动时清理。
- 不应作为用户可见历史。

### 5.5 Future History

用途：

- 生成历史。
- 用户收藏。
- 批量任务记录。
- 可复现生成参数。

特点：

- 当前阶段不实现。
- 不应混入 `core-engine` job store。
- 未来应作为独立 repository 设计。

## 6. Architecture

推荐采用四层结构：

```text
Surface
  - UXP UI
  - future CLI
  - future MCP / automation
      ↓
Shared Commands
  - submitJob
  - getJob
  - getProviderConfig
  - saveProviderConfig
  - future asset commands
      ↓
Storage Service / Repository Layer
  - ProviderConfigRepository
  - AppSettingsRepository
  - SecretResolver
  - AssetRepository
  - CachePolicyService
      ↓
Storage Adapters
  - UXP key-value storage adapter
  - UXP secret storage adapter
  - UXP object storage adapter
  - Node file storage adapter
  - Memory storage adapter
```

设计原则：

1. `Surface` 只调用 commands 或明确的 app shared API。
2. `shared commands` 只做用例级编排和统一返回结构，不直接访问 UXP / DOM / filesystem。
3. repository 层表达业务语义，例如 provider config、asset cache、cache cleanup。
4. adapter 层负责具体 IO。
5. UXP、Node、memory 是不同 host implementation。
6. `packages/core-engine`、`packages/providers`、`packages/workflows` 不依赖 storage implementation。

## 7. Adapter Contract Direction

以下接口是设计方向，不代表当前立即落地的最终代码。

### 7.1 KeyValueStorageAdapter

用于 settings、config、cache index 等文本数据。

```ts
interface KeyValueStorageAdapter {
  getText(key: string): Promise<string | undefined>;
  setText(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

设计理由：

- adapter 只负责 IO。
- JSON parse/stringify、schema validation、migration 应在 repository 层。
- text contract 比 generic JSON 更容易适配加密、压缩、checksum 和 host 差异。

### 7.2 SecretStorageAdapter

用于敏感信息持久化。

```ts
interface SecretStorageAdapter {
  getSecret(key: string): Promise<string | undefined>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
}
```

约束：

- 不提供默认 `listSecrets()`。
- 不在错误信息中包含 secret value。
- 不将 secret 写入日志。
- 不将 secret 暴露给 UI state，除非用户正在输入或显式查看。

### 7.3 ObjectStorageAdapter

用于图片、缩略图、中间文件等二进制对象。

```ts
interface ObjectRef {
  readonly id: string;
  readonly uri: string;
  readonly storage: 'cache' | 'persistent' | 'temp' | 'external';
  readonly mimeType?: string;
  readonly name?: string;
  readonly size?: number;
}

interface ObjectStorageAdapter {
  putObject(input: {
    namespace: string;
    name: string;
    data: Uint8Array | ArrayBuffer;
    mimeType?: string;
  }): Promise<ObjectRef>;

  getObject(ref: ObjectRef): Promise<{
    data: Uint8Array | ArrayBuffer;
    mimeType?: string;
  }>;

  deleteObject(ref: ObjectRef): Promise<void>;
}
```

`uri` 应是 adapter 可解析的 opaque URI，不应暴露 UXP `File` object，例如：

```text
uxp-cache://images/job-123/output-1.png
node-cache://images/job-123/output-1.png
memory://asset/abc
remote://https/example
```

### 7.4 AssetRepository

在 object storage 上表达 asset 业务语义。

```ts
interface StoredAssetRef {
  readonly id: string;
  readonly kind: 'asset-ref';
  readonly storage: 'cache' | 'persistent' | 'temp' | 'external';
  readonly uri: string;
  readonly mimeType?: string;
  readonly name?: string;
  readonly size?: number;
  readonly createdAt: string;
  readonly metadata?: Record<string, unknown>;
}

interface AssetRepository {
  saveGeneratedAsset(input: SaveGeneratedAssetInput): Promise<StoredAssetRef>;
  resolveAsset(ref: StoredAssetRef): Promise<AssetPayload>;
  markAccessed(ref: StoredAssetRef): Promise<void>;
  pinAsset(ref: StoredAssetRef): Promise<void>;
  deleteAsset(ref: StoredAssetRef): Promise<void>;
  cleanup(policy: CachePolicy): Promise<CleanupResult>;
}
```

`AssetRepository` 不属于 provider，也不属于 core-engine。它应位于 app shared / storage service 层，底层通过 host adapter 完成 IO。

## 8. UXP Implementation Strategy

Photoshop UXP is the first verified host implementation target. The detailed host-specific strategy has been split into a dedicated document:

- [UXP Storage Strategy](storage/UXP_STORAGE_STRATEGY.md)

Project-level decisions derived from UXP verification:

1. Storage adapter contracts must not expose UXP `File`, `Folder`, `Entry`, or token objects.
2. `localFileSystem.getDataFolder()` is the default persistent backend for app-owned config, cache index, and plugin-private data.
3. `localFileSystem.getTemporaryFolder()` is only for recoverable intermediate files and must not hold required business state.
4. `localFileSystem.getPluginFolder()` is read-only and only for bundled static assets.
5. External files require picker or token-based access; persistent tokens may fail and require fallback UX.
6. Secrets should use UXP `secureStorage`, while still handling secret loss and re-entry flows.
7. Binary image pipelines should normalize to `ArrayBuffer`; base64 is only a preview fallback, not a persistence format.
8. Photoshop writeback requires a host adapter that resolves file entries, creates session tokens, and runs document mutations inside `executeAsModal`.
9. Manifest `requiredPermissions.localFileSystem` and `requiredPermissions.network.domains` are part of storage/network architecture, not only packaging details.

## 9. Provider Storage and Discovery Lifecycle

### 9.1 Current Baseline

当前代码已有 `ConfigStorageAdapter`，并通过 `setConfigAdapter(adapter)` 注入具体实现。默认 in-memory adapter 便于测试。旧模型以 `providerId -> ProviderConfig` 为中心，适合单一 provider implementation 的 bootstrap，但会混淆三类概念：

1. provider implementation/family：应用编译期注册的能力实现，例如 `mock` 或 `openai-compatible`。
2. provider profile：用户保存的 provider instance，例如同一个 `openai-compatible` family 下的不同 endpoint、账号或默认 model。
3. runtime config：一次 dispatch 中供 `provider.validateConfig()` 与 `provider.invoke()` 使用的 secret-bearing 配置。

### 9.2 Implementation Discovery vs Profile Discovery

Provider discovery 分为两层：

| 层级 | 回答的问题 | 数据来源 | 是否持久化 | 是否包含 secret |
|------|------------|----------|------------|-----------------|
| Provider implementation discovery | 程序支持哪些 provider family / implementation？ | `packages/providers` 编译期 registry | 否 | 否 |
| Provider profile discovery | 用户配置了哪些可用 provider profiles？ | 注入的 `ProviderProfileRepository` | 是 | 否，只保存 secret refs |

`ProviderRegistry` 继续负责 implementation discovery。它不读取用户配置、不解析 secret、不访问 CLI / UXP storage。

`ProviderProfileRepository` 负责 profile discovery。UI、CLI 或 automation 需要展示“已配置 provider instance”时，应优先使用 profile lifecycle commands，而不是从 implementation descriptor 推导配置状态。

### 9.3 Provider Profile Persisted Schema

Provider profile 是持久化形态，必须与 provider implementation id 区分：

```ts
interface ProviderProfile {
  readonly profileId: string;
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

`ProviderProfile.config` 是非敏感、family-specific JSON object，可以保存 `baseURL`、`defaultModel`、`timeoutMs`、`extraHeaders`、`capabilityHints` 等非 secret 字段。它 MUST NOT 保存 `apiKey`、`accessToken`、`refreshToken` 或其他 secret value。

旧 `ProviderConfig.apiKey` 迁移到 profile 时必须拆成：

```text
ProviderProfile.secretRefs.apiKey -> "secret:provider-profile:<profileId>:apiKey"
SecretStorageAdapter.setSecret(ref, apiKey)
```

普通 JSON profile 文件中只允许出现 secret reference，不允许出现 secret value。profile list / get / delete / test commands 也不得返回 secret value。

### 9.4 Resolved Runtime Config Shape

Resolved runtime config 是一次 validation、test 或 invocation 的临时形态：

```ts
interface ResolvedProviderConfig {
  readonly profileId: string;
  readonly family: ProviderFamily;
  readonly providerConfig: ProviderConfig;
}
```

`ProviderConfigResolver.resolve(profileId)` 负责：

1. 从 repository 读取 profile。
2. 通过 `secretRefs` 从 `SecretStorageAdapter` 解析所需 secret。
3. 找到对应 family / implementation 的 provider。
4. 合并非敏感 config 与 secret value，构造 provider implementation 当前需要的 `ProviderConfig`。
5. 调用 `provider.validateConfig()`，返回已校验 config。

Resolved config 可以在一次 dispatch 的内存栈中短暂存在，但不得写入 descriptor、job input、lifecycle events、command results、普通 config JSON 或长期 adapter state。

### 9.5 Provider Profile Lifecycle

```text
saveProviderProfile(input)
  ↓
split non-secret config and secret inputs
  ↓
write required secrets through SecretStorageAdapter
  ↓
resolve runtime config for validation
  ↓
provider.validateConfig(resolved providerConfig)
  ↓
save ProviderProfile through ProviderProfileRepository
  ↓
return sanitized profile / summary without secret values
```

失败补偿规则：

- secret 写入失败：不得保存引用缺失 secret 的 profile。
- provider validation 失败：不得保存新 profile；本次写入的 secret 应删除或变为不可达。
- profile repository save 失败：命令返回失败，并尝试删除本次新写入且未被有效 profile 引用的 secrets。
- delete profile 默认删除该 profile 直接引用的 associated secrets；只有显式 `retain-secrets` 时才保留。

### 9.6 Dispatch-time Config Resolution

```text
workflow input
  provider: <implementation id or profile target>
  providerProfileId/profileId: <profile id>
      ↓
core-engine dispatcher
      ↓
profile-aware dispatch adapter
      ↓
ProviderConfigResolver.resolve(profileId)
      ↓
provider.validateRequest(request)
      ↓
provider.invoke({ config: resolved.providerConfig, request, signal })
```

dispatch path 必须区分 provider implementation id 与 provider profile id。同一个 `openai-compatible` implementation 可以对应多个 profile；当 workflow 显式传入 profile id 时，运行时必须按该 profile 解析 config，而不是按 implementation id 复用某个静态 adapter config。

本项目选择在 `packages/shared-commands` runtime assembly 中提供 setter-style 注入点（与 `setConfigAdapter` 一致）：`setProviderProfileRepository`、`setSecretStorageAdapter`、`setProviderConfigResolver`。这样可以保持 `packages/core-engine` host-agnostic，也不破坏既有静态 provider dispatch adapter 注入路径。静态 adapter 路径继续用于现有 `mock` / legacy 调用；profile-targeted dispatch 是 additive 能力。

选择 setter-style injection 的原因：

- 与既有 `setConfigAdapter` pattern 一致，CLI 与 UXP surface 可以在 bootstrap 阶段注入各自 adapter。
- 不要求 `packages/core-engine` 理解 provider profile、secret storage 或 host storage 语义。
- 不把 Node `fs/path/os`、UXP `secureStorage`、UXP `File/Folder/Entry` 或 Photoshop object 泄漏到 shared contracts。
- 可保持旧静态 dispatch adapter 兼容；profile-targeted dispatch 通过 provider id `profile` 作为 additive adapter 接入。

当前默认 `ProviderConfigResolver` 明确不实现 caching：每次 `resolve(profileId)` 都读取 repository 与 secret storage，并立即调用 provider implementation 的 `validateConfig()`。这样 save/delete 后无需额外 invalidation 机制，也避免 secret value 被长期缓存。未来若增加 caching，只能缓存非敏感 profile metadata，并且 `saveProviderProfile` / `deleteProviderProfile` 必须在下一次成功 `resolve(profileId)` 前失效对应 profile cache entry；secret value 不应作为长期缓存内容。

### 9.7 Cross-surface Storage Strategy

CLI 与 Photoshop UXP 的默认存储不是同一 backing store：

| Surface | 默认普通 profile store | 默认 secret store | 自动共享 |
|---------|------------------------|-------------------|----------|
| CLI | `~/.imagen-ps/config.json` 或后续 versioned profile file | Node-only adapter（当前可为文件内兼容迁移，后续可接 OS secret store） | 否 |
| Photoshop UXP | `localFileSystem.getDataFolder()` 下的 app-owned JSON | UXP `secureStorage` | 否 |
| Shared backing store | 显式注入的 shared repository adapter | 显式注入的 secret adapter | 仅在双方配置为同一 backing store 时成立 |

因此，“CLI 保存 provider 后 Photoshop UXP 自动发现”不能作为默认承诺。只有在 CLI 与 UXP 显式注入同一个 profile backing store，或实现 import/export / migration flow 后，profile 才能跨 surface 可见。

如果共享来源是外部文件或目录，Photoshop UXP adapter 必须通过 picker 或 persistent token 获得授权；persistent token 可能失效，必须提供重新选择或重新导入的 fallback UX。

### 9.8 UXP Adapter Scope

与 `docs/storage/UXP_STORAGE_STRATEGY.md` 对齐：

- provider profile JSON 属于 app-owned config，Photoshop UXP 默认应保存在 `localFileSystem.getDataFolder()` 下。
- provider secrets 默认应保存在 UXP `secureStorage` 中；`secureStorage` 丢失或读取失败时，应进入重新输入流程，不回退到普通 JSON secret storage。
- `localFileSystem.getTemporaryFolder()` 只用于可恢复中间文件，不保存必须持久化的 provider profile 或 secret。
- shared contracts 不暴露 UXP `File`、`Folder`、`Entry`、session token、persistent token、Photoshop object、DOM 或 Node `fs/path/os` 类型。
- UXP-specific repository / secret adapter 放在 `apps/app` 或 app-local storage service/adapter layer，不放入 `packages/providers`、`packages/core-engine`、`packages/workflows` 或 shared command contracts。

### 9.9 OpenSpec Change Scope

`openspec/changes/provider-storage-discovery-foundation/specs/` 是当前变更实施时的 delta specification 来源。实现完成后，归档流程会将这些 delta specs 合并到 `openspec/specs/` 主线规格中。在归档前，如主线规格与本变更 delta 存在差异，应以本 change 下的 specs 作为本轮实施依据，并在归档时解决冲突。

## 10. Asset Lifecycle

推荐生命周期：

```text
1. User selects input image or enters prompt
2. Workflow submits job
3. Provider returns Asset[]
4. Asset materializer decides whether to persist/cache
5. AssetRepository stores binary via ObjectStorageAdapter
6. Cache index records metadata
7. UI previews via StoredAssetRef
8. Photoshop writeback adapter consumes StoredAssetRef
9. Cache cleanup removes expired unpinned assets
```

约束：

- provider 不直接写 cache。
- runtime 不直接写 cache。
- workflows 不直接写 cache。
- Photoshop writeback 不等于 provider output。
- cache asset 可以被清理，pinned 或 persistent asset 不应被自动清理。

## 11. Cache Policy

默认策略建议：

```text
maxSize: 2GB
maxAge: 30 days
thumbnailMaxAge: 90 days
tempClearOnStartup: true
evict: LRU
pinned: never delete automatically
```

实现阶段需要支持：

- 启动时轻量检查。
- 写入前容量检查。
- 写入失败时降级提示。
- 用户手动清理入口。
- cache size 展示。
- cache index 损坏时的恢复策略。

## 12. Directory Placement Decision

本文档落盘在：

```text
docs/STORAGE_DESIGN.md
```

原因：

1. 存储设计是 project-level architecture，不是 `app/` 局部实现。
2. 它约束 `app/`、`shared commands`、`packages/*`、UXP adapter、未来 CLI adapter。
3. 根级 `docs/` 已经承载跨模块设计文档，例如 `CROSS_MODULE.md`、`STABILITY.md`、`BUILD_SYSTEM.md`。
4. `archive/` 表示历史资料，不适合承载新的 canonical 设计。
5. `openspec/changes/` 表示变更流程 artifact，不适合作为当前探索阶段的长期入口。

当前不初始化源码目录：

```text
app/src/shared/storage/
app/src/host/uxp/storage/
packages/storage/
```

原因：

- 当前仍处于架构设计阶段，不是实现阶段。
- 过早创建源码目录会把设计锁死。
- `packages/storage` 可能是过度抽象，需等待 UXP、CLI、测试复用边界进一步确认。
- `app/src/host/uxp/storage/` 会让项目语义过早偏向 UXP-only，而当前目标是 adapter-first, UXP-optimized。

未来如果文档膨胀，可拆分为：

```text
docs/storage/
  README.md
  config-storage.md
  secret-storage.md
  asset-cache.md
  uxp-storage-adapter.md
  migration.md
```

未来源码目录建议在实现阶段创建：

```text
app/src/shared/storage/
  types.ts
  provider-config-repository.ts
  app-settings-repository.ts
  asset-repository.ts
  cache-policy.ts
  migration.ts
  index.ts

app/src/host/uxp/storage/
  uxp-key-value-storage-adapter.ts
  uxp-secret-storage-adapter.ts
  uxp-object-storage-adapter.ts
  uxp-cache-index-adapter.ts
  index.ts
```

如果 CLI 独立成立，再考虑：

```text
apps/cli/src/storage/
```

或：

```text
app/src/host/node/storage/
```

## 13. Risks

### 13.1 UXP API Capability Risk

UXP storage 主能力已通过官方文档核验，但仍存在版本差异和宿主 enablement 风险，尤其是 `ImageBlob`、manifest v5 细节、UXP `fs` 与 persistent file storage 在大文件场景下的性能差异。

缓解：

- contract 不暴露 UXP 类型。
- 首个实现先做最小 adapter。
- 对 `ImageBlob` / object URL preview 提供 base64 fallback。
- 实现前用当前目标 Photoshop 版本做 smoke test。

### 13.2 Binary Memory Pressure

大图如果长期以内联 base64 或 Uint8Array 在 UI/runtime 中流转，会造成内存压力。

缓解：

- provider output 尽快 materialize 到 object storage。
- UI 使用 preview ref。
- cache index 保存 metadata，不保存二进制。

### 13.3 Secret Leakage and Secret Loss

API key 如果进入 provider config JSON、job input、日志或错误信息，会造成泄漏风险。同时，UXP `secureStorage` 虽然提供加密存储，但官方语义更接近安全缓存，存在系统凭据损坏、软件重装或用户环境变化导致 secret 丢失的风险。

缓解：

- secret 与 config 分离。
- provider config 保存 `apiKeyRef` / `secretRef`。
- UXP `SecretStorageAdapter` 默认使用 `secureStorage`。
- `getSecret()` 失败或返回空时，引导用户重新输入。
- error sanitizer 移除敏感字段。
- 不将 secret 作为唯一不可恢复业务数据。

### 13.4 Cache Index Corruption

cache index 可能因写入中断或版本迁移失败损坏。

缓解：

- index 写入使用临时文件 + 原子替换策略。
- index 带 schemaVersion。
- 提供 scan-and-rebuild 能力。

### 13.5 Over-Abstraction

过早创建 `packages/storage` 可能导致 host-specific 需求被错误抽象。

缓解：

- 当前只落项目级设计文档。
- 实现阶段先在 `app/src/shared/storage` + `app/src/host/uxp/storage` 验证。
- 只有跨 host 复用价值明确后再抽包。

## 14. Open Questions

1. 当前目标 Photoshop / UXP 版本对 `ImageBlob`、object URL、fs URL preview 的兼容性如何？
2. UXP `File` API 与 UXP `fs` 模块在大图片、批量图片场景下性能差异如何？
3. provider config 保存后，当前 runtime adapter 应重建，还是改为 dispatch-time config resolver？
4. `Asset.url` 是否足够承载 opaque URI，还是需要扩展 `StoredAssetRef`？
5. cache 默认 quota 应按固定大小、磁盘比例，还是用户可配置？
6. cache index 是否需要记录 prompt、provider、model 等可检索 metadata？
7. generated asset 被写回 Photoshop 后，cache asset 是否自动 pin？
8. 用户显式保存的 asset 应落在 UXP data folder，还是要求用户选择外部目录？
9. provider API key 是否允许多个 profile？
10. provider `baseURL` 可配置与 manifest `network.domains` 静态 allowlist 如何协调？
11. CLI adapter 是否会成为正式 surface，还是只用于开发验证？

## 15. Recommended Next Steps

1. 用当前目标 Photoshop / UXP 版本做最小 smoke test：data folder 写 JSON、secureStorage 写 secret、binary file 写入/读取、ImageBlob preview、session token writeback。
2. 决定 provider config 使用短期静态注入，还是中期 dispatch-time config resolver。
3. 决定 `Asset.url` opaque URI 是否足够，或是否需要新增 `StoredAssetRef` 类型。
4. 设计 manifest `requiredPermissions.localFileSystem` 的最小权限策略。
5. 设计 manifest `requiredPermissions.network.domains` 与 provider `baseURL` 配置的协调方式。
6. 在设计确认后，再初始化 `app/src/shared/storage/` 与 `app/src/host/uxp/storage/`。
7. 如文档继续扩展，再拆分为 `docs/storage/` 文档组。
