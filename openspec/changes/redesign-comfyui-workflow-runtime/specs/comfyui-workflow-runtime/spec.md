## ADDED Requirements

### Requirement: Runtime 必须只持久化单例 server selection 与 revision-scoped mappings
ComfyUI runtime MUST 只持久化一个规范化 `baseUrl`、当前 `selectedWorkflowId`，以及按 workflow revision 归属的显式 Text/Image mapping record。它 MUST NOT 持久化 workflow document、discovery catalog、server capability、class metadata cache 或 Form override value；这些数据 MUST 只存在于 runtime 或 session。Runtime MUST 拒绝 userinfo、query、fragment、control character 与 unsupported scheme，MUST 保留 reverse-proxy path，并对所有 URL candidate 与 setting 设置 bounds。

#### Scenario: 持久化 canonical server 与 selected workflow
- **WHEN** 用户保存合法 server address 并选择一个远程已保存 workflow
- **THEN** runtime MUST 持久化 canonical `baseUrl` 与 `selectedWorkflowId`，并在下个 session 恢复二者

#### Scenario: 按 revision 持久化 mapping
- **WHEN** 用户为 workflow revision `r1` 保存显式 Text 或 Image mapping
- **THEN** runtime MUST 只在 `r1` 下持久化该 mapping，并在 selected workflow revision 改变时丢弃该 mapping 或归一化为 no mapping

#### Scenario: Runtime 与 session 数据不得进入 persistence
- **WHEN** runtime 加载 workflow document、catalog、capability、class metadata 或 Form override
- **THEN** 这些值 MUST 保持为 runtime/session state，且 MUST NOT 写入 durable ComfyUI settings

#### Scenario: 保留安全 reverse-proxy URL
- **WHEN** canonical `baseUrl` 为 `https://example.com/comfyui` 且 runtime 调用 `/prompt`
- **THEN** runtime MUST 请求 `https://example.com/comfyui/prompt`，且 MUST NOT 丢弃 path prefix

### Requirement: Server address 必须只驱动 bounded capability detection
`baseUrl` MUST 只用于 URL normalization 与分离的 API、Frontend、Bridge capability probe。Runtime MUST 在内部保持这些 facts 分离，MUST NOT 从 address 推断 workflow format，并且 MUST 最多向 UI consumer 暴露一个 bounded ComfyUI status projection。

#### Scenario: API ready 但 Frontend unavailable
- **WHEN** API probe 成功而 Frontend 或 Bridge probe 失败
- **THEN** runtime MUST 保留分离的内部 facts，并向 product UI报告无法读取remote workflows的merged status，而不是显示单独的API readiness

#### Scenario: Bare address candidate 选择
- **WHEN** bare host 存在 bounded HTTPS 与 HTTP candidate
- **THEN** runtime MUST 只探测这些 candidate，并持久化第一个通过 ComfyUI capability probe 的 candidate

### Requirement: Discovery 必须列出远程已保存 workflow 且不得暴露 product format label
Workflow discovery MUST 从 ComfyUI saved workflows 请求完整 bounded identity list。Discovery MUST 保持 canonical relative path，且 MUST NOT 加载每个 document、按 contract/operation/binding/output node 过滤、提供 imported-JSON product path，或暴露 Frontend/API format label。详细加载与解析 MUST 只在 selection 后发生。

#### Scenario: 列出 saved workflows
- **WHEN** ComfyUI 返回 bounded saved workflow identities
- **THEN** runtime MUST 按稳定顺序返回所有安全 identity、必要 display metadata 与 relative path

#### Scenario: Discovery 不得预检 document
- **WHEN** 某个 saved workflow 尚未被选择
- **THEN** runtime MUST NOT fetch、parse、构建 Form 或执行 output preflight

#### Scenario: 普通 workflow 保持可发现
- **WHEN** saved workflow 不含 Imagen marker、contract 或 declared operation
- **THEN** runtime MUST 仍将其列入 discovery，且 MUST NOT 显示 format 或 operation classification

### Requirement: API 与 Frontend parser/driver 必须保持 runtime internal
Selection 后，runtime MAY 将 saved document 解析为 API-shaped graph 或 Frontend-shaped graph，并选择对应 internal driver。Parser 与 driver identity MUST NOT 出现在 persisted state、public workflow label、ViewModel contract 或 history projection。Admission MUST 只执行 bounded plain JSON structure、finite value、depth/node/identifier limit、cycle/prototype safety，且 MUST NOT 要求 profile、contract、marker、operation 或固定 input/output binding。

