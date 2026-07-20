## ADDED Requirements

### Requirement: Mask execution SHALL use an explicit capability plan
系统 SHALL 根据 selected model/API format 或 selected ComfyUI Workflow revision，把 ready canonical Edit Region 解析为显式 `MaskExecutionPlan`。Plan SHALL 区分 `none`、`provider-native`、`comfyui-separate-image-input`、`semantic-only` 与 `unsupported`，不得使用单一 boolean 或 Provider name heuristic。

#### Scenario: Resolve native OpenAI image Mask
- **WHEN** selected model capability 声明 first-input native raster Mask、same-dimension PNG 和 Provider byte limit
- **THEN** planner 返回 `provider-native`，并携带所需 transport 与 polarity

#### Scenario: Resolve Gemini semantic-only editing
- **WHEN** selected API format 为不提供独立 raster Mask wire field 的 Gemini Generate Content
- **THEN** planner 返回 `semantic-only`，不得把 canonical Mask 追加为普通 reference image

#### Scenario: Resolve ComfyUI explicit binding
- **WHEN** selected Workflow revision 保存了有效 `separate-image-input` Mask binding
- **THEN** planner 返回 `comfyui-separate-image-input`，并携带 exact `WorkflowInputRef` 与 polarity

#### Scenario: Workflow has no Mask binding
- **WHEN** ready Edit Region 存在，但 selected Workflow revision 没有有效 Mask binding
- **THEN** planner 返回 `unsupported`，UI 禁用 Mask 开关，后续无 Mask request 仍可提交

### Requirement: Request construction SHALL consume an immutable prepared snapshot
Composer SHALL 在 submit 前冻结 attachments、Primary、ready Edit Region、output 与 placement 为 immutable generation input。Provider/ComfyUI request builder SHALL 只消费该 snapshot，不得查询 `MaskCoordinator` 或 Photoshop Host。

#### Scenario: Primary changes after submit snapshot creation
- **WHEN** submit snapshot 已冻结，随后 Composer Primary 或 Mask state 变化
- **THEN** 已接受 Task 继续使用冻结 snapshot，后续 UI state 不得改变该 request

#### Scenario: No ready Edit Region exists
- **WHEN** effective state 为 `disabled`、`no-primary` 或 `none`
- **THEN** request 不包含 Mask execution input，且不得产生 placeholder Mask

### Requirement: Mask availability SHALL follow execution capability
当 selected model/API format 或 selected ComfyUI Workflow revision 的 plan 为 `semantic-only` 或 `unsupported` 时，UI SHALL 禁用 Mask 开关。系统 SHALL 保留已有 `maskPreference` 供用户切回支持的执行目标时重新 reconcile，但该执行目标的 generation input SHALL 省略 Mask。

#### Scenario: User switches to an unsupported model
- **WHEN** ready Edit Region 存在，用户选择不支持 raster Mask 的 model
- **THEN** UI 禁用 Mask 开关，request 不包含 Mask，并按原本无 Mask image-edit 路径提交

#### Scenario: User switches back to a supported model
- **WHEN** 原 `maskPreference` 已启用，随后用户从不支持 Mask 的执行目标切回支持的目标
- **THEN** UI 重新允许 Mask，并对当前 Photoshop Primary 重新 reconcile

### Requirement: Unavailable Mask transport SHALL omit Mask safely
当 runtime 仍向 `semantic-only` 或 `unsupported` transport 传入 ready Edit Region 时，request construction SHALL 省略 Mask 并继续构造原本无 Mask request。系统不得把 Mask 作为普通 reference image、prompt 文本或未声明的 Workflow input。

#### Scenario: Chat-image transport receives a Mask
- **WHEN** chat-image request construction 收到 ready Edit Region 或 `maskImage`
- **THEN** builder 省略 Mask，并且不得插入“Use the following image as the edit mask”或把 Mask 作为普通 image part

### Requirement: Native Provider Mask SHALL target only the Primary Image
`provider-native` plan SHALL 将 Mask 绑定到 `images[0]`，并 SHALL 验证 `targetAttachmentId` 对应提交 snapshot 的 Primary、Mask dimensions 与 Primary provider-input dimensions 完全一致。

#### Scenario: Valid Primary Mask dispatch
- **WHEN** Edit Region target 匹配 `images[0]`，且 dimensions 与 capability preflight 均通过
- **THEN** Provider request 包含一个 native Mask field，reference images 保持原顺序和数量

#### Scenario: Target does not match first image
- **WHEN** Edit Region `targetAttachmentId` 不等于提交 snapshot 的 Primary id
- **THEN** admission 拒绝请求，且不得尝试按 attachment index 重新绑定

#### Scenario: Image and Mask dimensions differ
- **WHEN** Primary provider-input 为 100x100，而 Mask 为 1000x1000
- **THEN** Provider preflight 拒绝请求，且不得 resize、crop 或发送该 Mask

