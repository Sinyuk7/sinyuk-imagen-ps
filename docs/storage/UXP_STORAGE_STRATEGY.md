# UXP Storage Strategy

Photoshop UXP 是首个正式 host target，但不应污染项目级 contract。本节基于 Adobe 官方 UXP / Photoshop 文档核验结果更新，不再仅作为设计假设。

## 0 Capability Verification Summary

已核验资料来源：

1. `require('uxp').storage.localFileSystem` — Adobe Photoshop UXP API: `FileSystemProvider`。
2. UXP Persistent File Storage — Adobe Photoshop UXP API: `File` / `Folder` / `Entry`。
3. `require('uxp').storage.secureStorage` — Adobe Photoshop UXP API: `SecureStorage`。
4. UXP Manifest v5 — Adobe Photoshop UXP guide。
5. UXP `fs` / `ImageBlob` — Adobe Photoshop UXP API。
6. Photoshop BatchPlay / modal execution docs。

核验结论：

- `localFileSystem` 是 Photoshop UXP 中访问插件私有目录、临时目录、插件目录、用户选择文件/目录和 token entry 的核心入口。
- `getDataFolder()` 可作为插件私有持久化目录，适合配置、cache index、插件数据库和可清理缓存。
- `getTemporaryFolder()` 只能作为非持久临时目录；其清理时机应按 host / OS 不可控处理，不能承载业务持久化。
- `getPluginFolder()` 指向 plugin bundle，严格只读，只能放静态资源。
- 外部文件系统访问应通过 picker 或 token；persistent token 跨 session 但可能失效，必须设计 fallback。
- `nativePath` 可获得，但不应作为持久引用或权限模型绕行方案。
- UXP 支持 `secureStorage`，但官方语义更接近安全缓存，而不是绝对可靠的业务持久层。
- manifest v5 下需要显式声明 `requiredPermissions.localFileSystem` 和 `requiredPermissions.network.domains`。
- binary image pipeline 推荐使用 `ArrayBuffer` / binary format；preview 可使用 `ImageBlob` / object URL、fs URL 或 base64，其中跨版本兼容性需要实测。
- Photoshop 文档写回必须在 `executeAsModal` 中执行，置入文件类操作通常需要 session token，而不是 native path。

## 1 UXP Data Folder

UXP `localFileSystem.getDataFolder()` 适合作为插件私有持久化根目录。除非用户卸载插件或宿主清理插件数据，它应跨 session、跨版本升级保留。

推荐布局：

```text
data/
  settings/
    app-settings.v1.json
    provider-configs.v1.json
  cache/
    index.v1.json
    images/
      2026-04/
        job-id/
          output-1.png
          output-2.png
    thumbs/
      asset-id.webp
  persistent/
    pinned-assets/
  temp-recovery/
```

设计决策：

- data folder 是本插件的主持久化目录。
- provider config、app settings、cache index 应默认放在 data folder。
- cache 可以位于 data folder，但必须通过 cache index 标记为可清理。
- 用户显式 pin / 收藏的 asset 应与普通 cache 区分，可放入 `persistent/` 或在 index 中标记 `pinned: true`。
- data folder 不等于用户资产库；用户长期导出、跨应用管理的图片仍应通过 picker 保存到外部目录。

## 2 UXP Temporary Folder

UXP `localFileSystem.getTemporaryFolder()` 适合保存非持久中间文件。

适合：

- 单次生成过程中的中间文件。
- 上传前转换文件。
- 下载后尚未 materialize 的文件。
- Photoshop writeback 前的过渡文件。

策略：

- 不在 temp folder 中保存任何业务必须恢复的数据。
- temp 文件 URI 不写入长期 config。
- 操作结束后尽量清理。
- 应用启动时可清理遗留 temp 文件。
- 任何 temp entry 丢失都应被视为可恢复错误。

## 3 UXP Plugin Folder

UXP `localFileSystem.getPluginFolder()` 指向 plugin bundle。

设计决策：

- plugin folder 只读。
- 只可用于内置模板、默认静态资源、示例图片、内置 schema 等。
- 不得用于 settings、cache、secret、用户图片或运行时输出。

## 4 External File Access and Tokens

外部文件或目录访问遵循 UXP 权限模型：

- 用户通过 `getFileForOpening()`、`getFileForSaving()`、`getFolder()` 授权访问。
- `createSessionToken(entry)` 生成当前 session 可用 token，适合传给 Photoshop `batchPlay` 等 host API。
- `createPersistentToken(entry)` 生成跨 session token，可用于记住用户选择的外部目录或文件。
- `getEntryForPersistentToken(token)` 可能失败；文件移动、重命名、权限变化、OS 行为或宿主策略都可能导致 token 失效。

