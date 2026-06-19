# UXP / Photoshop 手工 smoke 清单

类别：manual-only（不属于默认 `pnpm validate` / CI gate）

## 前置条件

- Adobe Photoshop 已安装并启动。
- UXP Developer Tool 已安装。
- 当前 workspace 已执行 `pnpm install`。
- 已执行 `pnpm --filter @imagen-ps/app build`，产出 `apps/app/dist/` 目录。

## 加载 plugin

1. 打开 UXP Developer Tool，点击 "Load" / "Add Plugin"。
2. 选择 `apps/app/dist/manifest.json`。
3. 在 Photoshop 中打开该 plugin panel。
4. 验证 panel 渲染出 AppShell（无明显白屏 / console 红错）。

## 基础功能 smoke

### Profile 管理

- [-] 进入 Settings 页面，列表中显示已保存的 provider profiles（如果之前有的话）。
- [-] 添加一个 provider profile（如 `openai` / `image-endpoint` 类型），填写 displayName、baseURL、apiKey。
- [X] 点击 "Test"，验证 test command 返回成功 / 失败状态都在 UI 上正确呈现。
提示: 配置有效 但是该模型
- [ ] 保存后重新打开 panel，验证 profile 仍然存在（UXP data folder 持久化）。
- [ ] 在 Settings Detail 页面刷新 model 列表，验证 `listProfileModels` / `refreshProfileModels` 正常返回。

### 图层与资产 IO

- [ ] 在 Photoshop 中打开或创建一个包含多个图层的文档。
- [ ] 在 MainPage 中点击 "Select layer"，验证图层树正确展示并可选择。
- [ ] 选择一个 pixel 图层后点击 "Read layer"，验证该图层被转换为 asset 并进入会话。
- [ ] 点击 "Pick image file"，验证 UXP file picker 能正常打开并选择图片。
- [ ] 如果图层带有 user mask，尝试 "Read mask"，验证 mask asset 被正确读取。

### Job 生成流

- [ ] 在 MainPage 选择一个 profile、model，填写提示词。
- [ ] 可选：添加一个 layer/file attachment。
- [ ] 点击 "Generate"，验证 job 状态转变（submitted -> running -> completed/failed）。
- [ ] 如果生成成功，点击 "Place on canvas"，验证 Photoshop 中导入了生成的图片。
- [ ] 检查 History 页面是否显示刚刚的 job 记录。

### 日志与诊断

- [ ] 在 UXP 中执行几次操作后，打开 plugin 诊断界面（如果有）或直接调用 `readRecentLogRecords`。
- [ ] 验证返回的日志记录包含 `trace_id` / `span_id`，事件名称符合预期。
- [ ] 导出日志到本地文件，验证导出的 JSONL 中不含 secret、apiKey、本地路径等敏感信息。

## 常见问题

| 症状 | 可能原因 | 排查方法 |
|---|---|---|
| panel 白屏 | `index.tsx` 初始化异常 | UXP Developer Tool console 查看红错 |
| profile 保存后消失 | UXP data folder 写入失败 | 检查 `localFileSystem` 权限与 `getDataFolder` 返回 |
| layer tree 为空 | `photoshop.app.activeDocument` 为空 | 确保当前有活动文档 |
| place asset 失败 | `batchPlay(placeEvent)` descriptor 不兼容 | 查看 console 中 `executeAsModal` / `batchPlay` 错误 |
| 导出日志为空 | 该日无日志或 `getFileForSaving` 不可用 | 检查 UXP Developer Tool 中的 file permission |

## 记录格式

完成 smoke 后，将以下信息记录到当前 loop 或 `_inbox/` 笔记：

- Photoshop 版本号
- UXP Developer Tool 版本号
- 操作系统
- 各 smoke 项的结果（通过 / 失败）
- 失败项的 console / UXP Developer Tool 错误日志（去除敏感信息后）
- 导出的 JSONL trace 示例（可用于验证 trace 相关性）