#### Scenario: 内部解析 selected saved workflow
- **WHEN** 用户选择一个 saved workflow
- **THEN** runtime MUST 加载其完整 bounded document、检测 internal shape，并投影一个不暴露 parser 或 format name 的 workflow record

#### Scenario: Ambiguous 或 unsafe document
- **WHEN** selected content 为 mixed、ambiguous、cyclic、non-plain 或超出 configured bounds
- **THEN** runtime MUST fail closed with bounded workflow error，且 MUST NOT 提交

### Requirement: Explicit mappings 与 Form overrides 必须是 optional execution inputs
Runtime MUST 只在 workflow identity 与 revision 仍匹配时应用 persisted mapping。Form edit MUST 是 session-only override。Missing、stale 或 unsupported mapping MUST 归一化为 no mapping，并保留 saved workflow 原值。Composer prompt 与第一张 attachment MAY 覆盖 selected mapping，但 input binding MUST NOT 成为 admission 或 dispatch gate。

#### Scenario: Revision 改变后 mapping stale
- **WHEN** saved Text mapping 引用的 widget 在当前 revision 中不存在或不再 writable
- **THEN** runtime MUST 将其归一化为 no mapping，并保留 workflow current value

#### Scenario: Workflow 忽略 Composer input
- **WHEN** prompt 或 attachment 没有 compatible selected mapping
- **THEN** runtime MUST 使用 workflow saved/Form values 运行完整 workflow，且 MUST NOT 因 missing input 拒绝请求

### Requirement: Native ComfyUI submission 必须是 authoritative 且 one-shot
API-shaped internal driver MUST 恰好执行一次 bounded native `POST /prompt`，并使用 server-issued prompt identity。Frontend-shaped internal driver MUST 打开完整 saved workflow、恢复 session values，并恰好调用一次 native Queue；它 MUST NOT 发起 app-owned `/prompt`。Driver choice MUST 对 ViewModel 与 history contract 不可见。

#### Scenario: API-shaped workflow submission
- **WHEN** selected workflow ready 且通过 local bounds
- **THEN** runtime MUST 发起一次 native `/prompt` submission，并以返回的 prompt identity 继续执行

#### Scenario: Frontend-shaped workflow submission
- **WHEN** selected workflow ready 且已通过 Bridge 打开
- **THEN** runtime MUST 对完整 workflow 调用一次 native Queue，并保持 app-owned `/prompt` count 为零

### Requirement: Output metadata 必须 best-effort，unknown metadata 必须交由 native validation
当所有 bounded candidate 的 class metadata 已知且都不是 output node 时，runtime MAY fail fast。若 class metadata unavailable 或 unknown，runtime MUST 将 output validation 交给 native `/prompt` 或 native Queue，且 MUST NOT 创建 application-side output hard gate。Native `prompt_no_outputs` 与等价 bounded failure MUST 映射为 `invalid-workflow/prompt-no-outputs`，且不得 replay submission。

#### Scenario: Known metadata 证明无 output
- **WHEN** 所有 active node 都有 known metadata 且 `OUTPUT_NODE = False`
- **THEN** runtime MUST fail fast with `invalid-workflow/prompt-no-outputs`，且 native submission count MUST 为零

#### Scenario: Unknown metadata 交给 native
- **WHEN** 至少一个 active node 的 metadata unknown 或 unavailable
- **THEN** runtime MUST 允许 native submission/Queue 决定 validity，且 MUST NOT 仅因 metadata unknown 而禁用 Send

#### Scenario: Native 报告无 outputs
- **WHEN** native validation 返回 `prompt_no_outputs` 或等价 bounded no-output error
- **THEN** runtime MUST 将其映射为 `invalid-workflow/prompt-no-outputs`，且 MUST NOT retry 或 replay 当前 attempt

### Requirement: Runtime error 必须映射为 bounded canonical failure
Runtime MUST 将 parser、capability probe、Bridge、native Queue、`/prompt`、observation、history 与 asset guard failure 映射为 bounded canonical error code、safe message 与 retryability/remote-continuation facts。它 MUST NOT 向 Application/UI 泄漏 raw server payload、stack、workflow document、URL secret-shaped value 或 unbounded custom-node text。

