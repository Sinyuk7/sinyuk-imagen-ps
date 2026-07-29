## Context

当前系统的 `ApiFormat` 只覆盖 OpenAI Images、Chat Completions 与 Gemini GenerateContent。GRSAI 的图像生成使用另一份稳定 wire contract：以 `Authorization: Bearer <API key>` 调用 `POST /v1/api/generate`，并以 `GET /v1/api/result?id=<task-id>` 查询异步任务。GRSAI 的 Nano Banana 2、Nano Banana Pro 与 GPT Image 2 共享这组 transport endpoints，却有不同的模型和 geometry 输入约束。

`add-provider-async-execution-foundation` 已将远端异步任务收敛为 Provider-owned `submit()` / `poll()` 和 Application-owned manager。本 change 只作为该 foundation 的首个真实 Provider consumer；不改变 Core Job、Application session 或持久化模型。

`replace-remote-model-discovery-with-local-catalog` 定义默认模板只在创建 Profile 时读取一次。GRSAI 的完整模板 inventory 属于本 change；其初始化和持久化语义仍由 catalog change 统一实现。

## Goals / Non-Goals

**Goals:**

- 新增 `ApiFormat = "grsai"` 和唯一 canonical implementation `grsai-generate`。
- 支持 GRSAI 公开的两个 base URL，通过既有 Profile connection collection 配置；默认 path 为 `/v1/api/generate` 与 `/v1/api/result`。
- 将现有 canonical image request 映射为 GRSAI async generation request，并把远端结果映射为 canonical lifecycle result。
- 定义所有已确认 GRSAI 产品模型的完整默认模板、capability 与 GRSAI-owned request strategy。
- 使用 fake HTTP、fake async manager clock 与 Profile harness 验证 wire body、status mapping、一次提交、无重提和默认模板。

**Non-Goals:**

- 不实现 `replyType: "json"`、`replyType: "stream"`、SSE framing、webhook、远端任务取消或重启后 remote task 恢复。
- 不请求通用 `/models`、不从域名或模型名称推断 API format，也不让 endpoint 自动选择其他 Provider。
- 不把 task ID、GRSAI wire status、原始 response body、API key 或 template source/version/origin 写入 Job、History、Profile 或 diagnostics。
- 不扩展产品模板为未确认的 `nano-banana`；本 change 只交付已确认 inventory。

## Decisions

### 1. `grsai` 是新的 ApiFormat，`grsai-generate` 是唯一 builtin adapter

`ApiFormat` routing table 新增 `grsai -> grsai-generate`。Profile 与 Application 仍只保存并路由 `ApiFormat`；registry 以同一 mapping 验证 descriptor。`grsai-generate` 的 descriptor 为 `invokeMode: "async"`，并声明 `ProviderAsyncLifecycle`。

选择独立 format，而不是把 GRSAI 识别成 Gemini 或 OpenAI：GRSAI 共享一个异步 endpoint，却不使用两者的 auth、request body、response 或状态合同。只新增 `grsai`，而不在 Profile 持久化 provider identity，保持 catalog change 的单一 canonical routing 规则。

### 2. endpoint 可精确分类，但不按域名猜测

`classifyEndpoint()` 仅在输入恰为 `/v1/api/generate` 或完整 URL 的相同 path 时返回 `grsai`，并保留 URL 的 base path prefix。输入 `https://grsaiapi.com`、`https://grsai.dakka.com.cn` 或其他 host 根地址本身没有足够 path 事实，保持现有的未分类配置流程。配置 schema 使用既有 base URL canonicalization 和 connection collection；默认 path 固定为 GRSAI contract path，允许用户显式配置经过 validation 的同形 path。

这使已知 endpoint 可被方便导入，同时避免把同一域名的无关接口或兼容服务误路由到 GRSAI。

### 3. Provider 独占 GRSAI wire codec，Application 只拥有执行生命周期

GRSAI adapter 新建独立 config schema、request builder、submit parser、poll parser 和 status mapper。`submit()` 发送：

```json
{
  "model": "<wireModelId>",
  "prompt": "<prompt>",
  "images": ["<URL-or-base64>"],
  "aspectRatio": "<ratio-or-pixel-value>",
  "imageSize": "<1K|2K|4K>",
  "replyType": "async"
}
```

不适用于目标模型的可选字段必须省略，不能以 `null`、空字符串或另一 Provider 字段代替。`images` 只传 GRSAI 合同接受的 URL/base64 values；不支持的本地引用在发起请求前失败。

Provider 从提交 response 取得非空 task ID 并封装为 opaque、secret-free `remoteRef`。Provider 以相同 authenticated connection 调用 result path，将 `running` 映射为 `pending`、`succeeded` 且含至少一个安全 URL 的结果映射为 `completed`、`violation` 和 `failed` 映射为 terminal `failed`。未知 status、缺少 task ID、`succeeded` 缺少安全结果 URL 或无效 JSON 都是 terminal Provider protocol failure。

Application manager 继续保证每个 Job 只提交一次，之后只对同一 `remoteRef` 调用 `poll()`。GRSAI 文档没有 first-poll delay、retry 或 `Retry-After` 合同；adapter 不自创新的 Provider delay/retry directive，使用 foundation 的既有默认 pacing。poll 的 transport/protocol failure 不得导致重提；`AbortSignal` 只停止本地等待和后续查询，不定义远端 cancel。

