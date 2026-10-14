## Why

当前 provider 架构仍围绕多 Profile、可编辑模型配置、wire model 映射、输出矩阵和通用 endpoint 抽象展开，导致固定的 GRSAI / RunningHub 接入承担了大量无产品价值的状态与跨包契约。参考 `sinyuk_nodes/features/image_api` 的本地 JSON catalog 和 provider 专属异步请求流程，可以把模型能力直接配置化，同时保留统一任务、结果资源、Photoshop 和 ComfyUI 能力。

## What Changes

- 固定产品 provider 为 `GRSAI` 和 `RunningHub`，每个 provider 只维护一份 API Key；更新 Key 直接覆盖该 provider 的当前账号。
- 将 `runninghub_catalog.json` 与 GRSAI 对应的 `config.example.json` 内容复制或同步到当前仓库 `packages/providers/catalog/`，作为发布时随插件提供的本地只读模型目录。
- 让本地 catalog 直接驱动模型列表、主页面的基础参数控件、默认值和 provider/model 参数偏好；模型选择不再创建或持久化 `UserModelConfig`。
- 移除多 Profile、`wireModelId`、`baseModelId`、`requestStrategyId`、通用 endpoint 编辑、远端模型发现、输出矩阵和 capability projection 等旧产品层概念。
- 保留一个公共 `GenerationRequest`，承载 prompt、输入图片、Mask、operation、provider/model 选择和目录声明的参数值。
- 将 GRSAI 的 `replyType: "async"`、GRSAI 轮询、RunningHub 图片上传、endpoint 选择、请求字段和响应解析限制在各自 provider adapter 内。
- 统一 provider adapter 的异步执行、错误、结果资源、历史、预览、下载和 Photoshop 放置流程。
- 完全以返回图片的实际尺寸作为输出事实；不再要求输出矩阵或模型目录预先生成 Photoshop 几何合同。保留现有 PS 输入、Mask、放置和 ComfyUI workflow 处理边界。
- 主页面只显示最小公共参数；更多 catalog 参数为后续高级面板预留，不在本变更中扩展成通用表单编辑器。
- Provider 设置使用两个独立编辑页，共享 API key/base URL 基类表单；provider-specific 字段和校验留在对应页面与 adapter。
- catalog 通过 resolver 加载，优先远程来源，远程失败或校验失败时回退到随发布物提供的本地 catalog；当前只实现本地来源和可替换接口。
- UI 只传递 `providerId + modelId + 参数值集合`，provider-specific 参数检查和 wire 映射由对应 adapter 负责。

## Capabilities

### New Capabilities

- `fixed-provider-catalog`: 固定 provider、单账号、本地只读 catalog、模型参数选择和目录版本校验。
- `provider-request-adapters`: GRSAI / RunningHub 专属请求、上传、异步提交轮询和统一结果归一化。
- `unified-image-generation`: 公共生成意图、统一任务执行和 provider 结果资源处理。

### Modified Capabilities

- `photoshop-image-generation`: 生成输出以返回图片实际尺寸为准，同时保留输入图像、Mask 和放置能力。
- `comfyui-generation`: ComfyUI workflow 执行继续独立拥有协议和状态，仅与 provider lane 共享统一任务/资源/历史边界。

## Impact

- 主要影响 `packages/providers`、`packages/application`、`apps/app` 的 provider、model selection、generation request、account storage 和 UI routes。
- 新增 `packages/providers/catalog/` 及其 validation fixtures；移除 Profile/model repositories、旧矩阵 projection 和通用 endpoint surface。
- Provider transport 仍拥有 HTTP、上传、轮询、错误映射和响应解析；Application 仍拥有 Job/Task、取消、轮询调度和持久化；Photoshop / ComfyUI host adapter 不再承担 provider-specific wire semantics。
- 需要同步更新 contract tests、fake adapters、Chrome harness、build、`check:policy`、`validate` 和 release gate；不主动进行真实 Photoshop 或 UXP Developer Tool 验收。