#### Scenario: Native 返回 unbounded error payload
- **WHEN** `/prompt`、Queue 或 history 返回超长或含内部细节的 error payload
- **THEN** runtime MUST 记录 bounded diagnostic evidence，并只向上层返回 canonical code 与 safe bounded message

#### Scenario: Bridge protocol failure
- **WHEN** Bridge command 失败或返回 malformed payload
- **THEN** runtime MUST 将其映射为 bounded Bridge/runtime failure，且 MUST NOT 把 raw payload 投影到 UI

### Requirement: Runtime 必须禁止 replay 已开始的 submission attempt
Native `/prompt` 或 Queue 被调用后，runtime MUST NOT 因 timeout、network error、unknown result 或 adapter identity change 自动 resubmit。新 attempt MUST 由显式新 Application Job 或 execution request 创建。Runtime MAY 只在 native submission boundary 之前执行 bounded transport retry。

#### Scenario: Submission state unknown
- **WHEN** transport result 无法确认 native execution 是否继续
- **THEN** runtime MUST 以 bounded unknown/failure 结束当前 attempt，且 MUST NOT 再次提交

### Requirement: History 必须收集 safe images 并允许 zero-image completion
Execution 成功后，在没有 explicit output mapping 时，runtime/history MUST 按 source 与 image order 收集 `history.outputs[*].images[]` 中全部 bounded safe descriptor。每个 entry MUST 执行 path traversal、type、byte、MIME 与 signature guard；unsafe entry MUST 被跳过并形成 bounded warning。成功 execution 没有 safe image 时 MUST 产生 `outputs: []` 与 completed status；UI MUST 派生 `completed-without-image-output`，并保持 Preview、Download、Place disabled。

#### Scenario: 多个 safe image descriptors
- **WHEN** history 在多个 outputs 中包含多个 safe image descriptors
- **THEN** runtime MUST 保持 descriptor order，并返回全部 safe images

#### Scenario: 成功 execution 没有 images
- **WHEN** native execution 成功但 guards 后没有 safe image
- **THEN** runtime MUST 返回 `outputs: []` 与 completed status，且 MUST NOT 将结果转换为 execution failure

### Requirement: Bridge protocol 必须 bounded 且不含 legacy contract authority
Bridge command MUST 只使用 bounded workflow identity、complete saved-workflow document、Form widget reference 或 Form values。Bridge MAY 保留内部 `reset` 与 `dispose` lifecycle commands，但它们 MUST NOT 成为 Settings actions。Bridge MUST 拒绝 arbitrary script、property path、Task metadata、client identifier、raw image bytes、`ImagenWorkflowBindingContract`、`ImagenWorkflowTypeContract`、schema version/digest 与 `sdppp_*` payload。Unknown command MUST fail closed with bounded protocol error。

#### Scenario: Internal reset 不进入产品 UI
- **WHEN** runtime 在cleanup期间调用bounded `reset` 或 `dispose`
- **THEN** Bridge MUST 执行对应lifecycle cleanup，且Settings MUST NOT显示Reset action

#### Scenario: Handshake 不含 schema authority
- **WHEN** Bridge 返回 handshake capabilities
- **THEN** payload MUST omit contract schema version、SHA-256 digest 与 contract summary

#### Scenario: Unknown command
- **WHEN** Bridge 收到 fixed workflow lifecycle allowlist 之外的 command
- **THEN** Bridge MUST 拒绝该 command，且 MUST NOT 执行 host operation

### Requirement: Mask 与 custom-node handling 必须继续延后
Mask-specific Photoshop capture/materialization、mask binding 与 live/UXP validation MUST 保持在 admission 和 dispatch gate 之外。包含 mask 或 custom node 的 saved workflow MUST 保留原值，除非存在 explicit supported override，并 MUST 交给 ComfyUI native validation。

#### Scenario: Saved workflow 包含 mask 或 custom node
- **WHEN** selected workflow 包含 mask 或 custom nodes
- **THEN** runtime MUST admit 并尝试完整 workflow，且 MUST NOT 增加 mask-specific gate
