## 1. Provider Catalog Contract

- [ ] 1.1 在 `packages/providers` 定义 model output matrix 类型，表达 `apiFormat`、`modelId`、`operation`、`imageSize`、`ratio`、`outputFormat` 与 exact `requestOutput`。
- [ ] 1.2 清理官方 image model catalog，移除 hidden default fallback rules 以及 `gpt-image-1`、`dall-e-3`、`grok`、`doubao`、`qwen` picker-visible presets。
- [ ] 1.3 为保留的 GPT / Gemini catalog rules 补齐 output matrix，并覆盖 `text_to_image` 与 `image_edit` 默认 `auto` 行为。
- [ ] 1.4 更新 catalog resolver：未命中官方 catalog 或用户模型配置时 fail closed，不再返回 default fallback rule。
- [ ] 1.5 更新 catalog validation，检查 matrix cell 唯一性、默认 selection 存在、选项与 cell 一致、`requestOutput` 字段合法。

## 2. Provider Request Serialization

- [ ] 2.1 更新 provider canonical output contract，允许 matrix resolved `requestOutput` 表达 GPT pixel `size` 与 Gemini `imageSize` / `aspectRatio`。
- [ ] 2.2 更新 `image-endpoint` request builder，使其只序列化 resolved `size` / `outputFormat`，不再根据 `sizePreset` + `aspectRatio` 推导尺寸。
- [ ] 2.3 更新 `chat-image` request builder，使其只序列化 resolved `image_config` 字段，不再执行 `4k -> 2K` 等隐藏映射。
- [ ] 2.4 更新 `gemini-generate-content` request builder，使其只序列化 resolved Gemini output fields，并保留 wire revision 归属校验。
- [ ] 2.5 更新 provider mock schema 与 provider tests，验证 catalog resolved output 与最终 HTTP body 一致。

## 3. Application Model Settings API

- [ ] 3.1 扩展 `ProfileModelItem` 或新增 command DTO，把 selected model 的 output matrix 暴露给 app，且不让 app 直接 import `@imagen-ps/providers`。
- [ ] 3.2 新增或更新 application command，读取 `profileId + modelId + operation` 的 generation settings spec、saved preference 与 resolved selection。
- [ ] 3.3 新增 model generation preference repository / storage contract，key 使用 `profileId + apiFormat + modelId + operation`。
- [ ] 3.4 新增保存 model generation preference 的 command，并在保存时校验 selection 存在于当前 matrix。
- [ ] 3.5 更新 dispatch 前 model/output resolution，Submit 必须使用 resolved `requestOutput`，未知模型必须在 provider dispatch 前 validation failure。
- [ ] 3.6 将 `UserModelConfig` / `SaveUserModelConfigInput` 从聚合 `aspectRatios/sizes/outputFormats` 删除并替换为 official preset matrix 子集配置。
- [ ] 3.7 更新 `saveUserModelConfig` 校验：用户配置只能引用同 `apiFormat` official preset，并且只能减少 official preset 已声明的 matrix cells / formats。
- [ ] 3.8 删除 application 里所有旧 output settings / old `ModelOutputConfig` compatibility、migration 或 best-effort 读取逻辑。

## 4. App State And Shared Controller

- [ ] 4.1 拆分现有 `AppGenerationSettings`：删除全局输出参数，替换为 model-scoped preference；`providerInputSizePreset` 保留为 app-local settings。
- [ ] 4.2 实现共享 UI controller / hook，统一加载 matrix、偏好、默认值、可选 `imageSize` / `ratio` / `outputFormat` 与 resolved `requestOutput`。
- [ ] 4.3 更新 MainPage output controls 使用共享 controller，并删除本地静态 `OUTPUT_SIZE_PRESETS` / 独立 size fallback 逻辑。
- [ ] 4.4 更新 GlobalGenerationSettingsPage，使其展示当前 selected model 的 generation settings，并与 MainPage 共用保存路径。
- [ ] 4.5 更新 `useConversation` / Send 入口，使用共享 controller 的 resolved `requestOutput`，同时继续传递 app-local `providerInputSizePreset`。
- [ ] 4.6 确保 selected profile / selected model / operation 变化时，GlobalGenerationSettingsPage 与 MainPage 控件立即切换到对应 matrix 与 preference。

## 5. Model Configuration Page

- [ ] 5.1 更新 `ModelConfigurationPage`，移除旧 `aspectRatios`、`sizes`、`outputFormats` 自由多选编辑状态。
- [ ] 5.2 将 `ModelConfigurationPage` 改为 official preset 派生配置页面，只允许从 preset matrix 中禁用 cells / formats。
- [ ] 5.3 更新 `ModelConfigurationPage` 的 save payload，提交 matrix subset 而不是旧 `ModelOutputConfig`。
- [ ] 5.4 更新 Settings 入口和 edit seed 行为，确保从 profile detail 进入时加载对应 official preset 与已保存子集。
- [ ] 5.5 更新 `model-configs`、`ModelConfigurationPage`、storage validator 相关测试，覆盖“可减少、不可增加”的规则。

## 6. Storage Clean Break

- [ ] 6.1 为 Chrome IndexedDB storage 添加 model generation preference store。
- [ ] 6.2 为 UXP storage 添加 model generation preference JSON store。
- [ ] 6.3 删除旧全局 output settings 存储语义，只保留 `providerInputSizePreset` app-local 设置。
- [ ] 6.4 更新 Chrome / UXP `userModelConfigs` storage validator，拒绝旧聚合能力结构，不做迁移。
- [ ] 6.5 更新 fakes / harness storage，支持 model generation preference 与 user model matrix subset 测试，且不包含旧 schema 兼容分支。

## 7. Validation

- [ ] 7.1 更新 `packages/providers` catalog 和 request builder tests，覆盖 GPT `4K + 16:9 -> size: "3840x2160"`、GPT `auto -> size: "auto"`、Gemini native fields。
- [ ] 7.2 更新 `packages/application` profile/model tests，覆盖 unknown model fail closed、model preference save/load、dispatch 前 resolved output、user model config 只能收窄 official preset、旧 schema 被拒绝且不迁移。
- [ ] 7.3 更新 `apps/app` tests，覆盖 MainPage 与 Settings 页选项一致、多个 profile 切换时 Settings 页跟随切换、同一 model 在不同 profile 下偏好独立、Settings 任意有效选择都会影响下一次 Send 的 exact request output、ModelConfigurationPage 只能减少 preset matrix。
- [ ] 7.4 增加端到端式 app fake test：在 Settings 页切换 `imageSize` / `ratio` / `outputFormat` 后回到 MainPage Send，断言 `submitJob.input.output` 等于 matrix resolved `requestOutput`。
- [ ] 7.5 运行 per-slice validation：`pnpm --filter @imagen-ps/providers test`、`pnpm --filter @imagen-ps/application test`、`pnpm --filter @imagen-ps/app test`。
- [ ] 7.6 运行 final validation：`pnpm validate`。
