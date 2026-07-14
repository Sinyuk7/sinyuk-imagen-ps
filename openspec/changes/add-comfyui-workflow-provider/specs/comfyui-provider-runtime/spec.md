## ADDED Requirements

### Requirement: ComfyUI profile connection
系统 MUST 将 `apiFormat: 'comfyui'` profile 解析为独立 ComfyUI Provider config；v1 config MUST 使用 manual selection 且恰好包含一个启用 endpoint，并且 MUST NOT 要求 API Key 或复用其他 API format 的 path/model hint。

#### Scenario: 保存本机 ComfyUI profile
- **WHEN** 用户保存 `http://127.0.0.1:8188` 作为 ComfyUI base URL
- **THEN** 系统保存一个 manual、single-endpoint、无 secret 要求的 profile config

#### Scenario: 拒绝 ComfyUI auto failover
- **WHEN** ComfyUI profile 配置 auto selection 或多个启用 endpoint
- **THEN** config validation MUST 在任何网络请求前失败

### Requirement: Safe ComfyUI protocol probe
Provider MUST 使用无生成副作用的 bounded object-info request 测试连接，并 MUST 区分 endpoint unreachable、protocol mismatch 与 verified ComfyUI response。

#### Scenario: ComfyUI protocol probe 成功
- **WHEN** endpoint 返回符合契约的 `LoadImage` 与 `SaveImage` object info
- **THEN** connection test MUST 返回 verified 且 MUST NOT 提交 `/prompt`

#### Scenario: 普通 HTTP 服务不是 ComfyUI
- **WHEN** endpoint 可连接但 object-info response 不符合 ComfyUI contract
- **THEN** connection test MUST 返回 protocol mismatch，而不是 verified

### Requirement: Invocation-scoped input upload and prompt submission
Provider MUST 为每次 invoke 使用唯一 `client_id` 和 upload subfolder，逐张上传 ordered images，采用每次 upload response 返回的 server reference，clone persisted workflow 后注入输入，并向同一 endpoint 提交 `/prompt`。

#### Scenario: 服务端重命名上传文件
- **WHEN** `/upload/image` response 的 `name` 不同于客户端 filename
- **THEN** Provider MUST 把 response reference 写入对应 `LoadImage.inputs.image`

#### Scenario: ordered reference images
- **WHEN** canonical request 包含 primary image 和两张 reference images
- **THEN** Provider MUST 按 `images[0..2]` 顺序上传并绑定到 `IMAGEN_PS_IMAGE_1..3`

### Requirement: Prompt completion polling
Provider MUST 使用 validated `executionTimeoutMs`、`pollIntervalMs`、`maxPollIntervalMs` 与 bounded backoff 查询 `/history/{prompt_id}`。designated output 出现时成功；history 明确 error，或 completed 但 designated output 缺失时失败；达到 timeout 时返回 timeout error；caller abort 时使用现有 abort error mapping。v1 MUST NOT 依赖 WebSocket，MUST NOT 调用全局 `/interrupt`。

#### Scenario: History 由 pending 进入 completed
- **WHEN** history 前两次没有 terminal output，后一次包含 designated output
- **THEN** Provider MUST 继续 polling，并在 terminal response 后解析结果

#### Scenario: Caller 在 prompt accepted 后取消
- **WHEN** `/prompt` 已返回 `prompt_id`，随后 `AbortSignal` 触发
- **THEN** Provider MUST 停止后续 polling/download，MUST NOT 自动重放 prompt，并 MUST NOT 调用全局 `/interrupt`

#### Scenario: History completed 但没有 designated output
- **WHEN** history 声明 execution completed，但没有 designated output images
- **THEN** Provider MUST 立即返回 normalized execution error，MUST NOT 一直 polling 到 timeout

### Requirement: Designated image result download
Provider MUST 只读取 normalized contract 指定 node 的 non-empty `images[]`。`filename` MUST 是不含 `/`、`\\`、NUL 且不等于 `.` / `..` 的 basename；`subfolder` MUST 是无 absolute/parent/backslash/NUL segment 的 relative path；v1 `type` MUST 是 `output`。Provider MUST 用 encoded query 调用 `/view`，只接受 `image/png` 且单项不超过 configured `maxOutputBytes`，再归一化为 ordered `ProviderInvokeResult.assets[]`；其他 output MUST 被忽略。

#### Scenario: 单一 designated node 返回多图
- **WHEN** designated `SaveImage` history output 包含三项 `images[]`
- **THEN** Provider MUST 按数组顺序返回三项 assets

#### Scenario: 其他 output 同时返回图片
- **WHEN** history 同时包含 designated output 与未标记 `SaveImage` / `PreviewImage` output
- **THEN** Provider MUST 只下载 designated output 的图片

#### Scenario: Designated output 没有图片
- **WHEN** terminal history 缺少 designated node 或其 `images[]` 为空
- **THEN** Provider MUST 返回 normalized provider execution error

#### Scenario: History descriptor 包含 path traversal
- **WHEN** `filename` 或 `subfolder` 包含 absolute、parent、backslash 或 NUL traversal shape
- **THEN** Provider MUST 在 `/view` 前拒绝该 descriptor

#### Scenario: 下载不是 bounded PNG
- **WHEN** `/view` 返回非 `image/png` content type 或超过 `maxOutputBytes`
- **THEN** Provider MUST 中止该 invocation 并返回 safe response validation error

### Requirement: No ambiguous retry after side effects
Provider MUST 声明 ComfyUI invocation 不支持可靠 idempotency；首次 upload 开始后，network/timeout/5xx ambiguity MUST NOT 触发 automatic endpoint failover 或 prompt replay。

#### Scenario: Prompt submit response 丢失
- **WHEN** `/prompt` request 可能已被接受但客户端收到 network error
- **THEN** Provider MUST 返回 ambiguous invocation error，MUST NOT 自动再次提交 workflow
