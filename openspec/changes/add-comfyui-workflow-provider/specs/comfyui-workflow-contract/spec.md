## ADDED Requirements

### Requirement: API Format workflow import
系统 MUST 只接受以 node ID 为 key、每个 node 包含 `class_type`、`inputs` 与可选 `_meta.title` 的 ComfyUI API Format workflow JSON，并 MUST 使用 bounded byte/node limits 解析；普通 frontend workflow save format MUST 被拒绝。

#### Scenario: 导入 API Format workflow
- **WHEN** JSON 符合 API Format node map 且未超过 limits
- **THEN** Provider parser MUST 进入 marker validation

#### Scenario: 导入 frontend workflow JSON
- **WHEN** JSON 只有 frontend nodes/links 结构而没有 API Format node map
- **THEN** Provider parser MUST 返回 unsupported workflow format error

### Requirement: Prompt marker contract
workflow MUST 恰好包含一个 `_meta.title: 'IMAGEN_PS_PROMPT'` node；该 node MUST 包含可直接替换的 literal `inputs.text`，linked input 或缺失字段 MUST 被拒绝。

#### Scenario: 唯一 prompt marker
- **WHEN** workflow 只有一个 prompt marker 且 `inputs.text` 是 literal value
- **THEN** parser MUST 生成该 node 的 prompt binding

#### Scenario: 重复 prompt marker
- **WHEN** 两个 node 的 title 都是 `IMAGEN_PS_PROMPT`
- **THEN** parser MUST 返回 duplicate marker error

### Requirement: Ordered image marker contract
workflow MAY 包含零个或多个 `_meta.title: 'IMAGEN_PS_IMAGE_N'` node；存在时编号 MUST 从 1 连续递增，每个 node MUST 是 `LoadImage` 且包含 literal `inputs.image`。Parser MUST 将 marker 数量投影为 exact image arity。

#### Scenario: 连续三个 image slots
- **WHEN** workflow 包含 `IMAGEN_PS_IMAGE_1`、`IMAGEN_PS_IMAGE_2`、`IMAGEN_PS_IMAGE_3`
- **THEN** normalized contract MUST 声明 `requiredImages = 3` 且 bindings 按编号排序

#### Scenario: Image marker 编号有空洞
- **WHEN** workflow 包含 `IMAGEN_PS_IMAGE_1` 与 `IMAGEN_PS_IMAGE_3`，但没有 `IMAGEN_PS_IMAGE_2`
- **THEN** parser MUST 返回 non-contiguous marker error

#### Scenario: Image marker 不是 LoadImage
- **WHEN** `IMAGEN_PS_IMAGE_1` 标记在其他 class_type 上
- **THEN** parser MUST 返回 unsupported image input node error

### Requirement: Primary and reference image semantics
对于 N-image workflow，canonical `images[0]` MUST 是 primary image，后续项 MUST 是 ordered reference images；request image count MUST 精确等于 N。零 image marker workflow MUST 只接受 `text_to_image`，非零 image marker workflow MUST 只接受 `image_edit`。

#### Scenario: 图片数量匹配 workflow
- **WHEN** two-image workflow 收到 exactly two images
- **THEN** request validation MUST 接受并保留输入顺序

#### Scenario: 图片数量不足或过多
- **WHEN** two-image workflow 收到一张或三张图片
- **THEN** request validation MUST 在 upload 或 `/prompt` 前失败

#### Scenario: Operation 与 image arity 不匹配
- **WHEN** zero-image workflow 收到 `image_edit`，或 image workflow 收到 `text_to_image`
- **THEN** request validation MUST 失败

### Requirement: Primary mask semantics
`maskImage` MUST 独立于 `images[]`，只作用于 `images[0]`，且只允许 normalized workflow contract 声明 `acceptsMask: true` 时出现。Provider MUST 先上传 primary image，再以该 response 为 `/upload/mask` 的 `original_ref`，并将 mask upload response 绑定回 primary `LoadImage`。

#### Scenario: Primary image 带 mask
- **WHEN** workflow 接受 mask 且 request 包含 `images[0]` 与 `maskImage`
- **THEN** Provider MUST 生成 combined RGBA primary reference，reference image bindings MUST 保持不变

#### Scenario: Workflow 不消费 primary mask
- **WHEN** normalized contract 的 `acceptsMask` 为 false，但 request 提供 `maskImage`
- **THEN** request validation MUST 在 upload 前失败

#### Scenario: Mask 没有 primary image
- **WHEN** zero-image workflow 收到 `maskImage`
- **THEN** request validation MUST 失败

#### Scenario: Primary LoadImage MASK output 被消费
- **WHEN** workflow 任意 input link 引用 primary `LoadImage` 的 output index 1
- **THEN** parser MUST 投影 `acceptsMask: true`

#### Scenario: Primary LoadImage MASK output 未被消费
- **WHEN** workflow 没有 input link 引用 primary `LoadImage` 的 output index 1
- **THEN** parser MUST 投影 `acceptsMask: false`

### Requirement: Unique designated output
workflow MUST 恰好包含一个 `_meta.title: 'IMAGEN_PS_OUTPUT'` node；v1 designated node MUST 是 built-in `SaveImage`。其他 `SaveImage` / `PreviewImage` MAY 存在，但 MUST NOT 成为插件结果。

#### Scenario: Workflow 有多个 SaveImage 但一个 designated output
- **WHEN** workflow 有三个 `SaveImage`，只有一个 title 是 `IMAGEN_PS_OUTPUT`
- **THEN** parser MUST 接受 workflow 并保存该 node ID

#### Scenario: 没有或重复 designated output
- **WHEN** workflow 没有 `IMAGEN_PS_OUTPUT`，或多个 node 使用该 title
- **THEN** parser MUST 返回 designated output validation error

#### Scenario: PreviewImage 被标记为 v1 output
- **WHEN** `IMAGEN_PS_OUTPUT` node 的 class_type 是 `PreviewImage`
- **THEN** v1 parser MUST 返回 unsupported output node error

### Requirement: Server compatibility validation
导入、Refresh 与 invoke side effects 前 MUST 使用目标 ComfyUI `/object_info/{class}` 验证 workflow 全部 unique `class_type` 存在，并验证 marker classes、writable inputs 与 output-node facts；系统 MUST 把 local workflow validation error 与 endpoint/protocol incompatibility 分开报告。

#### Scenario: Custom prompt node 提供 text widget
- **WHEN** local prompt marker 有 literal `inputs.text`，且 object info 声明该 input 为 writable string
- **THEN** server compatibility validation MUST 接受该 prompt node

#### Scenario: Workflow 引用服务端不存在的 class
- **WHEN** workflow 中某个 class_type 无对应 object info
- **THEN** revalidation MUST 返回 incompatible workflow status，MUST NOT 删除已保存 model config
