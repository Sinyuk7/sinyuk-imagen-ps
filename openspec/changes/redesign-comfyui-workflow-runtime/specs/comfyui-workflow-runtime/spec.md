## ADDED Requirements

### Requirement: ComfyUI runtime 必须以单例 `baseUrl` 为唯一 server setting
ComfyUI runtime MUST 只持有一个持久化 `baseUrl` 与少量 bounded runtime settings。它 MUST 接受显式 HTTP(S) URL 或 bare host/IP/port/path；对 bare address MUST 构造 bounded HTTPS/HTTP candidates，并持久化第一个通过 ComfyUI capability probe 的 canonical URL。它 MUST 规范化 origin 与可保留的 reverse-proxy path，MUST 拒绝 userinfo、query、fragment、control chars 与 unsupported scheme，且 MUST 不再依赖 `connectionId`、profile list 或多 connection repository。

#### Scenario: 保存合法 baseUrl
- **WHEN**用户保存一个可解析的 HTTP(S) server address
- **THEN**runtime MUST 持久化 canonical `baseUrl`，并在后续 probe 与 submission 中复用它

#### Scenario: 解析 bare address
- **WHEN** 用户保存没有 scheme 的 host、IP、port 或 path
- **THEN** runtime MUST 只探测 bounded HTTPS/HTTP candidates，并持久化第一个通过 ComfyUI capability probe 的 canonical `baseUrl`

#### Scenario: 保留 reverse-proxy path
- **WHEN** canonical `baseUrl` 包含 reverse-proxy path prefix
- **THEN** runtime MUST 使用 base-path-preserving join 构造 API route，且 MUST NOT 用 root-relative URL 丢弃该 prefix

#### Scenario: 拒绝 secret-shaped URL
- **WHEN**`baseUrl` 包含 username、password、query、fragment 或非 HTTP(S) scheme
- **THEN**保存 MUST fail closed，且 MUST 不暴露 secret-shaped 值

### Requirement: Server address 必须只负责 capability detection
`baseUrl` MUST 只用于 URL normalization 与 capability detection。runtime MUST probe API readiness、Frontend readiness 与 Bridge compatibility 作为分离的 bounded facts；它 MUST NOT 把 server address 误判为 workflow format，也 MUST NOT 用单一 probe 代替其它 capability 证据。

#### Scenario: API ready 但 Frontend unavailable
- **WHEN**API probe 成功而 Frontend/Bridge probe 失败
- **THEN**runtime MUST 记录分离的 capability facts，且 MUST 不把整个 server 标记为不可用

#### Scenario: baseUrl 不是 workflow format
- **WHEN**用户输入的 server address 指向 ComfyUI 站点
- **THEN**runtime MUST 仍把它当作 server setting，而不是 workflow document

### Requirement: Workflow format detection 必须结构化且 fail closed
Workflow import/load MUST 自动识别 Frontend Save Format 与 API Format。Detection MUST 基于 document shape 与 bounded metadata，而不是 workflow name、profile、operation 或 marker contract；ambiguous、mixed 或 unsupported shape MUST fail closed。

#### Scenario: Frontend Save Format
- **WHEN**导入一个包含 Frontend workflow shape 的 document
- **THEN**runtime MUST 将其识别为 Frontend Format 并进入 workflow record

#### Scenario: API Format
- **WHEN**导入一个包含 API workflow shape 的 document
- **THEN**runtime MUST 将其识别为 API Format 并进入 workflow record

#### Scenario: 混合或歧义 shape
- **WHEN**document 同时表现出 Frontend 与 API 结构特征
- **THEN**runtime MUST 拒绝该输入而不猜测 format

### Requirement: Discovery 必须返回完整 bounded identity list
Workflow discovery MUST 先返回完整 bounded identity list，MUST 不逐个加载 workflow document，也 MUST 不在 discovery 阶段按 contract、operation、binding 或 output-node 过滤。Discovery response MUST 只包含 bounded identity 与必要 summary，且 MUST 保持 canonical relative path。

#### Scenario: 发现远程 workflow
- **WHEN**Bridge 返回一个合法 remote workflow path
- **THEN**runtime MUST 将其作为 identity list item 保存，而不是立即加载全文

#### Scenario: Discovery 不得 contract-filter
- **WHEN**remote list 中包含未绑定、未解析或不含 Imagen marker 的 workflow
- **THEN**runtime MUST 仍把它们列出，且 MUST 不在 discovery 阶段过滤掉

### Requirement: Selected workflow load 必须在 selection 后发生
Selected workflow 的详细 load、解析、form 构建与 current value projection MUST 只在用户选择该 workflow 后发生。runtime MUST 对 selected workflow 维持 load identity/revision cache，并且 MUST 不在 list 阶段预先展开全部 workflow。

#### Scenario: 选择某个 workflow
- **WHEN**用户点选一个 workflow identity
- **THEN**runtime MUST 加载该 workflow 的详细结构与 current values，并保留 selected workflow cache

#### Scenario: 未选择 workflow
- **WHEN**用户尚未选择任何 workflow
- **THEN**runtime MUST 不构建详细 form，也不尝试加载 selected workflow 内容

### Requirement: Admission 必须只保留结构与安全边界
Workflow admission MUST 只验证结构、安全边界与 bounded JSON properties。它 MUST 保留 2MB、2000 nodes、depth、bounded ids/class names、plain JSON、finite values、no cycle/no prototype 之类的安全限制；它 MUST 删除对 contract/profile/operation/marker node 的强制假设。