设计决策：

- `nativePath` 不作为持久引用。
- 外部文件引用应保存 persistent token + 用户可读 label，而不是 path。
- 每次解析 persistent token 都必须处理失败。
- token 失效时应引导用户重新选择文件或目录。
- Photoshop writeback adapter 应从 storage ref 解析出 UXP entry，再创建 session token 传给 Photoshop，而不是传 native path。

## 5 Secure Storage

Photoshop UXP 提供 `require('uxp').storage.secureStorage`。

已核验能力：

- `setItem(key, value)` 支持 `string | ArrayBuffer | TypedArray`。
- `getItem(key)` 返回 `Promise<Uint8Array>`。
- 提供 `length` 等 key-value 能力。
- 加密依赖当前 OS 用户账户能力，例如 macOS Keychain / Windows Credential Manager 一类系统凭据设施。

限制：

- Adobe 官方语义更接近安全缓存，不应视为绝对可靠的业务持久化数据库。
- 重装软件、系统凭据损坏、用户环境变化等情况可能导致数据不可恢复。
- 对同一系统用户下的提权进程不提供强威胁模型保证。

设计决策：

- `SecretStorageAdapter` 在 UXP host 中默认基于 `secureStorage` 实现。
- API key、access token、refresh token 不写入普通 JSON、cache index、job input 或日志。
- provider config 中保存 `apiKeyRef` / `secretRef`，真实 secret 放入 secure storage。
- `getSecret()` 返回空或失败时，应引导用户重新输入 secret。
- 因 secure storage 可能丢失，secret 不作为唯一不可恢复业务数据。
- 不再默认采用“data folder + 自加密”作为主方案；它只作为 secure storage 不可用时的显式降级方案，并需要 UI 风险提示。

## 6 localStorage / Key-Value Storage

UXP 支持 Web 标准 `localStorage`，并跨 session 持久化。

适合：

- 极小型 UI preference。
- 最近一次面板状态。
- 非敏感、小体积 key-value。
- 可恢复的 token registry 辅助信息。

不适合：

- 图片 base64。
- 大型业务 JSON。
- cache index 主存储。
- secret。
- binary data。

设计决策：

- 本项目不把 `localStorage` 作为主 storage backend。
- 主配置仍放 data folder JSON，并通过 repository 进行 schema version 和 migration。
- `localStorage` 只作为轻量 UI 状态或可重建索引的辅助层。

## 7 Binary Handling

图片资源应尽量落二进制文件，不应长期 inline base64 到 JSON。

已核验方向：

- UXP `File.read({ format: formats.binary })` 返回 `ArrayBuffer`。
- UXP `File.write(arrayBuffer, { format: formats.binary })` 支持二进制写入。
- `fetch(url).then(r => r.arrayBuffer())` 可直接进入 file write pipeline。
- `Uint8Array` 可作为 adapter 内部便利表示，但跨边界推荐统一为 `ArrayBuffer`。
- base64 适合预览 fallback，不适合作为持久缓存格式。
- Blob / `ImageBlob` / object URL 可用于 UI preview，但跨 host / 版本兼容性需要实测。

推荐流程：

```text
provider output asset
  ↓
normalize to ArrayBuffer
  ↓
asset materializer
  ↓
UXP object storage adapter
  ↓
cache file + cache index
  ↓
StoredAssetRef
  ↓
preview resolver: ImageBlob / fs url / base64 fallback
```

## 8 Manifest Permissions

manifest v5 下应显式声明需要的能力。

设计决策：

- 文件系统权限应声明 `requiredPermissions.localFileSystem`。
- 如果只需要 plugin/data 目录和 picker，优先使用最小权限，例如 `plugin` / `request`，避免默认申请 `fullAccess`。
- 只有明确需要任意路径访问时才考虑 `fullAccess`，并需产品侧说明风险。
- 网络请求必须声明 `requiredPermissions.network.domains`。
- provider adapter 的可配置 `baseURL` 与 manifest domain allowlist 存在天然冲突，需要后续设计 central network config 或构建期 domain 注入策略。
- UXP 新版本不应依赖过宽泛的顶级域名通配符。

## 9 Photoshop Writeback

Photoshop 文档写操作必须通过 host adapter 隔离。

设计决策：

- writeback 不属于 storage layer，也不属于 provider。
- writeback adapter 消费 `StoredAssetRef` 或 resolved UXP file entry。
- 执行写回前创建 session token。
- 修改 Photoshop 文档状态必须包裹在 `require('photoshop').core.executeAsModal` 中。
- `batchPlay` / place image 不依赖持久 native path。
