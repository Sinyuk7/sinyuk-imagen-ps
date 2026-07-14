## ADDED Requirements

### Requirement: ComfyUI connection 必须是独立 singleton config
Application MUST 在 Provider Profile repository之外持久化一个 `ComfyUiConnectionConfig`，至少包含 `connectionId: 'default'`、display name、enabled、canonical `origin`、request timeout、execution timeout、WebSocket connect timeout、reconciliation interval/timeout与 timestamps。它 MUST NOT 包含 Provider API format、secret collection、endpoint failover、model discovery、billing、revision或 `clientId`。

#### Scenario: Save first connection
- **WHEN** 用户保存合法 ComfyUI origin与 timings
- **THEN** Application MUST 独立持久化 singleton config，Provider Profile repository MUST 保持不变

#### Scenario: Attempt second connection
- **WHEN** caller尝试保存非 `default` connection ID
- **THEN** Application MUST 拒绝保存

### Requirement: Connection 必须只接受 HTTP(S) origin
Origin MUST 符合 `scheme://host[:port]`，允许 HTTP(S)、localhost、loopback与 LAN IP。Validator MUST 拒绝 non-root path、query、fragment、username/password与 unsupported scheme。Endpoint routes MUST 从 fixed origin构造；HTTP(S) origin MUST 分别派生 `ws://` 或 `wss://`，v1 MUST NOT 支持 reverse-proxy base path。

#### Scenario: Local ComfyUI origin
- **WHEN** 用户保存 `http://127.0.0.1:8188`
- **THEN** config MUST 保存 canonical origin并派生 `ws://127.0.0.1:8188/ws`

#### Scenario: Origin contains path
- **WHEN** 用户输入 `http://host:8188/comfy`
- **THEN** validation MUST 拒绝保存

#### Scenario: Origin contains credentials
- **WHEN** origin包含 username/password
- **THEN** validation MUST 拒绝且 error/log MUST NOT 回显 credentials

### Requirement: Timing value objects 必须区分正常执行与 reconciliation
Request timeout、execution timeout、WS connect timeout、reconciliation interval与 reconciliation timeout MUST 是有界正数。Normal WebSocket lifecycle MUST NOT 使用 fixed polling interval；reconciliation timings MUST 只用于 socket unavailable/disconnected、terminal history尚未可见或 submission uncertainty。Shared code MAY 复用中立 duration value objects，MUST NOT 复用 Provider endpoint selection/failover config。

#### Scenario: Invalid reconciliation timing
- **WHEN** reconciliation interval为零、负数或超过 reconciliation timeout
- **THEN** config validation MUST 拒绝保存

### Requirement: Connection test 必须固定使用 bounded /system_stats
Test Connection MUST 只发送 bounded `GET /system_stats`，验证 HTTP success、JSON body、`system` object与 `devices` array。它 MUST 使用 request timeout与 response byte limit，MUST NOT 请求 `/object_info`、创建 WebSocket、upload、prompt、queue/history mutation、interrupt或 delete。

#### Scenario: Valid ComfyUI stats
- **WHEN** `/system_stats` 返回 bounded `{ system: {...}, devices: [...] }`
- **THEN** probe MUST 返回 success且 remote mutation spies为零

#### Scenario: Generic HTTP server
- **WHEN** endpoint返回 HTTP 200但 body不符合 minimal stats shape
- **THEN** probe MUST 返回 `protocol-mismatch`

### Requirement: Workflow node validation 必须与 connection probe 分离
Workflow node-schema validation MAY 按需读取 bounded `/object_info/{class}`，MUST NOT 成为 Test Connection的一部分。该 validation最多证明 node class与 basic schema存在，不保证 model files、custom dependencies、GPU/VRAM或 execution success。

#### Scenario: Server has many custom nodes
- **WHEN** 用户只执行 Test Connection
- **THEN** client MUST NOT下载完整 `/object_info`

