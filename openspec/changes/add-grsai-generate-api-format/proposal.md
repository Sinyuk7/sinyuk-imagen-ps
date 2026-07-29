## Why

GRSAI 使用统一的异步图像生成接口，现有 `openai-images`、`openai-chat-completions` 与 `gemini-generate-content` adapter 都不能正确构造请求或查询远端任务。`add-provider-async-execution-foundation` 已定义通用异步生命周期；现在需要首个真实 adapter 将该能力接入用户可用的 Profile。

## What Changes

- 新增 `grsai` `ApiFormat` 与 `grsai-generate` builtin Provider implementation，使用 GRSAI 的 Bearer authentication、`POST /v1/api/generate` 提交和 `GET /v1/api/result?id=...` 查询合同。
- 将 GRSAI 的 `running`、`succeeded`、`violation`、`failed` wire status 在 Provider 内映射到 foundation 的 canonical async lifecycle；不会向 Application、Core 或持久化层暴露 task ID、wire status 或 response body。
- 新增 GRSAI 专属的 request builder、response parser、poll parser 与模型 capability/request strategy，避免复用不兼容的 Gemini 或 OpenAI wire codec。
- 为 GRSAI 新 Profile 提供完整默认模型模板：Nano Banana 2 Lite、Nano Banana 2、Nano Banana Pro 与 GPT Image 2 的已配置变体；模板只在创建时初始化一次，后续均为用户数据。
- 扩展 Profile 保存、draft config、secret resolution、endpoint/path normalization、builtin registry 与 UI `ApiFormat` label，使 `grsai` 可被选择、验证和执行。

## Capabilities

### New Capabilities

- `grsai-generate-api-format`: GRSAI 的配置、异步生成、结果查询与错误归一化合同。
- `grsai-default-model-templates`: GRSAI 新 Profile 的完整、一次性默认模型模板与对应 capability 合同。

### Modified Capabilities

无。

## Impact

- `packages/providers`：`ApiFormat` routing、Provider contract/registry、GRSAI adapter、transport 与模型 catalog。
- `packages/application`：Profile `apiFormat` validation、Profile config resolution 与现有 async execution manager composition。
- `apps/app`：Provider settings 的 `ApiFormat` 显示名称。
- 依赖 `add-provider-async-execution-foundation` 的 runtime composition 和验证完成；不调用真实 GRSAI 服务，不实现 stream、远端取消、webhook 或重启后恢复。
