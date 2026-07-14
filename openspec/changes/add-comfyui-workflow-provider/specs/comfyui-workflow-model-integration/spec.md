## ADDED Requirements

### Requirement: Profile-owned workflow model identity
每份已保存 ComfyUI workflow MUST 是一个由 `profileId + modelId` 标识的 configured model，并 MUST 保存 `displayName`、API Format workflow、normalized contract 与稳定 `workflowRevision`。不同 profile 的同名 `modelId` MUST 保持隔离；删除 profile MUST 级联删除它拥有的 workflow model configs。

#### Scenario: 两个 ComfyUI profile 使用同名 workflow model
- **WHEN** profile A 与 profile B 都保存 `modelId: 'portrait-edit'`
- **THEN** list、resolve、edit、delete 和 dispatch MUST 只访问当前 profile 的 workflow config

#### Scenario: Persisted workflow record 内容边界
- **WHEN** workflow model 保存成功
- **THEN** record MUST 包含 workflow 与 normalized contract，MUST NOT 包含 secret、绝对本地路径、upload filename、`client_id`、`prompt_id`、history 或 provider output

#### Scenario: 删除 ComfyUI profile
- **WHEN** 用户删除一个拥有 workflow models 的 ComfyUI profile
- **THEN** system MUST 级联删除该 profile 的全部 workflow model configs

### Requirement: Dedicated workflow import and save flow
Application MUST 提供 ComfyUI-specific import/save command，执行 local parse、server compatibility validation 和 profile ownership validation；该 command MUST NOT 复用 catalog `saveUserModelConfig()` 的 official preset 要求。

#### Scenario: 导入并保存 compatible workflow
- **WHEN** 用户为 ComfyUI profile 提供 model identity、display name 与通过 local/server validation 的 API Format JSON
- **THEN** 系统 MUST 保存 workflow configured model，并让 `listProfileModels()` 返回 selectable item

#### Scenario: 导入 workflow 到非 ComfyUI profile
- **WHEN** workflow import command 的 profile `apiFormat` 不是 `comfyui`
- **THEN** command MUST 失败且 MUST NOT 写入 model repository

#### Scenario: Server compatibility validation 失败
- **WHEN** local contract 合法但目标 endpoint 缺少 workflow class
- **THEN** import/save MUST 返回 incompatible error，MUST NOT 新增或覆盖 configured model

### Requirement: Refresh revalidates persisted workflows only
ComfyUI Profile Models 页的 Refresh MUST 调用独立 workflow revalidation command，重新校验当前 profile 已保存 workflows，返回 runtime-only `unknown | compatible | incompatible` per-model status；它 MUST NOT 复用 `refreshProfileModels()` discovery command，MUST NOT 假设服务端能列出全部 workflows，MUST NOT 创建、删除或直接选择 model item。

#### Scenario: Refresh 全部已保存 workflows
- **WHEN** 当前 profile 有三份 workflow configs，用户点击 Refresh
- **THEN** Application MUST 对三份配置执行 compatibility validation，并返回对应 runtime statuses

#### Scenario: Refresh 发现 workflow 已不兼容
- **WHEN** server 不再提供某 workflow 需要的 node class
- **THEN** 页面 MUST 显示该 model incompatible、当前 session 禁止用它发送，但 repository 与当前 selector ownership MUST 保持不变

#### Scenario: Compatibility status unknown 或 stale
- **WHEN** selected workflow 没有当前 session compatible status
- **THEN** Application MAY admission，但 Provider MUST 在 upload 或 `/prompt` 前重新验证全部 workflow classes

### Requirement: Workflow model execution projection
Application MUST 把 resolved workflow config 投影为 discriminated ComfyUI `ProviderModelExecution`，字段 MUST 包含 `kind/apiFormat/modelId/requestStrategyId/workflowRevision/workflow/contract`。queued/durable request MUST 只冻结 `profileId + modelId + workflowRevision`；dispatch MUST 重新读取 config，revision 相同才组装 ephemeral execution payload。caller-provided `providerOptions` MUST NOT 注入或覆盖 workflow JSON、binding 或 designated output。

#### Scenario: Selector 选择 workflow model 后发送
- **WHEN** active profile 选择一份 compatible workflow configured model并提交 prompt
- **THEN** dispatch MUST 使用该 profile-owned workflow execution payload，而不是把 `modelId` 当成 ComfyUI wire model ID

#### Scenario: Caller 尝试覆盖 workflow payload
- **WHEN** request `providerOptions` 带有 workflow、node binding 或 output node override
- **THEN** Application/Provider validation MUST 忽略或拒绝这些字段，并继续以 persisted config 为唯一执行真相

