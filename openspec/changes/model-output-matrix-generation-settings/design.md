## Context

当前输出参数链路分散在三层：`apps/app` 保存全局 `AppGenerationSettings`，`packages/application` 只把 `output` 透传到 provider request，`packages/providers` 再通过 catalog strategy 与 transport builder 推导最终 body。这个形状让 UI 只能展示静态 `1k/2k/4k` 与少量 ratio，无法保证用户看到的设置就是实际发送的接口参数。

本变更把“模型支持什么输出参数”提升为 provider catalog 的一等数据。`apps/app` 仍提供统一的 `imageSize`、`ratio`、`outputFormat` 控件，但每个选项组合由 catalog cell 解析为 exact `requestOutput`。`providerInputSizePreset` 保持 app-local，因为它描述输入图片预处理，不是 provider 输出参数。

规格按能力拆分：

```text
provider-model-output-matrix
  catalog allowlist + output matrix + exact requestOutput
        │
        ▼
model-generation-preferences
  profile/apiFormat/model/operation scoped saved selection
        │
        ▼
generation-settings-ui
  MainPage + GlobalGenerationSettingsPage shared controller
        │
        ▼
Submit exact resolved output

user-model-output-subsets
  ModelConfigurationPage narrows official preset matrix
```

## Goals / Non-Goals

**Goals:**
- 将官方 image model catalog 收窄为明确白名单，并删除 hidden default fallback。
- 为保留模型声明 `operation -> imageSize + ratio + outputFormat -> requestOutput` 的完整矩阵。
- 保持 UI 简洁：MainPage 与 Settings 页仍使用 `1K/2K/4K`、ratio、format 控件。
- 让 MainPage 快捷入口与 Settings 页使用同一个 resolver / controller。
- 按当前 selected model 保存用户 generation preference，切换模型时加载对应偏好。
- 将 `UserModelConfig` 纳入同一 output matrix contract，并让 `ModelConfigurationPage` 只允许从 official preset 能力中做子集收窄。
- Send 时只使用 catalog cell resolved `requestOutput`，transport 不再做 size/ratio 语义推导。
- 以 clean break 删除旧输出设置和旧模型配置 schema；不做任何兼容、迁移或旧数据 best-effort 读取。

**Non-Goals:**
- 不实现 custom VIP pixel size。
- 不保留 `gpt-image-1`、`dall-e-3`、`grok`、`doubao`、`qwen` 官方 picker preset。
- 不允许用户模型配置增加 official preset 未声明的 matrix cell、ratio、imageSize、outputFormat 或 request strategy。
- 不改变 `providerInputSizePreset` 的本地输入图片 resize 行为。

## Decisions

### Decision: Catalog 是官方可执行模型白名单

官方 catalog 不再通过 hidden default rule 接收未知模型。未命中官方 catalog 或用户模型配置的模型 MUST fail closed。

原因：本变更的核心是“单一数据源”和“所见即所发”。default fallback 会让未知模型绕过 matrix，使 UI 和 Send 重新依赖猜测。

替代方案：保留 fallback 只用于 discovery 展示。放弃该方案，因为它容易被执行路径误用，并且会继续污染 `configured`/`selectable` 状态。

实现验收要机械化：`resolveImageModelRule` 这类 resolver 必须能表达 no-match，不能把未知模型映射到 `image-endpoint-default`、`chat-image-default`、`gemini-generate-content-default`。测试应断言 executable catalog 中没有 `*-default` rule，并提供类似 `hasExplicitRule(apiFormat, modelId)` 的断言覆盖 unknown model。

### Decision: 0 用户阶段使用 clean break

旧 `AppGenerationSettings` 输出字段、旧 `UserModelConfig.output` 聚合结构、旧 storage validator 和旧测试语义全部删除或替换。代码不得包含 compatibility branch、migration path、best-effort old-data reader 或旧 schema fallback。

原因：项目当前 0 用户、0 production data，兼容层会保留第二套语义并削弱单一数据源。

