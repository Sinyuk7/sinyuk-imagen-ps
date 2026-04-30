# app 状态

- 状态：UI 层已完成 mock 实现；`shared/commands` 已完成 v1 + v2 八命令，作为 UI ↔ runtime 唯一合规通路
- 更新时间：2026-04-30

---

## 当前已确认存在

### 入口与配置
- `package.json`
- `tsconfig.json` — 已添加 `"DOM"` 到 lib（React + 浏览器 API 类型支持）
- `src/index.tsx`

### UI 层（`src/ui/`）

**已实现 5 个页面，全部为 TypeScript React 组件：**

| 文件 | 页面 | 状态 |
|------|------|------|
| `app-shell.tsx` | 应用外壳，注入 CSS，路由 5 个页面 | ✅ 已更新 |
| `panel-css.ts` | 设计 token + 完整 CSS（`--bg`/`--pr` 等变量、动画、响应式） | ✅ 新增 |
| `components/icons.tsx` | `SI` SVG 图标组件 | ✅ 新增 |
| `components/tip.tsx` | `Tip` 工具提示包裹组件 | ✅ 新增 |
| `components/compare-slider.tsx` | 对比滑块 Lightbox | ✅ 新增 |
| `pages/main-page.tsx` | 主聊天页 | ✅ 新增 |
| `pages/history-page.tsx` | 历史记录页 | ✅ 新增 |
| `pages/settings-page.tsx` | Provider 列表页 | ✅ 新增 |
| `pages/settings-add-page.tsx` | 添加 Provider（2步流程） | ✅ 新增 |
| `pages/settings-detail-page.tsx` | Provider 详情与参数设置 | ✅ 新增 |

**主页面已实现的交互：**
- WeChat 风格对话气泡（用户右对齐 / Provider 左对齐）
- 三种消息状态：运行中（计时器 + 动画点）、成功（图片 + 悬停操作栏）、失败（错误信息 + 重试）
- Composer：`+` 附件按钮 → PS 图层选择器 / 文件上传、Model chip 下拉、分裂发送按钮 + 发送模式菜单（当前图层 / 当前选区 / 上传图片）
- 对比滑块 Lightbox（拖拽分割线查看参考 vs 生成）
- Toast 通知

### Host 层（`src/host/`）
- `create-plugin-host-shell.ts` — PluginHostShell 接口与工厂函数

### Shared 层（`src/shared/`）
- `plugin-app-model.ts` — PluginAppModel 接口
- `runtime.ts` — Runtime 单例 + Provider Registry + Config Adapter
- `commands/` — UI ↔ runtime 命令层（见下方 API 表）

### 测试
- `tests/commands.test.ts` — 21 个用例，覆盖 v1 + v2 + setConfigAdapter

### 原型（`prototype/`）
- `preview.html` — 可运行的交互原型（独立 React SPA，对应已实现的 UI 设计）
- 预览命令：`cd prototype && python3 -m http.server 8888`，打开 http://localhost:8888/preview.html

---

## shared/commands 公开 API

### v1 命令

| 命令 | 签名 | 用途 |
|------|------|------|
| `submitJob` | `(input: SubmitJobInput) → Promise<CommandResult<Job>>` | 提交 workflow 执行 |
| `getJob` | `(jobId: string) → Job \| undefined` | 查询 job 快照 |
| `subscribeJobEvents` | `(handler: JobEventHandler) → Unsubscribe` | 订阅 lifecycle 事件 |

### v2 命令

| 命令 | 签名 | 用途 |
|------|------|------|
| `listProviders` | `() → ProviderDescriptor[]` | 列出所有已注册 provider |
| `describeProvider` | `(providerId: string) → ProviderDescriptor \| undefined` | 获取单个 provider 描述 |
| `getProviderConfig` | `(providerId: string) → Promise<CommandResult<ProviderConfig>>` | 获取 provider 配置 |
| `saveProviderConfig` | `(providerId: string, config: unknown) → Promise<CommandResult<void>>` | 保存 provider 配置 |
| `retryJob` | `(jobId: string) → Promise<CommandResult<Job>>` | 重试指定 job |

### 导出类型

| 类型 | 用途 |
|------|------|
| `CommandResult<T>` | 命令执行结果统一包装 |
| `SubmitJobInput` | submitJob 输入参数 |
| `JobEventHandler` | 事件处理器类型 |
| `ConfigStorageAdapter` | Config 持久化 adapter 接口 |
| `ProviderDescriptor` | Provider 元数据（re-export） |
| `ProviderConfig` | Provider 配置（re-export） |

---

## UI 层当前限制（mock 状态）

当前 UI 全部使用模拟数据，**尚未接入任何真实业务逻辑**：

| 功能 | 当前状态 | 缺什么 |
|------|----------|--------|
| 发送生成任务 | `setTimeout` 模拟 4s 延迟 | 接 `submitJob` + `subscribeJobEvents` |
| 生成结果图片 | CSS gradient 占位符 | 接真实 base64 / blob URL |
| PS 图层列表 | 硬编码 10 个假图层 | 接 UXP `app.activeDocument.layers` |
| Provider 列表 | 硬编码 3 个假 provider | 接 `listProviders` |
| 设置保存 | 无实际写入 | 接 `saveProviderConfig` |
| 历史记录 | 硬编码 8 条假记录 | 接 runtime job store 查询 |

---

## 下一步计划（优先级顺序）

### P1 — 接通真实生成链路
**目标：** 用户在主页面输入 prompt → 实际调用 provider API → 显示真实生成图片

1. 在 `MainPage.handleSend` 里将 `setTimeout` 替换为 `submitJob` 调用
2. 用 `subscribeJobEvents` 监听 `job:completed` / `job:failed` 事件，更新消息状态
3. 完成后将 `msg.grad` 替换为真实图片 URL

参考：`src/shared/commands/submit-job.ts`、`packages/core-engine` runtime API

### P2 — 接通 PS 图层读取
**目标：** Composer 的 PS 图层列表来自真实 Photoshop 文档

1. 在 `src/host/` 里封装 UXP `app.activeDocument.layers` 读取
2. `MainPage` 通过 host prop 获取图层列表，替换 `PS_LAYERS` 常量

参考：`src/host/create-plugin-host-shell.ts`、Adobe UXP API 文档

### P3 — Provider 设置持久化
**目标：** `SettingsDetailPage` 能真实保存 / 读取 API Key 和生成参数

1. `SettingsPage` 从 `listProviders()` 拉取 provider 列表
2. `SettingsDetailPage` 从 `getProviderConfig()` 初始化表单值
3. 保存按钮调用 `saveProviderConfig()`
4. 注入 `ConfigStorageAdapter`（UXP 端用 `localStorage` 或 UXP storage API）

参考：`src/shared/commands/save-provider-config.ts`

### P4 — 历史记录接真实 job store
**目标：** 历史页显示真实执行过的任务

1. `HistoryPage` 从 runtime job store 查询历史 job
2. 替换 `HIST_DATA` 硬编码数据

---

## 边界约束（不变）

- UI 层只能通过 `shared/commands` 与 runtime 交互
- 禁止 UI 层直接 import `runtime` / `getRuntime` / `store` / `dispatcher` / `providerRegistry`
- Photoshop IO 只能在 `host/` 层或 adapter 边界
- v1 workflow 限制：`'provider-generate' | 'provider-edit'`

---

## 当前已知偏差

- `host/` 与 adapter 边界仍未完全稳定
- UXP API 调用尚未实现（无 Photoshop 环境下降级策略待定）
