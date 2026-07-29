## ADDED Requirements

### Requirement: GRSAI is a distinct routable ApiFormat
系统 SHALL 支持 `ApiFormat` 值 `grsai`，并 SHALL 将其唯一映射到 builtin `ProviderImplementationId` `grsai-generate`。`grsai-generate` SHALL 声明 `invokeMode: "async"` 和完整 `ProviderAsyncLifecycle`。Profile 保存、draft validation、secret resolution、builtin registry、execution routing 与 UI label SHALL 接受该 format，并 SHALL 拒绝 `grsai` config 与其他 implementation 或其他 `ApiFormat` 的组合。

#### Scenario: 保存 GRSAI Profile
- **WHEN** 用户提交包含有效 connection、API key secret reference 与 `apiFormat: "grsai"` 的 Profile
- **THEN** 系统 SHALL 将其路由到 `grsai-generate`，且 SHALL 不要求用户选择另一 Provider implementation

#### Scenario: registry 发现错误的 GRSAI descriptor
- **WHEN** registry 注册的 descriptor 为 `grsai`，但其 implementation id 不是 `grsai-generate`、或 async lifecycle 与 `invokeMode` 不一致
- **THEN** 系统 SHALL 拒绝注册该 descriptor

### Requirement: GRSAI configuration and endpoint classification are exact
系统 SHALL 使用 Bearer API key authentication、既有 connection collection 和经 canonicalization 的 HTTP(S) base URL 配置 GRSAI。默认 paths SHALL 为 submit `/v1/api/generate` 和 result `/v1/api/result`。系统 SHALL 将精确匹配 `/v1/api/generate` 的 full endpoint URL 或 path 分类为 `grsai`，并 SHALL 保留完整 URL 的 base path prefix；系统 SHALL NOT 仅按 `grsaiapi.com`、`grsai.dakka.com.cn` 或任何域名根地址推断 `grsai`。

#### Scenario: 导入精确 GRSAI 生成 endpoint
- **WHEN** 用户输入 `https://grsaiapi.com/v1/api/generate`
- **THEN** 系统 SHALL 分类为 `grsai`、将 base URL 归一化为 `https://grsaiapi.com/`，并使用默认 submit/result paths

#### Scenario: 输入 GRSAI 域名根地址
- **WHEN** 用户只输入 `https://grsai.dakka.com.cn`
- **THEN** 系统 SHALL NOT 仅凭该域名分类为 `grsai`

### Requirement: GRSAI submission uses its documented async wire contract
`grsai-generate` SHALL 以 `POST` 向 configured submit path 发送 `Authorization: Bearer <API key>` 与 JSON body。body SHALL 包含 resolved `model`、non-empty `prompt` 和 `replyType: "async"`；有可传递 reference image 时 SHALL 以 `images` 传 URL 或 base64 value；有适用 output selection 时 SHALL 以 `aspectRatio` 和/或 `imageSize` 传其 GRSAI wire value。adapter SHALL 省略不适用于目标模型的字段，并 SHALL NOT 发送 Gemini/OpenAI-specific fields。

#### Scenario: 提交 Nano Banana 2 图像编辑请求
- **WHEN** 已解析的 `nano-banana-2` request 包含 prompt、一个可传递 reference image、`16:9` 与 `2K` output
- **THEN** adapter SHALL 提交包含 `model: "nano-banana-2"`、prompt、`images`、`aspectRatio: "16:9"`、`imageSize: "2K"` 与 `replyType: "async"` 的 JSON body

#### Scenario: 提交不适用 imageSize 的 GPT Image VIP 请求
- **WHEN** 已解析的 `gpt-image-2-vip` request 指定合法 custom pixel geometry
- **THEN** adapter SHALL 将 geometry 作为 GRSAI `aspectRatio` pixel value 传递，且 SHALL NOT 发送 `imageSize`

### Requirement: GRSAI polling is provider-local and submit-once
adapter SHALL 从有效 submit response 提取非空 remote task ID，并作为 opaque、secret-free `remoteRef` 交给 async foundation。对于同一 logical Job，Application manager SHALL 至多调用一次 GRSAI `submit()`，之后只 SHALL 使用同一 `remoteRef` 以 authenticated `GET <result-path>?id=<task-id>` 调用 `poll()`。adapter SHALL 映射 `running` 为 canonical `pending`；映射具有至少一个安全 HTTP(S) result URL 的 `succeeded` 为 `completed`；映射 `violation` 或 `failed` 为 terminal `failed`。未知/缺失 status、无 task ID、无效 JSON、`succeeded` 无安全结果 URL 都 SHALL 是 terminal Provider protocol failure。

#### Scenario: running 任务随后成功
- **WHEN** submit 返回 task ID、首次 result response 为 `running`，下一次同一 task ID 的 result response 为带 URL results 的 `succeeded`
- **THEN** lifecycle SHALL 依次输出 `pending` 和 `completed`，且 submit transport SHALL 只被调用一次

#### Scenario: GRSAI 拒绝任务
- **WHEN** result response 的 status 为 `violation` 或 `failed`
- **THEN** lifecycle SHALL 输出 terminal `failed`，且 SHALL NOT 再提交或继续轮询

#### Scenario: 本地 abort
- **WHEN** 远端任务处于 `pending` 时 local `AbortSignal` 被触发
- **THEN** manager SHALL 停止本地等待和后续 poll，且 SHALL NOT 重提或调用未定义的 GRSAI cancel endpoint

### Requirement: GRSAI streaming and remote cancellation are excluded
adapter SHALL NOT 使用 `replyType: "json"` 或 `replyType: "stream"`，SHALL NOT 解析 stream framing，且 SHALL NOT 调用远端取消接口。poll cadence 和 budget SHALL 使用 async foundation 已定义的 default policy，GRSAI adapter SHALL NOT 发明未由 GRSAI 合同提供的 Provider-specific retry 或 delay directive。

#### Scenario: 普通生成执行
- **WHEN** 用户在 GRSAI Profile 上开始生成
- **THEN** adapter SHALL 使用 `replyType: "async"`，并由 async foundation 执行后续 polling