#### Scenario: Queued task 对应 workflow 被替换
- **WHEN** task admission 后同一 `profileId + modelId` 保存了不同 `workflowRevision`
- **THEN** dispatch 与 retry MUST 以 stale-workflow validation error 失败，MUST NOT 执行新 graph 或产生 provider side effects

#### Scenario: Workflow-owned output controls
- **WHEN** active model 是 ComfyUI workflow
- **THEN** Application MUST 提供 singleton provider-default PNG matrix 与 `outputMode: 'workflow-owned'`，Composer MUST 隐藏 size、ratio、format、output count controls，Provider MUST NOT 把该 matrix selection 注入 graph

### Requirement: Composer consumes exact input projection
Application MUST 向 App 暴露 exact image arity、primary/reference roles 与 `acceptsMask`；Composer MUST 使用该 projection 限制附件并构造 ordered `images[]` 与独立 `maskImage`，MUST NOT 解析 workflow 或猜测第二张附件是 mask。

#### Scenario: 两图 workflow 的 Composer slots
- **WHEN** active workflow 声明 exact two images
- **THEN** Composer MUST 表达一个 primary slot 和一个 reference slot，并按该顺序构造 `images[]`

#### Scenario: 添加独立 mask
- **WHEN** active workflow 接受 mask，用户从 Photoshop selection/layer mask 添加蒙版
- **THEN** Composer MUST 构造 `maskImage`，普通 image attachment 列表与顺序 MUST 不变

#### Scenario: Workflow 不接受 mask
- **WHEN** active workflow 的 `acceptsMask` 为 false
- **THEN** Composer MUST 禁用独立 mask action，并拒绝残留 mask draft

### Requirement: Invalid workflow input fails before durable admission
Application MUST 提供 preflight command，在 durable task 和 queue admission 前校验 operation、exact image count、mask eligibility、selected workflow ownership，并返回 `workflowRevision`。App MUST 在 `putTaskRecord()` 前调用 preflight；Application runtime MUST 在 queue/provider 边界重复 guard。失败 MUST NOT 创建 task record、durable task、queue item、upload request 或 `/prompt` request。

#### Scenario: 缺少 required reference image
- **WHEN** two-image workflow 只提交 primary image
- **THEN** submit MUST 返回 validation error，task/queue/provider spies MUST 保持零调用

#### Scenario: Selected workflow 不属于 active profile
- **WHEN** request 尝试使用另一 profile 的 workflow modelId
- **THEN** submit MUST 失败且 MUST NOT dispatch

### Requirement: ComfyUI-specific profile editor
App MUST 为 ComfyUI profile 提供显式 format 选择、single base URL 与 connection test，并 MUST 隐藏 API Key、API paths、endpoint model hint、billing 与 catalog discovery 控件。

#### Scenario: 创建 ComfyUI profile
- **WHEN** 用户选择 ComfyUI format
- **THEN** editor MUST 只要求 display name 与一个 base URL，并 MUST NOT 显示 API Key 或 model discovery fields

### Requirement: Surface-specific file IO boundary
App/host adapter MUST 负责选择和读取 workflow JSON 文件以及 materialize Photoshop mask asset；Application 与 Provider MUST 只接收 JSON value 或 opaque asset refs，MUST NOT 接收 native path、UXP file entry 或 DOM file object。canonical edit mask intensity MUST 定义为 `0 = keep`、`255 = edit`；materializer MUST 把 mask 归一化到 primary provider-input 的精确宽高，并编码 `alpha = 255 - maskIntensity` 的 PNG。Application preflight MUST 拒绝未知尺寸或与 primary 不同尺寸的 mask。

#### Scenario: UXP 导入 workflow 文件
- **WHEN** 用户通过 UXP file picker 选择 JSON
- **THEN** UXP adapter MUST 读取 bounded text 并把 parsed input 交给 Application，MUST NOT 持久化 native path

#### Scenario: Photoshop mask 转换为 ComfyUI alpha PNG
- **WHEN** Photoshop selection/layer mask 像素为 keep=0、edit=255，且 primary provider-input 尺寸已知
- **THEN** App MUST 输出同尺寸 PNG，keep pixel alpha MUST 为 255、edit pixel alpha MUST 为 0，并把该 asset 存入 AssetStore

#### Scenario: Mask 与 primary 尺寸不一致
- **WHEN** materialized mask 尺寸未知或不等于 primary provider-input
- **THEN** preflight MUST 在 task record 与 provider side effects 前失败