选择独立 codec，而不是复用 Gemini/OpenAI implementation：它们分别固定了 `:generateContent`/`generationConfig` 或 `data[].url|b64_json`，复用会将不兼容 protocol 隐藏为偶发运行时错误。

### 4. 默认模型模板是可直接执行的 GRSAI 用户起点

Provider 声明以下 12 个 template，每项均有独立 `modelId`/`wireModelId`，并可直接 materialize 为 `UserModelConfig`：

| Template `modelId` | Display name | `baseModelId` |
| --- | --- | --- |
| `nano-banana-fast` | Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` |
| `nano-banana-2` | Nano Banana 2 | `gemini-3.1-flash-image` |
| `nano-banana-2-cl` | Nano Banana 2 CL | `gemini-3.1-flash-image` |
| `nano-banana-2-2k-cl` | Nano Banana 2 2K CL | `gemini-3.1-flash-image` |
| `nano-banana-2-4k-cl` | Nano Banana 2 4K CL | `gemini-3.1-flash-image` |
| `nano-banana-pro` | Nano Banana Pro | `gemini-3-pro-image` |
| `nano-banana-pro-vt` | Nano Banana Pro VT | `gemini-3-pro-image` |
| `nano-banana-pro-cl` | Nano Banana Pro CL | `gemini-3-pro-image` |
| `nano-banana-pro-vip` | Nano Banana Pro VIP | `gemini-3-pro-image` |
| `nano-banana-pro-4k-vip` | Nano Banana Pro 4K VIP | `gemini-3-pro-image` |
| `gpt-image-2` | GPT Image 2 | `gpt-image-2` |
| `gpt-image-2-vip` | GPT Image 2 VIP | `gpt-image-2` |

GRSAI catalog rules 复用已验证的 generic output capability constants，但建立新的 `grsai-generate-image-config` request strategy 和 `appliesToProviders: ["grsai-generate"]`。因此相同 `baseModelId` 不会错误采用 Gemini/OpenAI 的 wire builder。Nano Banana 2 与 Nano Banana Pro families 支持 GRSAI documented `aspectRatio`、`imageSize` 和 image input；Nano Banana 2 variants 额外支持 ultra-wide/tall ratios。`gpt-image-2` 接受 ratio 或 supported pixel preset；`gpt-image-2-vip` 只接受 1K-4K 的 custom pixel geometry，边长最大 3840、每边为 16 的倍数、最大比例 3:1、总像素 655,360 至 8,294,400。capability matrix 必须拒绝合同外 geometry，避免 UI 接受 adapter 无法编码的请求。

模板只由 `grsai-generate` 在新 Profile 创建时提供。完成初始化后，Profile 只有 `UserModelConfig`；模板 inventory 更新不会修改既有 Profile。

### 5. 验证走 deterministic harness，不走真实 GRSAI 或 UXP UI

Provider tests 使用 fake fetch/HTTP transport 固定 submit 与 poll payload/response，覆盖：Bearer header、全部 request field 省略规则、成功、running-to-completed、`violation`/`failed`、malformed body、unsafe result URL 和无重提。catalog tests 覆盖 12 个模板、family geometry、request-strategy isolation。Application/Profile tests 覆盖 `grsai` selection、secret resolution、single-submit lifecycle 及首次模板初始化。运行 affected package tests、`pnpm check:policy` 和 `pnpm validate`；不调用真实 API、Photoshop 或 UXP Developer Tool。

## Risks / Trade-offs

- [GRSAI wire contract 变化] → codec 和 contract tests 局限在 Provider；Application/Core 不依赖任何 GRSAI field。
- [网络中断时远端任务仍运行] → submit 不重放，local abort 不假装远端取消；用户可稍后重新生成，但本 change 不承诺恢复旧任务。
- [`succeeded` 结果 URL 不安全或失效] → 验证 URL 后才 materialize asset，否则终止失败，避免把任意协议/空值交给 asset pipeline。
- [VIP geometry 与 generic GPT Image matrix 不同] → 建立 GRSAI model-specific matrix，不复用现有 OpenAI request strategy。
- [foundation 尚未完成验收] → GRSAI implementation task 依赖其 runtime composition、tests 和 validation 完成，不能将未验收代码作为稳定基线。

## Migration Plan

1. 完成并验收 `add-provider-async-execution-foundation`，包括 Application runtime composition。
2. 完成并验收 `replace-remote-model-discovery-with-local-catalog`，建立一次性模板 materialization。
3. 增加 `grsai` routing、schema、registry、catalog/template inventory 和 fake contract tests。
4. 增加 GRSAI async adapter，接入现有 Application manager，再运行受影响测试与 policy/validation gates。
5. 回滚时移除 `grsai` builtin/routing；未创建的 Profile 不受影响。已创建的 GRSAI Profile 不做自动迁移或删除，保持为用户数据并在 UI 中报告不再支持的 format。

## Open Questions

- 无。首次轮询节奏与 poll budget 采用 async foundation 的既有 default；GRSAI 不提供可冻结的覆盖值。
