## Context

> 本 change 的 `specs/` 文件是 OpenSpec 增量 delta，实施时应以 `openspec/changes/provider-storage-discovery-foundation/specs/` 为当前变更的规范来源；归档时这些 delta 会合并到 `openspec/specs/` 主线规格中。

当前项目已经具备 `ConfigStorageAdapter`、`getProviderConfig`、`saveProviderConfig` 和 CLI `FileConfigAdapter` 的短期形态，但其核心模型仍是 `providerId -> ProviderConfig`。这个模型把 provider implementation、用户配置实例、secret value 和 runtime adapter 生命周期混在一起，无法自然支撑以下目标：

- 同一个 `openai-compatible` implementation 下存在多个 endpoint/account/profile。
- CLI 与 UI 通过同一 repository adapter 或显式 import/export flow 时，UI 能发现对应 provider profile；默认 CLI store 与 UXP store 不自动共享。
- API key 不进入普通 JSON config、日志、job input 或长期 runtime state。
- 保存/更新 provider 配置后，不需要重启或重建整个 runtime 才能生效。
- 后续 model resolution、generation hardening、image edit 建立在稳定的 profile/config 边界上。

现有 `docs/STORAGE_DESIGN.md` 已经定义 Settings / Config、Secrets、Asset Cache、Temporary Objects、Future History 等存储类别，并明确 `providers` 与 `core-engine` 不负责持久化实现。本设计在该文档基础上补齐 provider profile discovery 与 runtime config resolution。

## Goals / Non-Goals

**Goals:**

- 将 provider discovery 拆成两层：provider implementation discovery 与 provider profile discovery。
- 引入 `ProviderProfile` 持久化形态，作为用户配置 provider instance 的一等对象。
- 引入 `ResolvedProviderConfig` 运行时形态，用于调用 `provider.validateConfig()` 和 `provider.invoke()`。
- 引入 `ProviderProfileRepository`、`SecretStorageAdapter` / `SecretResolver`、`ProviderConfigResolver` 的边界。
- 更新 shared commands provider config 能力，使其面向 profile lifecycle，而不是单个 provider config 键值。
- 设计 runtime 使用 dispatch-time config resolution，避免启动时长期持有 secret-bearing config。
- 更新 `docs/STORAGE_DESIGN.md`，将这些边界固化为项目级存储设计。

**Non-Goals:**

- 不实现运行时动态加载外部 JS provider 插件。
- 不实现 provider marketplace、npm package scanning、插件目录扫描或外部代码执行。
- 不实现 asset cache、history database、Photoshop writeback 或 layer insertion。
- 不把 UXP storage、Node fs/path/os 或任何 host IO 下沉到 `packages/providers`、`packages/core-engine` 或 `packages/workflows`。
- 不要求 CLI 与 Photoshop UXP 默认共享同一份物理存储；UXP 默认使用 `localFileSystem.getDataFolder()`，CLI 默认使用 Node file storage，跨 surface 共享必须通过显式 shared backing store、import/export 或用户授权 token 流程实现。
- 不实现早期开发阶段遗留 `~/.imagen-ps/config.json` provider config shape 的 read-time migration；CLI profile persistence 直接采用新的 versioned provider profiles schema。

## Decisions

### Decision 1: Discovery 拆成 implementation discovery 与 profile discovery

`ProviderRegistry` 继续负责 provider implementation/factory 的注册，例如 `mock` 与 `openai-compatible`。该层回答“程序支持哪些 provider family/implementation”。短期仍采用编译期显式注册，不做动态代码加载。

新增 provider profile discovery，基于持久化 repository 读取用户配置的 provider instances。该层回答“用户配置了哪些可用 provider profiles”。UI 和 CLI 的 provider 列表应优先展示 profile，并可附带 implementation descriptor。

备选方案是把新 provider 都做成动态插件自动发现，但这会引入 UXP 沙箱、外部代码执行、安全审核、版本兼容和跨 surface 加载问题，当前阶段过重。

### Decision 2: ProviderProfile 是持久化形态，ResolvedProviderConfig 是运行时形态

持久化 profile 不保存 secret value，只保存 secret reference：

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