替代方案：保留旧 schema 读取分支。放弃该方案，因为旧读取分支会迫使实现同时理解旧 `sizePreset/aspectRatio/outputFormat` 与新 matrix selection。

### Decision: Output matrix 使用 UI selection + exact requestOutput

Catalog cell 使用统一 UI 维度：

```text
imageSize + ratio + outputFormat -> requestOutput
```

GPT 类模型的 `imageSize` 是 UI 分组维度，cell 解析为 pixel `size`：

```text
4K + 16:9 + png -> { size: "3840x2160", outputFormat: "png" }
auto -> { size: "auto" }
```

Gemini 类模型的 `imageSize` 是真实 provider 字段，cell 解析为 Gemini request 字段：

```text
4K + 16:9 + png -> { imageSize: "4K", aspectRatio: "16:9", outputFormat: "png" }
```

原因：这保持 UI 一致，同时不把 GPT 强行建模成不存在的 `imageSize` provider 参数。

替代方案：UI 直接展示全部 pixel size。放弃该方案，因为 GPT ratio + 规格组合过多，会让 Settings 与 MainPage 变得难用。

512 输出尺寸不进入新 matrix。新 UI 维度只保留 `auto`、`1K`、`2K`、`4K`，并删除 Gemini `IMAGE_SIZE_FIVE_TWELVE` 等 512-specific request output 常量。

Transport builder 的旧推导逻辑必须删除，不只是旁路。`image-endpoint/build-request.ts` 中的 size preset 推导、`chat-image/build-request.ts` 中的 `outputToImageConfig` 类映射、`gemini-generate-content/build-request.ts` 中从旧 output 推导 generation config 的路径，都应被 exact `requestOutput` 序列化替代；缺失或非法 resolved output 应 fail validation。

### Decision: Matrix contract 独立于页面

`provider-model-output-matrix` 只声明底层可执行模型和 exact output contract，不包含 MainPage、Settings 或 `ModelConfigurationPage` 页面行为。页面只消费 application 暴露的 matrix DTO。

原因：matrix 是 provider/application contract；页面是用户入口。如果混在一个 capability 里，provider transport、storage、两页 UI 和用户模型配置会互相牵制，任务难以按包验证。

### Decision: Preference contract 独立于 UI 页面

`model-generation-preferences` 只拥有保存 key、saved selection、invalid fallback 和旧 global output clean break。MainPage 与 Settings 如何展示这些状态归属 `generation-settings-ui`。

原因：偏好存储需要被 application/storage 测试独立覆盖；UI 页面同步需要 app tests 覆盖。

### Decision: `outputFormat` 进入同一 matrix

`outputFormat` 不是全局固定选项。每个模型/API format 必须声明真实支持的 format，UI 只能展示 catalog 声明项，Send 只能发送已选择项。

原因：当前 provider 可能 ignore 不支持的 format，这违反“所见即所发”。

### Decision: `image_edit` 不特殊化

`image_edit` 与 `text_to_image` 使用同样的 matrix 机制。默认值可以是 `auto`，但用户后续选择什么就发送什么。

原因：是否使用输入图比例是用户选择，不应在 app 里另设隐式规则。

### Decision: Preference 保存 UI selection，不保存 resolved wire 值

模型级偏好保存：

```text
profileId + apiFormat + modelId + operation + imageSize + ratio + outputFormat
```

Send 时用当前 catalog 重新解析为 `requestOutput`。

原因：catalog 更新后可以重新校验偏好；保存 wire 值会把旧模型参数永久固化。

Repository contract 最少需要表达：

```text
ModelGenerationPreference {
  profileId
  apiFormat
  modelId
  operation
  cellId
  imageSize
  ratio
  outputFormat
}
```

`profileId + apiFormat + modelId + operation` 是查找 key；`cellId + UI selection` 是 saved value。storage 不保存 pixel `size`、Gemini `imageSize/aspectRatio` 或 `image_config` 等 wire 字段。

### Decision: Public command 暴露模型 output settings

`apps/app` 不直接 import `@imagen-ps/providers`。`packages/application` 提供 command 读取当前 profile/model 的 output matrix、保存 preference，并返回 resolved selection。