### Requirement: OpenAI Adapter SHALL convert canonical polarity at the transport boundary
OpenAI image endpoint Adapter SHALL 将 canonical grayscale `white-edit` Mask 转换成 capability 要求的 PNG/alpha polarity，并 SHALL 在转换后验证 format、dimensions 与 byte limit。该转换不得修改公共 canonical asset。

#### Scenario: Convert white-edit coverage to alpha-zero-edit
- **WHEN** canonical Mask pixel values为 0、128、255，native capability 要求 `alpha-zero-edit`
- **THEN** transport Mask alpha 值分别为 255、127、0，RGB 使用固定值，且 geometry 不变

#### Scenario: Converted PNG exceeds Provider limit
- **WHEN** 无损转换后的 Mask 超过 selected capability 的 max bytes
- **THEN** Adapter 返回 structured validation error，且不得通过缩小 Mask 规避限制

### Requirement: Provider presets SHALL own raster Mask support
Raster Mask 支持 SHALL 由精确 model/API capability preset 声明。OpenAI-compatible profile、unknown model 或同 Provider family 的其他 API format 不得默认继承 native Mask 支持。

#### Scenario: Unknown OpenAI-compatible endpoint
- **WHEN** profile 使用 OpenAI-compatible transport，但 selected model 没有 raster Mask capability evidence
- **THEN** planner 返回 `unsupported`，不得仅凭 URL、providerId 或 API shape 推断支持

#### Scenario: Gemini builder receives canonical Edit Region
- **WHEN** Gemini Generate Content execution 被要求使用 ready raster Edit Region
- **THEN** builder 省略 Mask，并保持 Gemini request parts 不含 Mask 图片

### Requirement: ComfyUI Mask binding SHALL be explicit and revision-scoped
ComfyUI V1 SHALL 只支持 `separate-image-input` Mask binding。Binding SHALL 包含 exact `WorkflowInputRef` 和 `white-edit` 或 `black-edit` polarity，并 SHALL 与 `workflowId + revision` 绑定；系统不得通过 node title、class type 或 input name 自动猜测 Mask target。

#### Scenario: Save an explicit Mask input mapping
- **WHEN** loaded Workflow revision 有多个 writable upload-image candidates，用户选择其中一个作为 Mask input
- **THEN**系统保存该 exact ref 作为该 revision 的 Mask binding，不改变 Primary image mapping

#### Scenario: Workflow revision changes
- **WHEN** selected Workflow revision 与保存 Mask binding 的 revision 不同
- **THEN**旧 binding 失效，Mask readiness 为 unsupported/ambiguous，直到用户重新选择

#### Scenario: No heuristic fallback
- **WHEN** Workflow 包含 title 为 `Mask` 或 class type 含 `MASK` 的节点，但没有显式 binding
- **THEN**系统不得自动注入 Mask

### Requirement: ComfyUI upload barrier SHALL prepare Image and Mask before submission
ComfyUI execution SHALL 在任何 `/prompt`、Frontend Queue 或 Bridge submit 前解析、验证、按 binding polarity 转换并上传全部 image 与 Mask asset。任一资产失败 SHALL 阻止 remote submission。

#### Scenario: Upload canonical Mask to declared input
- **WHEN** `comfyui-separate-image-input` plan 有 ready canonical Mask
- **THEN** upload barrier 返回独立 `maskValue`，driver 只把该值写入 declared Mask input ref

#### Scenario: Black-edit Workflow binding
- **WHEN** Workflow binding polarity 为 `black-edit`
- **THEN** execution adapter 在上传前反转 canonical grayscale coverage，并保持 dimensions 不变

#### Scenario: Mask upload fails
- **WHEN** image uploads 成功但 Mask resolve、validation、conversion 或 upload 失败
- **THEN**系统不得调用 API Graph `/prompt`、Frontend Queue 或 Bridge submit

#### Scenario: Preserve unrelated Workflow values
- **WHEN** driver 注入 Primary image 与 Mask values
- **THEN**只有显式 image/Mask refs 被修改，其他 saved widgets、linked inputs 与 custom node values 保持不变

### Requirement: Mask execution diagnostics SHALL remain bounded and secret-free
系统 SHALL 记录 bounded Mask lifecycle/execution facts，包括 state、source kind、plan kind、dimensions、polarity conversion outcome、failure stage 与 reason；日志不得包含 Mask bytes、data URL、prompt、native path、Provider credential、Workflow document 或 raw request/response。

#### Scenario: Log a Mask preflight failure
- **WHEN** Mask 因 dimension mismatch 或 byte limit 被拒绝
- **THEN** diagnostics 只记录 bounded stage/reason/dimensions/limit，不记录 asset bytes 或 request payload

#### Scenario: Log ComfyUI Mask routing
- **WHEN** ready Mask 通过 explicit Workflow binding 路由
- **THEN** diagnostics 可记录 plan kind 与 bounded ref identity，但不得记录 connection endpoint、remote workflow path 或 uploaded filename payload