`ProviderProfile.config` 是非敏感、family-specific 的 JSON object：它可以保存 `baseURL`、`defaultModel`、`timeoutMs`、`extraHeaders` 等非 secret 字段，但 MUST NOT 保存 `apiKey`、`accessToken`、`refreshToken` 等 secret value。新 profile command 输入中的 `apiKey` 等 secret 字段应拆成 `secretRefs.apiKey` + secret storage value；resolver 在运行时再组装成当前 provider implementation 可校验的 `ProviderConfig`。由于当前 app 尚未发布给用户，本 change 不实现早期本地旧配置文件的自动迁移逻辑。

运行时 resolver 负责将 profile config 与 secret value 合并成 provider 可校验的 config：

```ts
interface ResolvedProviderConfig {
  readonly profileId: string;
  readonly family: ProviderFamily;
  readonly providerConfig: ProviderConfig;
}
```

这样可以避免 API key 写入普通 config JSON，也避免 `ProviderDescriptor`、job input、日志或 profile list 泄漏 secret。

### Decision 3: shared commands 面向 profile lifecycle

新增或演进命令语义：

- `listProviderProfiles()`：列出已配置 profiles，不返回 secret value。
- `getProviderProfile(profileId)`：读取单个 profile，不返回 secret value。
- `saveProviderProfile(input)`：保存 profile config，并通过 secret adapter 保存敏感字段。
- `deleteProviderProfile(profileId, options?)`：默认删除 profile 及其关联 secret；如显式传入 retain-secrets 模式，则只删除 profile 并保留 secret value。
- `testProviderProfile(profileId)`：resolve config 后执行 validation-only 或轻量 connectivity check，按失败类型返回 `CommandResult`。

现有 `getProviderConfig` / `saveProviderConfig` 在本 change 中仅保持可用以避免破坏内部调用；它们不作为新 provider discovery 的数据来源，也不驱动 CLI profile persistence。新能力的规格以 profile lifecycle 为准。

### Decision 4: Runtime 使用 dispatch-time config resolution

不再把每个 provider profile 的完整 config 在 runtime 初始化时固定进 adapter。provider dispatch 路径应在调用时解析 profile：

```text
dispatch(params)
  -> extract profileId / provider target
  -> ProviderConfigResolver.resolve(profileId)
  -> provider.validateConfig(resolved providerConfig)
  -> provider.validateRequest(request)
  -> provider.invoke({ config, request, signal })
```

`ProviderConfigResolver` 的注入点优先放在 `packages/shared-commands` runtime assembly 层：沿用 `setConfigAdapter` 的可测试注入风格，新增 `setProviderProfileRepository` / `setSecretStorageAdapter` / `setProviderConfigResolver` 等 setter，或在内部由 repository + secret storage 组装默认 resolver。`packages/core-engine` 的 `createRuntime` 仍保持 host-agnostic，不直接依赖 storage；如确需扩展 runtime adapter 创建参数，应保持现有 static adapter 注入路径兼容。

优点：

- 配置保存后可即时生效。
- secret value 不长期驻留在 runtime adapter state。
- 多 profile 和 profile 切换更自然。
- 后续 model resolution 可以基于 profile config 与 request target 工作。

代价是每次 dispatch 都需要异步读取/解析 config。当前默认 resolver 不做 caching：每次 resolve 都读取 repository 与 secret storage，并立即调用 provider implementation 的 `validateConfig()`。这样 save/delete 后不需要 cache invalidation，也避免 secret value 长期驻留。未来如实现缓存，只能缓存非敏感 profile metadata；当 profile 被保存或删除时，对应 `profileId` 的缓存项必须在下一次 resolve 返回前失效。

### Decision 5: Cross-surface storage 通过 adapter 能力表达，不假设首期自动共享

根据 `docs/storage/UXP_STORAGE_STRATEGY.md` 的核验结论，Photoshop UXP 的默认持久化后端是 `localFileSystem.getDataFolder()`，provider profile JSON 属于 app-owned config；secret 默认通过 UXP `secureStorage` 保存。CLI 默认 Node file storage 与 UXP data folder 不是同一个 backing store，因此“命令行保存 provider 后，下次 PS 启动自动生效”不能作为默认承诺。

因此 contract 以 repository/adapter 抽象表达共享能力：

- 如果 CLI 与 UXP host 显式注入同一个 backing store，CLI 保存的 profile 可以被 UI 在下次 repository read 时发现。
- 如果 CLI 使用 `~/.imagen-ps` 而 UXP 使用 plugin data folder，二者不会自动共享。
- 如果共享依赖外部文件/目录，UXP 必须通过 picker 或 persistent token 获取授权；persistent token 可能失效，必须提供重新选择或导入 fallback。
- profile schema 必须带 `schemaVersion`，为迁移、导入/导出与共享做准备。

