# app 状态

- 状态：UXP-loadable shell、React mount、AppServices seam、command-backed MainPage、profile-backed Settings 与基础 app tests 已落地
- 更新时间：2026-06-16
- 模块边界：见 [SPEC.md](SPEC.md)

## 当前已存在

### Package / Entry

- `package.json`：`build` 先跑 `tsc --noEmit --project tsconfig.build.json`，再跑 `vite build`；`dev` 为 `vite build --watch`。
- `index.html`：UXP panel HTML entry，包含 `#root`。
- `public/manifest.json`：Manifest v5，`main: "index.html"`，panel entrypoint，声明 network/localFileSystem permission。
- `vite.config.ts`：`base: './'`，build 输出到 `dist/`，copy manifest。
- `src/index.tsx`：创建 `pluginHost`，在 DOM 存在时 `createRoot(root).render(<AppShell host={pluginHost} />)`。

### AppServices seam

`src/app-services/` 已实现薄 seam：

| 文件 | 作用 |
|---|---|
| `app-services.ts` | `AppServices = { commands, host }` |
| `commands-port.ts` | 镜像 application/session 层公开命令 |
| `host-bridge.ts` | UI 可依赖的 host-agnostic Photoshop / UXP IO 契约与 non-UXP stub |
| `app-services-context.tsx` | React Context 注入 |
| `mappers.ts` | job / asset / profile -> UI view model mapper |

`src/host/create-plugin-host-shell.ts` 是 composition root：

- 解析 UXP modules。
- 注入 `ProviderProfileRepository` 与 `SecretStorageAdapter`。
- 组装 `services.commands` 与 `services.host`。
- 非 UXP 环境使用 in-memory storage / host stub，便于 build/test。

### UI

`src/ui/` 已有 5 个 React 页面，并已接入 services：

| 文件 | 页面 | 当前状态 |
|---|---|---|
| `app-shell.tsx` | UI shell / 本地 view 切换 | 已接 `AppServicesProvider`、profiles、models、layers、conversation |
| `hooks/use-conversation.ts` | 主生成/编辑状态 | 通过 app-local session binding 提交 command flow 并映射 session snapshot |
| `hooks/use-provider-settings.ts` | provider/profile/model 状态 | 通过 profile/model commands 读取、保存、测试、刷新 |
| `pages/main-page.tsx` | 主生成页 | profile/model 选择、layer/file attachment、generate/edit、preview、Photoshop writeback |
| `pages/history-page.tsx` | 历史页 | 读取 application durable history，保留 running session rounds 热视图 |
| `pages/settings-page.tsx` | Provider 列表 | `listProviderProfiles()` |
| `pages/settings-add-page.tsx` | 添加 Provider | `listProviders()` + `saveProviderProfile()` + write-only `secretValues` |
| `pages/settings-detail-page.tsx` | Provider 详情 | `get/save/delete/testProviderProfile()` + `list/refreshProfileModels()` |

### Host

`src/host/` 已实现：

- `uxp-api.ts`：封装 UXP `require('photoshop')` / `require('uxp')` 解析。
- `uxp-provider-profile-repository.ts`：UXP data folder JSON profile repository，非 UXP 时使用 in-memory。
- `uxp-job-history-adapter.ts`：UXP data folder JSON job history + opaque asset refs，非 UXP 时使用 in-memory。
- `uxp-secret-storage-adapter.ts`：UXP secureStorage secret adapter，非 UXP 时使用 in-memory。
- `photoshop-host-bridge.ts`：
  - `listLayers()`
  - `pickImageFile()`
  - `readLayerAsAsset()`
  - `readLayerMaskAsAsset()`
  - `placeAssetOnCanvas()` via `executeAsModal` + `batchPlay(placeEvent)`

## Application/session 当前可用入口

UI 只能通过 `@imagen-ps/application` application/session 层访问业务逻辑。

当前命令面：

