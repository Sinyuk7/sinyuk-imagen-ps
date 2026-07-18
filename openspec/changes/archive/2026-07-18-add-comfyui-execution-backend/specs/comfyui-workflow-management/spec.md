## ADDED Requirements

### Requirement: Workflow import 必须采用宽松 bounded admission
Importer MUST 只接受可解析的 ComfyUI API Format JSON object，并执行 explicit byte、node-count、depth与 field-shape limits。Import MUST NOT 要求 marker、dynamic input、prompt/image/mask/output binding、固定图片数量、operation classification或图片输出保证。Frontend save format、malformed或超限 graph MUST 被拒绝，error/log MUST NOT 回显 raw workflow。

#### Scenario: Fully hardcoded graph
- **WHEN** graph的 prompt、seed、model与 image全部写死且没有 public inputs
- **THEN** importer MUST 允许保存与执行

#### Scenario: Graph has no detected output
- **WHEN** bounded API Format graph可解析但 importer无法识别 image output
- **THEN** importer MUST 允许保存；execution terminal后才判断 output

### Requirement: Workflow config 必须保存 executable bindings而非 detectedBindings
Application MUST 按 `workflowId` 持久化 display name、bounded graph、active executable `bindings`、optional bounded `bindingDiagnostics`与 timestamps；MAY 保存 `workflowContentHash`用于 dedupe/cache/diagnostics。Config MUST NOT 使用 `detectedBindings`作为正式领域字段，也 MUST NOT 包含 profile/model/request strategy/output matrix、operation、`requiredImages`、topology-derived `acceptsMask`、connection ownership或 revisions。

#### Scenario: Save workflow
- **WHEN** import validation成功
- **THEN** repository MUST 保存 independent workflow config，Provider/model stores MUST 保持不变

#### Scenario: Rename workflow
- **WHEN** 用户只修改 display name
- **THEN** graph、bindings与 diagnostics MUST 保持不变

### Requirement: WorkflowBinding 必须声明 executable adapter
Input binding MUST 是 `literal-text(nodeId,inputName)` 或 `comfy-uploaded-image-name(nodeId,inputName)`；output binding MUST 是 `history-output-images(nodeId)`且没有 inputName。Adapter validator MUST 检查 node存在、`class_type/inputName`受支持、input存在、current value shape可写。Text/image adapters MUST 拒绝 `[sourceNodeId, outputIndex]` link。

#### Scenario: Literal text binding
- **WHEN** binding指向 supported `CLIPTextEncode.text` scalar
- **THEN** validator MUST 接受 `literal-text`

#### Scenario: Node link is not writable
- **WHEN** candidate current value为 `["8", 0]`
- **THEN** validator MUST 拒绝 text/image adapter，MUST NOT 把上传 filename写入该 link

#### Scenario: Output binding
- **WHEN** binding adapter是 `history-output-images`
- **THEN** binding MUST 只保存 node ID并在 terminal history中读取标准 `images[]`

### Requirement: Candidate registry 必须保持小且可验证
v1 automatic candidates MUST 限于标准 `CLIPTextEncode.text`、`LoadImage.image`与明确测试通过的 compatibility rules。`/object_info` MAY 验证 `STRING`、`image_upload`与 node schema，但普通 STRING alone MUST NOT 使 model name、path、sampler、LoRA、VAE、checkpoint或 filename prefix成为 prompt/image candidate。

#### Scenario: Arbitrary STRING field
- **WHEN** custom node有唯一 STRING input但没有 tested adapter rule
- **THEN** resolver MUST 不自动绑定，workflow MUST 仍可原样执行

#### Scenario: LoadImage upload field
- **WHEN** `LoadImage.image`是 scalar且 schema声明 upload-backed semantics
- **THEN** resolver MAY 产生 `comfy-uploaded-image-name` candidate

### Requirement: Binding resolution 必须使用严格优先级
Resolver MUST 按 `valid saved binding -> optional marker selecting supported candidate -> unique supported automatic candidate -> no injection`。Markers MAY 包含 `IMAGEN_PS_PROMPT`、`IMAGEN_PS_IMAGE_1..N`、`IMAGEN_PS_MASK`与 `IMAGEN_PS_OUTPUT`；marker只负责选择 candidate，MUST NOT 让 unsupported custom input获得 adapter语义。

#### Scenario: Valid saved binding overrides marker
- **WHEN** valid saved prompt binding与 marker指向不同 supported candidates
- **THEN** resolver MUST 使用 saved binding

#### Scenario: Marker points to unsupported input
- **WHEN** marker指向 node link或 unsupported class/input
- **THEN** resolver MUST 记录 bounded warning且不产生 active binding

#### Scenario: Ambiguous supported candidates
- **WHEN** graph有多个 supported prompt candidates且无 valid saved binding或 marker
- **THEN** resolver MUST 不注入，MUST NOT 猜测