### Requirement: Connection-scoped realtime channel 必须使用 ephemeral identity
Runtime MUST 为 active connection origin维护 shared WebSocket channel与 ephemeral `clientId`。`clientId` MUST 用于 `/ws?clientId=...` 与关联 `/prompt` request，但 MUST NOT 进入 route、execution plan、connection/workflow config、Task、History或 logs。Channel lifecycle MUST 支持 prompt-scoped subscriptions、panel reload/destroy cleanup、connection切换与 idle cleanup。

#### Scenario: Two prompt subscriptions
- **WHEN** 同一 channel订阅两个 prompt IDs
- **THEN** event router MUST 只把每个 prompt的 event交给对应 listener

#### Scenario: Panel reload
- **WHEN** Photoshop panel reload或 runtime destroy
- **THEN** channel MUST unsubscribe listeners并关闭 local socket，MUST NOT 声称 remote prompts已取消

### Requirement: Transport errors 必须可区分
Normalized transport cause MUST 至少区分 `server-unreachable`、`uxp-network-permission-denied`、`browser-cors-blocked`、`browser-mixed-content-blocked`、`websocket-connect-failed`、`websocket-disconnected`、`protocol-mismatch`、`request-timeout` 与 `execution-timeout`。App MUST NOT 全部显示为“连接失败”；raw endpoint、auth、HTTP/WS payload或 response body MUST NOT 进入 durable history。

#### Scenario: Browser mixed-content rejection
- **WHEN** HTTPS Chrome shell被阻止连接 HTTP/`ws://` origin
- **THEN** normalized cause MUST 是 `browser-mixed-content-blocked`

#### Scenario: UXP permission denial
- **WHEN** Photoshop UXP manifest/network permission阻止 HTTP或 WS endpoint
- **THEN** normalized cause MUST 是 `uxp-network-permission-denied`

### Requirement: UXP 与 Chrome transport 必须先通过真实 acceptance gate
Connection slice MUST 在继续 workflow execution实现前验证真实 transport。UXP matrix MUST 覆盖 manifest permission、`127.0.0.1`、localhost、自定义端口、LAN IP、HTTP、`ws://` handshake、multipart、Blob、timeout、close/error、one reconnect、panel reload cleanup与大图传输。Chrome matrix MUST 覆盖 CORS/WS origin、localhost/LAN、mixed content、multipart、Blob、timeout、tab/background lifecycle与 fallback HTTP。Build与 fake tests MUST NOT 被描述为真实 host proof。

#### Scenario: UXP endpoint range fails
- **WHEN** 真实 Photoshop host不能访问产品承诺的某类 endpoint
- **THEN** implementation MUST 停止后续 execution slice并先收窄 manifest/config/endpoint contract

### Requirement: Settings 必须拥有独立 connection editing
App MUST 提供独立 ComfyUI settings entry、origin/timing editor与 Test Connection。它 MUST NOT 复用 Provider Profile editor、model editor、API format selector、endpoint failover editor或 billing UI。

#### Scenario: Open ComfyUI settings
- **WHEN** 用户进入 ComfyUI Settings
- **THEN** App MUST 展示 connection与 workflows入口，MUST NOT 创建 Provider Profile

### Requirement: Shared layers 不得接收 host file identity
App/Host MUST 把 file、Photoshop document/layer/selection materialize为 host-neutral AssetRefs。Application、queue与 execution backend package MUST NOT 接收 DOM `File`、UXP entry、native path或 Photoshop DOM object。

#### Scenario: UXP image input
- **WHEN** 用户提交 Photoshop selection或 document
- **THEN** Host MUST 先写入 AssetStore，再把 opaque AssetRef交给 admission

### Requirement: 删除 connection 不得删除 workflows或 admitted plans
删除 singleton connection MUST 阻止新 ComfyUI admission并清理 current channel，但 MUST NOT 删除 workflow configs。Already admitted plan MUST 继续使用其 origin snapshot；channel manager MUST 为该 snapshot提供 execution context或明确 local failure，不得改用新 origin。

#### Scenario: Delete connection with queued task
- **WHEN** connection被删除且已有 admitted queued task
- **THEN** workflow repository MUST 保持不变，queued task MUST NOT静默改用其他 endpoint
