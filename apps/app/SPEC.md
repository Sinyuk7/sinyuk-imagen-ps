# app 规范

- 状态：当前阶段规范
- 依据：根级 `AGENTS.md`、`../../docs/ENGINEERING_CONTEXT.md`、`STATUS.md`

## 模块目的

作为 Photoshop / UXP surface，提供 UXP panel shell、React UI、Photoshop host IO，以及对 `@imagen-ps/application` 的薄接入。

## 稳定边界

- `app/` 属于 host / app 层。
- UI 不拥有 runtime lifecycle 或 provider 参数语义。
- UI 只能通过 `AppServices.commands` 调共享 application/session 层。
- Photoshop / UXP IO 必须留在 `src/host/` 或 injected adapter 边界。
- Provider profile、secret、durable job history 和 asset 持久化通过 host-injected adapters 注入 application/session 层。
- `apps/app` 不依赖 `apps/cli`，也不直接 import `@imagen-ps/core-engine` 或 `@imagen-ps/providers`。

## 当前公开结构

### AppServices

```ts
interface AppServices {
  readonly commands: CommandsPort;
  readonly host: HostBridge;
}
```

- `CommandsPort` 只镜像 application/session 层公开命令，不加业务语义。
- `HostBridge` 只表达 UI 需要的 host IO。
- React 页面通过 `AppServicesProvider` 获取 services。

### HostBridge

```ts
interface HostBridge {
  listLayers(): Promise<readonly LayerInfo[]>;
  pickImageFile(): Promise<Asset | undefined>;
  readLayerAsAsset(layerId: number): Promise<Asset>;
  readLayerMaskAsAsset(layerId: number): Promise<Asset | undefined>;
  placeAssetOnCanvas(asset: Asset): Promise<void>;
}
```

## 当前可确认的行为

- `src/index.tsx` 在 DOM 存在时挂载 `<AppShell host={pluginHost} />`。
- `createPluginHostShell()` 是 composition root。
- MainPage 通过 `submitJob()` 提交 `provider-generate` 或 `provider-edit`。
- 生成结果从 `job.output.image.assets` 映射为 preview。
- 有 attachment 时走 `provider-edit`；无 attachment 时走 `provider-generate`。
- History 通过 `listJobHistoryRecords()` 展示 durable job records，并保留当前 React session 内 running rounds 作为热视图。
- Settings 使用 profile/model commands，不维护独立 provider config API。
- API key 只能通过 write-only `secretValues` 输入，不作为普通 profile config 字段回显。

## 当前不应写成既成事实的内容

- 已在真实 Photoshop 中完成 UXP 加载验证。
- `batchPlay(placeEvent)` descriptor 已跨 Photoshop 版本稳定。
- History 已在真实 Photoshop/UXP 中验证持久化。
- mask/inpaint 已有完整 PNG/grayscale pipeline。
- manifest network permission 已收紧到最终域名策略。

## 当前刻意省略

- `RUNBOOK.md`
- app-local `TESTING.md`
- `examples/`
- Photoshop 操作分步手册

测试入口统一见 `../../docs/TESTING.md`。