### Requirement: Bindings 必须永远 optional且不含 required
Workflow binding MUST NOT 保存或解释 `required`。Caller prompt/image/mask value为空或缺失时，executor MUST 保留 graph原值；absence MUST NOT 阻止 import、selection或 Send。

#### Scenario: Empty composer prompt
- **WHEN** valid prompt binding存在但 Composer prompt为空
- **THEN** graph text MUST 保持原值，Send MUST 保持可用

### Requirement: Replace 必须重新验证 saved bindings
Replace MUST 对原 saved bindings逐个验证新 graph。Valid bindings MUST 保留；invalid bindings MUST 从 active `bindings`移除并保存 bounded invalid diagnostic。Invalid saved role/slot MUST suppress marker/auto fallback，直到用户重新配置或清除该 intent。Workflow MUST 仍可保存和运行。

#### Scenario: Node ID changes on Replace
- **WHEN** saved prompt binding node在 replacement graph中不存在
- **THEN** binding MUST 标记 invalid，不得 mutation，也不得静默选择另一个 prompt node

#### Scenario: Literal becomes link
- **WHEN** saved image binding current input在 replacement graph中变成 node link
- **THEN** active binding MUST 移除并显示 caller image不会传入的 warning

### Requirement: Send admission 必须再次验证 snapshot bindings
Admission MUST 对 deep-cloned snapshot graph执行同一 adapter validator。Repository corruption或旧 schema产生的 invalid binding MUST 不进入 `ResolvedWorkflowBindings`，MUST 不 mutation且 MUST 不 fallback；它 MUST 产生 non-blocking UI/task warning，workflow仍可原样执行。

#### Scenario: Corrupted persisted binding
- **WHEN** persisted binding引用不存在 input
- **THEN** admitted plan MUST 排除该 binding并保留 graph原值

### Requirement: Prompt、image 与 mask feedback 必须明确
无 active binding、ambiguous candidates或 invalid saved binding时，App MUST 明确指出对应 caller value不会进入 workflow。Unused attachments/mask MUST 不上传。Mask binding必须是 explicit saved binding或 marker-selected supported `comfy-uploaded-image-name` candidate；MUST NOT从 graph topology推断。

#### Scenario: Invalid saved prompt binding
- **WHEN** Composer prompt非空但 saved prompt binding已失效
- **THEN** UI MUST 显示“之前配置的提示词输入已不存在”，Send MAY 继续且 prompt不注入

#### Scenario: MASK output is consumed without binding
- **WHEN** graph消费 `LoadImage` MASK output但没有 explicit mask intent
- **THEN** resolver MUST NOT 自动生成 mask binding

### Requirement: Output binding 必须可选
Saved output binding或 `IMAGEN_PS_OUTPUT` marker MAY 选择一个 node的 `history-output-images` adapter。缺少 output binding MUST NOT 阻止 import/Send；executor MUST fallback扫描全部 terminal `history.outputs[*].images[]`。

#### Scenario: No output marker
- **WHEN** workflow有多个 output nodes但没有 explicit output binding
- **THEN** workflow MUST 合法并使用 best-effort output fallback

### Requirement: Server validation 必须降级为 node-schema evidence
Auxiliary status MUST 使用 `unchecked | node-schema-compatible | node-schema-incompatible | server-unreachable`。它最多说明 current server存在 node classes与 basic schema，MUST NOT 保证 model files、custom dependencies、GPU/VRAM或 execution success。UI文案 MUST 是“未验证”“节点可用”“缺少节点”“服务器离线”。

#### Scenario: Nodes exist but checkpoint is missing
- **WHEN** node classes存在但 referenced checkpoint不存在
- **THEN** status MAY 是 `node-schema-compatible`，UI MUST NOT承诺 execution成功

### Requirement: Workflow lifecycle 与 file IO 必须独立
Application MUST 提供 import/list/rename/replace/delete/revalidate commands。Chrome/UXP adapters MUST bounded读取 JSON并只传 parsed value；shared packages MUST NOT接收 DOM `File`、UXP entry、native path或 file handle。Commands MUST NOT调用 model discovery、`saveUserModelConfig()`或 `refreshProfileModels()`。

#### Scenario: Delete selected workflow
- **WHEN** 用户删除 current selected workflow
- **THEN** target MUST 清空且不得自动选择另一 workflow；already admitted plans不受影响

### Requirement: Workflow selector projection 不得泄漏 model assumptions
Workflow selector item MUST 只包含 workflow ID、display name、binding summary/warnings与 node-schema status。它 MUST NOT 包含 model capabilities、wire ID、operation、output matrix、ratio/resolution/format、billing或 Provider readiness。

#### Scenario: Render invalid-binding workflow
- **WHEN** workflow含 invalid saved binding warning
- **THEN** selector/settings projection MAY显示 warning，但 MUST NOT把 workflow伪装成 unavailable model