#### Scenario: 安全边界通过
- **WHEN**workflow document 满足 bounded JSON 与结构限制
- **THEN**runtime MUST 允许其进入 workflow record，即使它不含 Imagen contract marker

#### Scenario: 超出 bounds
- **WHEN**workflow document 超过 size、node count 或 id/class bounds
- **THEN**runtime MUST 拒绝该 workflow 而不继续解析

#### Scenario: 不含预声明 operation
- **WHEN**workflow 没有 `text-to-image` 或 `image-edit` 之类预声明 operation
- **THEN**runtime MUST 仍接受其为合法 workflow candidates

### Requirement: OUTPUT_NODE preflight 必须在 send-time 执行
Send-time preflight MUST 将 selected workflow 转成 canonical API prompt representation，并在 dispatch 前验证至少一个 active node 的 class metadata 声明 `OUTPUT_NODE = True`。没有 output node 时 MUST 返回 `invalid-workflow/prompt-no-outputs`，且 MUST 不发起 submission。

#### Scenario: workflow 有 output node
- **WHEN**selected workflow 含有至少一个 active output node
- **THEN**runtime MUST 允许进入 submission preflight

#### Scenario: workflow 没有 output node
- **WHEN**selected workflow 不含任何 active output node
- **THEN**runtime MUST fail closed with `invalid-workflow/prompt-no-outputs`

### Requirement: Complete workflow submission 必须保持 one-shot
API Format driver MUST 执行单次 bounded POST；Frontend driver MUST 打开完整 workflow、恢复 selected values、应用 overrides 并通过 native Queue 一次提交。两种 driver 的差异 MUST 留在 runtime 内部，view model 或 history projection MUST 不感知 driver 分支。

#### Scenario: API workflow 提交
- **WHEN**selected workflow 是 API Format
- **THEN**runtime MUST 只执行一次 bounded API submission，并继续以 known prompt/result chain 收敛

#### Scenario: Frontend workflow 提交
- **WHEN**selected workflow 是 Frontend Format
- **THEN**runtime MUST 打开完整 workflow 并通过 native Queue 一次提交

### Requirement: Runtime 必须禁止 replay 作为默认行为
One-shot submission 之后，runtime MUST NOT 因 timeout、network error、unknown result 或 adapter identity 自动 replay。任何新的 attempt MUST 由 Application 显式创建新 Job 或新 execution request；runtime MAY 只做同一次 Job 内 bounded transport retry。

#### Scenario: submission state unknown
- **WHEN**remote execution 结果无法确认
- **THEN**runtime MUST 终止当前 attempt 且 MUST 不自动重放

#### Scenario: network error
- **WHEN**submission 期间发生 network error
- **THEN**runtime MUST 把它收敛为 bounded failure，而不是再次隐式提交

### Requirement: History collection 必须收集全部 safe `history.outputs[*].images[]`
当没有 explicit output binding 时，runtime/history projection MUST 遍历所有 bounded `history.outputs[*].images[]` descriptor 并收集全部安全图片。collection MUST 保持 entry order 与 image order，且 MUST 对每个条目执行 path traversal、type、bytes、MIME 与 signature guards；unsafe entry MUST 跳过并形成 bounded warning。

#### Scenario: 多个 safe image outputs
- **WHEN**history 返回多个安全 `images[]` descriptor
- **THEN**runtime MUST 收集全部图片并保持原始顺序

#### Scenario: unsafe image output
- **WHEN**某个 descriptor 含有 unsafe path 或 bounded guard 不通过
- **THEN**runtime MUST 跳过该条目而不影响其它安全图片

### Requirement: Completed empty outputs 必须是合法终态
如果 remote execution 成功但没有任何安全图片，runtime MUST 允许 `outputs: []`，并将该 Task/Job 投影为 `completed`。UI projection MUST 从 `completed && outputs.length === 0` 派生 `completed-without-image-output`，但 runtime MUST 不把该结果伪装成失败。

#### Scenario: 成功但无图
- **WHEN**remote execution 成功且没有安全图片
- **THEN**runtime MUST 返回 empty outputs，并允许 completed 终态

#### Scenario: UI 投影
- **WHEN**completed result 的 outputs 为空
- **THEN**UI projection MUST 显示 `completed-without-image-output`，且 Preview、Download 与 Place actions MUST 保持 disabled

### Requirement: Mask 必须延后处理且不能阻塞 admission
mask-specific Photoshop capture/materialization、mask binding 与 mask live/UXP validation MUST 继续延后。workflow 包含 mask 或 custom nodes 本身 MUST NOT 成为 admission 拒绝条件；没有 explicit supported override 时，runtime MUST 保留 workflow 原有 mask/custom-node values，并把 graph 交给 ComfyUI 原生验证。

#### Scenario: workflow 含 mask node
- **WHEN**selected workflow 含有 mask 或 custom node
- **THEN**runtime MUST 仍允许其通过 discovery/admission

#### Scenario: mask 当前未 materialize
- **WHEN** 当前 implementation 没有 Photoshop mask-specific materializer 或 binding
- **THEN** runtime MUST 保留 workflow 原值，且 MUST NOT 因此增加 admission 或 Send gate