- `submitJob`
- `getJob`
- `subscribeJobEvents`
- `retryJob`
- `listJobHistoryRecords`
- `listProviders`
- `describeProvider`
- `listProviderProfiles`
- `getProviderProfile`
- `saveProviderProfile`
- `deleteProviderProfile`
- `testProviderProfile`
- `listProfileModels`
- `refreshProfileModels`

Adapter injection：

- `setProviderProfileRepository`
- `setSecretStorageAdapter`
- `setJobHistoryStore`
- `setAssetStore`
- `setProviderConfigResolver`

当前不要在 app 文档或实现中引用不存在的 `getProviderConfig` / `saveProviderConfig` / `ConfigStorageAdapter` / `setProfileDefaultModel` / `setProfileEnabled`。

## 当前限制

| 功能 | 当前状态 | 下一步 |
|---|---|---|
| UXP 加载 | manifest / HTML / Vite build 已有，未记录真实 Photoshop 加载证据 | 用 UXP Developer Tool 加载 `dist/` 并记录结果 |
| React 挂载 | `index.tsx` 已挂载 `AppShell` | 在 Photoshop panel 内确认渲染和 console |
| 主生成流 | 已接 application session controller + `submitJob` / `retryJob` | 用真实 profile 在 UXP 内验证 |
| Provider 设置 | 已接 profile/model commands 和 UXP adapters | 验证 data folder / secureStorage 持久化 |
| 图层读取 | 已接 `HostBridge.listLayers()` / `readLayerAsAsset()` | 在真实文档中验证 layer tree、pixel read、dispose |
| 文件输入 | 已接 `pickImageFile()` | 验证 UXP file permission 与 mime 推断 |
| Photoshop 写回 | 已接 `placeAssetOnCanvas()` | 实测并校准 `batchPlay(placeEvent)` descriptor |
| Mask | 有 `readLayerMaskAsAsset()` 基础接口 | mask PNG/grayscale pipeline 尚未完整验证 |
| History | 已接 shared durable history + UXP data-folder adapter | 在真实 UXP data folder 中验证 record / asset ref 持久化 |
| 测试 | 有 app shell、conversation、settings-add tests | 补真实 UXP host 验证与更多 component path |

## UXP-first 开发口径

`apps/app` 当前仍以 Photoshop 内 UXP 调试为主路径：

1. `pnpm --filter @imagen-ps/app build` 产出 `apps/app/dist/`。
2. 用 UXP Developer Tool Load `dist/manifest.json`。
3. 在 Photoshop 中验证 panel、profile、job、host IO。
4. 开发期可用 `pnpm --filter @imagen-ps/app dev` watch build，UXP Developer Tool 监听产物 reload。

核心约束：

- UXP 是 host-embedded pseudo-browser，不是完整浏览器。
- Manifest v5 需要 `main: "index.html"`、`entrypoints` 和显式权限。
- 网络和文件能力需通过 `requiredPermissions` 声明。
- UXP WebView 不作为主 panel 路径。
- Photoshop 文档修改必须包裹在 `executeAsModal` 中。

## 验证状态

已在代码侧具备的验证：

- `apps/app/tests/app-shell.test.tsx`
- `apps/app/tests/use-conversation.test.tsx`
- `apps/app/tests/settings-add-page.test.tsx`
- `pnpm --filter @imagen-ps/app build`
- `pnpm --filter @imagen-ps/app test`

仍需补充的验证：

- Photoshop + UXP Developer Tool 加载 `dist/manifest.json`。
- Panel render、profile save/test、model refresh。
- layer list/read、file pick、submit job、place asset。
- manifest network permission 与 provider base URL 策略。

## 不变量

- UI 层只能通过 application/session 层与 runtime 交互。
- `apps/app` 不直接 import runtime/store/dispatcher/provider registry。
- Photoshop / UXP IO 只能在 `src/host/` 或 injected adapter 边界。
- 不引入状态库、重 VM 层或并行产品面。
