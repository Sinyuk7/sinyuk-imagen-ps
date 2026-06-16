# app

`app/` 是 Photoshop / UXP panel surface。它承接 React UI、UXP packaging、Photoshop host IO，以及应用侧对共享 `@imagen-ps/application` application/session 层的薄桥接。

## 先读哪里

- `STATUS.md`：当前实现状态、限制与下一步验证
- `SPEC.md`：本模块边界与当前 contract
- `INTEGRATION_DESIGN.md`：app ↔ application/session 接入设计
- `AGENTS.md`：模块级短规则
- 根级 UI 文档（历史参考）：`../../archive/DESIGN.md`、`../../archive/TOKEN.md`、`../../archive/UI_MAIN_PAGE.md`

## 当前结构

```txt
app/
  index.html
  public/manifest.json
  src/
    app-services/
    host/
    shared/
    ui/
    index.tsx
  tests/
```

- `index.html`：UXP panel HTML entry。
- `public/manifest.json`：Manifest v5，build 时复制到 `dist/manifest.json`。
- `src/index.tsx`：plugin entry；创建 host shell 并挂载 React。
- `src/app-services/`：`CommandsPort`、`HostBridge`、React Context、mappers。
- `src/host/`：UXP / Photoshop adapters、profile repository、secret storage。
- `src/ui/`：React shell、pages、hooks、components。
- `tests/`：happy-dom app/hook/component smoke tests。

## 本模块负责什么

- Photoshop / UXP host integration。
- UXP-loadable plugin shell。
- React UI 组合与页面级状态。
- Host IO：layer list/read、file pick、mask read、place asset。
- Surface-local bridge：把 UI 接到共享 application/session 层。
- UXP profile / secret adapter 注入。

## 本模块不负责什么

- runtime lifecycle。
- provider 参数语义与外部 API 映射。
- 共享层类型与错误模型定义。
- Node CLI artifact 写入。
- 把 host IO 回流进 `core-engine` / `providers`。

## 命令

```bash
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app dev
pnpm --filter @imagen-ps/app test
```

`build` 输出 `dist/`，供 UXP Developer Tool 加载。