原因：维持现有边界：provider owns catalog，application owns profile/model coordination，app owns UI state。

### Decision: `UserModelConfig` 只能收窄 official preset matrix

`UserModelConfig` 不再保存独立的 `aspectRatios/sizes/outputFormats` 聚合能力。用户模型配置必须引用同 `apiFormat` 下的 official preset / base model spec，并只能禁用 official preset 已声明的 matrix cells 或 output formats，不能新增 matrix cell、ratio、imageSize、outputFormat、requestStrategyId 或 provider field。

原因：如果用户配置可以自由增加能力，它会成为 official catalog 之外的第二套数据源，重新引入 transport 推导和不可验证输出。允许“减少”保留了用户偏好和保守配置能力，同时保持 exact output matrix 的单一上界。

替代方案：实现完整 custom matrix editor。放弃该方案作为本轮目标，因为它需要复杂的 cell editor、provider field 校验和高风险 UX；后续可作为单独 change。

`ModelConfigurationPage` 因此从“自由编辑模型能力”变为“从 official preset 派生并收窄模型能力”的页面：

```text
official preset matrix
        │
        ▼
user model config
  allowedCells ⊆ preset.cells
  allowedFormats ⊆ preset.formats
```

该能力单独归属 `user-model-output-subsets`，因为它的主要用户入口是 `ModelConfigurationPage`，并且它改变的是用户模型配置 schema，而不是 generation preference schema。

### Decision: Settings 页跟随当前 profile/model

`GlobalGenerationSettingsPage` 不再是全局页面状态。它读取 AppShell 当前 selected profile、selected model 与 composer operation，并使用同一 shared controller 解析 settings。切换 profile 或 model 后，Settings 页必须显示新上下文对应的 preference；在 Settings 页内选择任意 `imageSize`、`ratio`、`outputFormat` 后，MainPage 和 Send 使用的 resolved output 必须同步改变。

原因：用户心智是“当前模型的参数展开项”，不是 app-wide global preference。

现有 `docs/ENGINEERING_CONTEXT.md` 已要求 MainPage 与 GlobalGenerationSettingsPage 从 shared composer draft 解析 operation，Settings 不得回退到 page-local 或 synthetic `no-composer-context`。本变更必须删除该遗留分支；缺少真实 composer context 时显示 validation state，而不是构造假上下文。

## Risks / Trade-offs

- [Risk] 删除 fallback 会让部分远端 discovery 模型不可选。→ Mitigation：列表中保留 discovered facts，但 `configured=false` / `selectable=false`，提示需要官方支持或后续 user config。
- [Risk] GPT matrix 数据量较大且容易录错。→ Mitigation：为每个 catalog rule 增加 deterministic validation，检查 cell 唯一性、默认值存在、ratio 与 imageSize 组合完整性。
- [Risk] 用户暂时不能为完全未知模型增加新 output matrix。→ Mitigation：本轮明确只允许基于 official preset 收窄；新增主流模型通过后续 catalog 扩展进入官方白名单。
- [Risk] 旧全局 `Generation Settings` 测试和 storage 会失效。→ Mitigation：按 clean break 删除旧输出 storage 语义，测试改成模型偏好语义。
- [Risk] `ModelConfigurationPage` 旧多选 UI 会误导用户认为可以增加能力。→ Mitigation：替换为 official preset 派生/收窄 UI，并在 command 层拒绝超集。
- [Risk] Transport builder 仍保留旧推导逻辑会形成双数据源。→ Mitigation：任务中要求 transport 删除或旁路 size/ratio 推导，只序列化 exact `requestOutput`。
- [Risk] `openai-chat-completions` 与 `gemini-generate-content` 下的 Gemini 同名模型容易混淆。→ Mitigation：matrix key 必须包含 `apiFormat`，UI 展示从 profile API format 进入。
- [Risk] 多 profile/model 切换时 Settings 页和 MainPage 不同步。→ Mitigation：shared controller 的测试必须覆盖多 profile 切换、Settings 页切换、MainPage Send request 三者一致。