### Decision 6: `packages/providers` 不负责 profile persistence

`packages/providers` 继续只负责 provider contract、schema validation、request build、transport、response normalization 和错误映射。它可以接收 resolved `ProviderConfig`，但不读取 profile storage，不解析 secret ref，也不关心 CLI/UXP 的存储位置。

### Decision 6.1: UXP storage adapters live in the Photoshop surface layer

UXP-specific storage implementation belongs in `apps/app` or an app-local storage service/adapter layer, because it depends on `require('uxp').storage.localFileSystem` and `require('uxp').storage.secureStorage`. The shared contracts must not expose UXP `File`, `Folder`, `Entry`, persistent token, or session token objects. A future UXP adapter should implement the shared `ProviderProfileRepository` against `getDataFolder()` and `SecretStorageAdapter` against `secureStorage`, then inject those adapters into shared commands at Photoshop app startup.

Configuration, secrets, asset materialization, and Photoshop writeback are all adapter-backed concerns; they differ only in which host API they wrap. Provider semantics stay in `packages/providers`; host persistence and host document mutation stay in surface adapters.

### Decision 7: Profile deletion defaults to deleting associated secrets

`deleteProviderProfile(profileId)` 默认采用 `delete-associated-secrets` 策略：删除 profile 的同时删除该 profile 直接引用的 secret refs，降低孤儿 secret 泄漏风险。如调用方明确需要保留 secret，可使用 `retain-secrets` 模式；该模式必须是显式 opt-in，且命令结果不得返回 secret value。

## Risks / Trade-offs

- [Risk] UXP `secureStorage` 可能因重装、系统凭据损坏或用户环境变化丢失 secret → Mitigation: `SecretStorageAdapter` 保持抽象；resolver 将缺失 secret 视为 validation/re-entry flow，UI 引导用户重新输入；普通 JSON 不作为默认 secret storage。
- [Risk] CLI 与 Photoshop UXP 无法访问同一物理存储 → Mitigation: 首期不承诺自动共享；通过 adapter 注入、import/export 或未来 shared storage adapter 实现跨 surface 共享。
- [Risk] dispatch-time resolution 增加调用延迟 → Mitigation: resolver 可缓存非敏感 profile metadata；profile save/delete 后必须使对应缓存失效；secret resolution 保持最小化。
- [Risk] 继续兼容早期本地旧 provider config 文件会增加复杂度 → Mitigation: 当前 app 尚未发布给用户，本 change 不实现旧文件 read-time migration；新 spec 以 profile lifecycle 与 versioned profiles schema 为主。旧 `getProviderConfig` / `saveProviderConfig` 仅保持内部 API 可用，不扩展语义。
- [Risk] profile schema 过早锁死 model 配置 → Mitigation: `models` 先作为可选配置，详细 model capability 由后续 `provider-model-resolution` 变更完善。
- [Risk] profile save 涉及 profile repository 与 secret storage 两步写入，可能出现 partial write → Mitigation: `saveProviderProfile` 必须定义补偿逻辑：secret 写入失败时不得留下新 profile；profile 写入失败时应清理本次新写入的 secrets 或报告可恢复错误。

## Migration Plan

1. 先更新 `docs/STORAGE_DESIGN.md`，明确 provider profile discovery、secret refs、runtime config resolution 和 cross-surface storage 策略。
2. 在 shared commands 层引入 profile repository/resolver 类型与默认 memory implementation，保持无 host IO。
3. 新增 profile lifecycle commands；旧 config commands 只保持现有行为，不提供旧本地文件迁移策略。
4. 调整 runtime/provider dispatch 装配，使其可通过 profile id 在 dispatch-time resolve config。
5. CLI adapter 使用新的 versioned provider profiles schema；不读取、不迁移早期开发阶段旧格式。
6. UXP storage adapter 在后续实现中接入同一 repository contract。
7. 实现完成并验证后，将本 change delta specs 归档合并到 `openspec/specs/` 主线规格。

## Open Questions

- CLI 与 UXP 是否能安全共享一个用户级配置目录，还是必须走 import/export？
- 旧 `getProviderConfig` / `saveProviderConfig` 是否保留为 public API，还是在 profile commands 稳定后废弃？
- provider dispatch 参数中 profile target 的字段名应为 `profileId`、`providerProfileId` 还是复用现有 provider 字段？
