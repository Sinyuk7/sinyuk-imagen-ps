## 1. `provider-model-output-matrix`

- [x] 1.1 在 `packages/providers` 定义 model output matrix 类型，表达 `apiFormat`、`modelId`、`operation`、`imageSize`、`ratio`、`outputFormat` 与 exact `requestOutput`。
- [x] 1.2 定义 matrix cell schema：stable `cellId`、ordered options、`defaultCellId`、operation-scoped cells、API-format-specific `requestOutput`。
- [x] 1.3 从新 matrix 与 requestOutput 中删除 512-specific 概念：不暴露 `imageSize=512`，不生成 Gemini `IMAGE_SIZE_FIVE_TWELVE`。
- [x] 1.4 清理官方 image model catalog，移除 hidden default fallback rules 以及 `gpt-image-1`、`dall-e-3`、`grok`、`doubao`、`qwen` picker-visible presets。
- [x] 1.5 为保留的 GPT / Gemini catalog rules 补齐 output matrix，并覆盖 `text_to_image` 与 `image_edit` 默认 `auto` 行为。
- [x] 1.6 更新 catalog resolver：未命中官方 catalog 或用户模型配置时 fail closed，返回 no-match 结果，不再返回 `image-endpoint-default`、`chat-image-default`、`gemini-generate-content-default` 或任何 default fallback rule。
- [x] 1.7 增加机械校验：executable official catalog rule id 不得以 `-default` 结尾，并为 unknown model 增加 `hasExplicitRule(apiFormat, modelId) === false` 或等价断言。
- [x] 1.8 更新 catalog validation，检查 cell 唯一性、默认 cell 存在、options 与 cells 一致、`requestOutput` 字段归属合法，并拒绝 512-specific matrix/requestOutput。
- [x] 1.9 更新 provider canonical output contract，允许 matrix resolved `requestOutput` 表达 GPT pixel `size` 与 Gemini `imageSize` / `aspectRatio`。
- [x] 1.10 更新 `image-endpoint`、`chat-image`、`gemini-generate-content` request builders，使 transport 只序列化 resolved output，不再根据 UI size/ratio 推导或降级。
- [x] 1.11 删除或使测试覆盖禁止旧推导 helpers：`concreteSizeFromOutput`、`sizeFromPreset`、`outputToImageConfig` 以及 Gemini build generation config 中从旧 output 推导 size/ratio 的路径；缺失/非法 resolved output 必须 validation failure。
- [x] 1.12 更新 provider mock schema 与 provider tests，验证 catalog resolved output 与最终 HTTP body 一致。

## 2. `model-generation-preferences`

- [x] 2.1 新增 model generation preference 类型与 repository/storage contract，key 使用 `profileId + apiFormat + modelId + operation`，value 保存 `cellId + imageSize + ratio + outputFormat`，不得保存 wire `requestOutput` 字段。
- [x] 2.2 新增或更新 application command，读取当前 profile/model/operation 的 matrix、saved preference、resolved selection 与 resolved `requestOutput`。
- [x] 2.3 新增保存 model generation preference 的 command，并在保存时校验 selection/cell 存在于当前 matrix。
- [x] 2.4 实现 invalid saved preference fallback：cell 或 option 失效时使用 matrix `defaultCellId`，不发送旧 selection。
- [x] 2.5 为 Chrome IndexedDB storage 添加 model generation preference store。
- [x] 2.6 为 UXP storage 添加 model generation preference JSON store。
- [x] 2.7 拆分现有 `AppGenerationSettings`：删除全局输出参数，只保留 `providerInputSizePreset` app-local 设置。
- [x] 2.8 删除 application/app storage 中所有旧 output settings compatibility、migration 或 best-effort 读取逻辑。

## 3. `generation-settings-ui`

- [x] 3.1 实现共享 UI controller / hook，统一加载 matrix、偏好、默认值、可选 `imageSize` / `ratio` / `outputFormat` 与 resolved `requestOutput`。
- [x] 3.2 更新 MainPage output controls 使用共享 controller，并删除本地静态 `OUTPUT_SIZE_PRESETS` / 独立 size fallback 逻辑。
- [x] 3.3 更新 MainPage ratio/format 控件，使选项随当前 matrix 和 selected `imageSize` 变化。
- [x] 3.4 更新 `composer-readiness.ts`：基于 executable matrix 判断 output readiness，无 matrix 时返回阻止 Send 的 unsupported/validation 状态，不再以 `unknown` 通过。
- [x] 3.5 更新 GlobalGenerationSettingsPage，使其展示当前 selected profile/model/operation 的 generation settings，并与 MainPage 共用保存路径。
- [x] 3.6 删除 GlobalGenerationSettingsPage / output-size context 的 page-local 或 synthetic `no-composer-context` 分支；缺少 shared composer context 时显示 validation state。
- [x] 3.7 更新 `useConversation` / Send 入口，使用共享 controller 的 resolved `requestOutput`，同时继续传递 app-local `providerInputSizePreset`。
- [x] 3.8 确保 selected profile / selected model / operation 变化时，GlobalGenerationSettingsPage 与 MainPage 控件立即切换到对应 matrix 与 preference。
- [x] 3.9 更新 app tests，覆盖 MainPage 与 Settings 页选项一致、Settings 改动影响下一次 Send、MainPage 改动反映到 Settings、无 matrix 时阻止 Send、Settings 不存在 `no-composer-context` fallback。

## 4. `user-model-output-subsets`

- [x] 4.1 将 `UserModelConfig` / `SaveUserModelConfigInput` 从聚合 `aspectRatios/sizes/outputFormats` 删除并替换为 official preset matrix 子集配置。
- [x] 4.2 更新 `saveUserModelConfig` 校验：用户配置必须引用同 `apiFormat` official preset，并且只能保存非空 matrix cell 子集。
- [x] 4.3 拒绝用户配置新增 official preset 未声明的 cell、ratio、imageSize、outputFormat、requestStrategyId 或 provider field。
- [x] 4.4 更新 `ModelConfigurationPage`，移除旧 `aspectRatios`、`sizes`、`outputFormats` 自由多选编辑状态。
- [x] 4.5 将 `ModelConfigurationPage` 改为 official preset 派生配置页面，只允许从 preset matrix 中禁用 cells / formats。
- [x] 4.6 更新 `ModelConfigurationPage` 的 save payload，提交 official preset + matrix subset，而不是旧 `ModelOutputConfig`。
- [x] 4.7 更新 Settings 入口和 edit seed 行为，确保从 profile detail 进入时加载对应 official preset 与已保存子集。
- [x] 4.8 更新 Chrome / UXP / fake `userModelConfigs` storage validator，拒绝旧聚合能力结构，不做迁移。
- [x] 4.9 更新 `model-configs`、`ModelConfigurationPage`、storage validator 相关测试，覆盖“可减少、不可增加、不可空、旧 schema 拒绝”的规则。

## 5. Validation

- [x] 5.1 更新 `packages/providers` catalog 和 request builder tests，覆盖 GPT `4K + 16:9 -> size: "3840x2160"`、GPT `auto -> size: "auto"`、Gemini native fields、invalid requestOutput field rejection、unknown model no-match、executable catalog 无 `*-default`。
- [x] 5.2 更新 `packages/application` tests，覆盖 unknown model fail closed、model preference save/load、operation-scoped preference、invalid preference fallback、dispatch 前 resolved output。
- [x] 5.3 更新 `apps/app` tests，覆盖 MainPage 与 Settings 页共享 controller、多 profile/model/operation 切换、同一 model 在不同 profile 下偏好独立、Settings 任意有效选择影响下一次 Send。
- [x] 5.4 更新 user model config tests，覆盖 official preset subset、不可新增能力、不可改 request strategy、旧 schema 被拒绝且不迁移。
- [x] 5.5 增加端到端式 app fake test：在 Settings 页切换 `imageSize` / `ratio` / `outputFormat` 后回到 MainPage Send，断言 `submitJob.input.output` 等于 matrix resolved `requestOutput`。
- [ ] 5.6 运行 per-slice validation：`pnpm --filter @imagen-ps/providers test`、`pnpm --filter @imagen-ps/application test`、`pnpm --filter @imagen-ps/app test`。
- [ ] 5.7 运行 final validation：`pnpm validate`。
