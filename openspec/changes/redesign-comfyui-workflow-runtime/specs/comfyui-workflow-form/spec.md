## ADDED Requirements

### Requirement: Workflow Form 必须对 Frontend 与 API Format 使用统一模型
系统 MUST 将 Frontend Save Format 与 API Format workflow 转换为同一个 format-neutral `WorkflowForm`、`WorkflowFormNode` 与 `WorkflowFormWidgetRef` 模型。Frontend converter MUST 从 Canvas nodes/widgets 读取可编辑值；API converter MUST 从 graph literal inputs 与 bounded `object_info` metadata 合成等价 widget。Converter registry MUST 至少支持 `images`、`masks`、`string`、`boolean`、`number`、`combo`、`segment` 与 `video` value shape；generic converter MUST 只暴露 bounded writable primitive editor。无法安全转换的 widget MUST 保留 workflow 原值，且 MUST NOT 成为 workflow admission 或 Send 的阻塞条件。

#### Scenario: Frontend workflow 构建 form
- **WHEN**selected Frontend workflow 含有受支持的 Canvas widgets
- **THEN**Frontend converter MUST 将 node、widget identity、current value 与 writable metadata 投影为 format-neutral Workflow Form

#### Scenario: API workflow 构建 form
- **WHEN**selected API workflow 含有 literal inputs 且对应 `object_info` metadata 可用
- **THEN**API converter MUST 生成与 Frontend converter 可由同一 renderer 和 binding logic 消费的 Workflow Form

#### Scenario: 不支持的 widget
- **WHEN**converter registry 与 generic converter 都不能安全编辑某个 widget
- **THEN**系统 MUST 保留该 widget 的 workflow 原值，且 MUST 继续允许完整 workflow 进入 Send preflight

### Requirement: Form visibility 必须只使用收敛的 node 规则
系统 MUST 从 Frontend node 当前 title 或 API node `_meta.title` 直接派生 form visibility。muted 或 bypassed node MUST 隐藏；title 以 `.` 开头的 node MUST 强制隐藏；没有 widgets 的 node MUST 隐藏；registered converter node MUST 默认显示；generic node MUST 仅在 title 以 `#` 开头时显示。排序 key MUST 移除开头 `#` 并 trim title，且稳定保留 workflow node order 作为相同 key 的 tie-breaker。

#### Scenario: Registered node 默认显示
- **WHEN**active node 由 registered converter 支持、含有 widgets 且 title 不以 `.` 开头
- **THEN**该 node MUST 出现在动态 form 中，无需用户修改 title

#### Scenario: Generic node 强制显示
- **WHEN**active generic node 含有 bounded writable primitive widgets 且 title 以 `#` 开头
- **THEN**该 node MUST 出现在动态 form 中

#### Scenario: 点号强制隐藏
- **WHEN**node title 以 `.` 开头
- **THEN**该 node MUST 从动态 form 隐藏，即使 registered converter 支持它

#### Scenario: Muted 或 bypassed node 隐藏
- **WHEN**node 当前为 muted 或 bypassed
- **THEN**该 node MUST 从动态 form 隐藏，且其保存值 MUST 保持不变

### Requirement: Form visibility 不得依赖 `sdppp_*` namespace
V1 MUST 直接读取 workflow node title，MUST NOT 读取、写入或迁移 `sdppp_widgetable_title`、`#sdppp_variant`、`sdppp_min`、`sdppp_max`、`sdppp_step` 或任何其它 `sdppp_*` property、identifier、marker 或 compatibility alias。系统 MUST NOT 为 visibility 自动改写用户 node title 或保存额外 hidden marker property。

#### Scenario: Workflow 含有 `sdppp_*` property
- **WHEN**导入的 workflow node 含有任意 `sdppp_*` property
- **THEN**Workflow Form MUST 忽略该 property，并只按当前 title、node state 与 converter rules 投影 visibility

#### Scenario: 保存 form override
- **WHEN**用户修改动态 form 中的 widget value
- **THEN**系统 MUST 只保存 repo-owned widget reference 与 override，且 MUST NOT 向 workflow 写入 `sdppp_*` metadata

### Requirement: Dynamic Form 必须保留所有可见 widgets
动态 form MUST 按 visibility rules 渲染全部可见 widgets。被 Text binding 或 Image binding 选中的 widget MUST 继续显示和可编辑；binding MUST NOT 从 form 移除、折叠、隐藏或复制该 widget。Form edit MUST 作为持久 presentation override，Composer injection MUST 只作为 Send snapshot 的更高优先级 override。

#### Scenario: 绑定 widget 仍在 form 中
- **WHEN**用户把一个可见 widget 选为 Text binding 或 Image binding
- **THEN**该 widget MUST 继续出现在原 node 位置，并允许用户编辑其 form override

#### Scenario: Form edit 与 Composer 值并存
- **WHEN**bound widget 同时存在 form override 与 Composer input
- **THEN**系统 MUST 保留 form override，并只在当前 Send snapshot 中按优先级应用 Composer input

### Requirement: Text 与 Image binding selectors 必须始终显示
ComfyUI mode 的 Text binding 与 Image binding selectors MUST 始终显示，且每个 selector MUST 始终包含 `No binding`。没有 candidate 时 selector MUST 保持可见并只提供 `No binding`。不存在、重复、只读或与当前 form 不兼容的 saved ref MUST 归一化为 `No binding`；系统 MUST NOT 猜测 replacement，也 MUST NOT 因 candidate 数量自动隐藏 selector。

#### Scenario: 没有 binding candidate
- **WHEN**selected workflow 没有任何可绑定的文本或图片 widget
- **THEN**对应 selector MUST 仍然显示，并且唯一有效选择 MUST 为 `No binding`

#### Scenario: Saved binding 已失效
- **WHEN**saved binding ref 在当前 workflow revision 中不存在或不再 writable
- **THEN**系统 MUST 将该 selector 归一化为 `No binding`，且 MUST NOT 自动绑定另一个 candidate

#### Scenario: Binding 已选择
- **WHEN**用户显式选择一个合法 binding candidate
- **THEN**系统 MUST 按 workflow presentation state 保存该 `WorkflowFormWidgetRef`，且 MUST 不改变 workflow admission

### Requirement: Binding candidates 必须只包含唯一可写 literal widgets
Text candidates MUST 只包含 identity 唯一、writable、text-like 的 literal widgets；Image candidates MUST 只包含 identity 唯一、writable、可接收 upload-image value 的 widgets。Candidate identity MUST 由稳定的 `nodeId` 加 `inputName` 或 `widgetIndex` 构成。link-shaped input、read-only output、缺少唯一 locator、类型不匹配或无法证明 writable 的 widget MUST 不进入 candidate list。Candidate filtering MUST NOT 删除对应的动态 form widget 或拒绝 workflow。

#### Scenario: Writable text literal
- **WHEN**form 中存在 locator 唯一且 writable 的 text-like literal widget
- **THEN**该 widget MUST 出现在 Text binding candidates 中

#### Scenario: Writable upload-image input
- **WHEN**form 中存在 locator 唯一且 writable 的 upload-image widget
- **THEN**该 widget MUST 出现在 Image binding candidates 中

#### Scenario: Link-shaped 或 ambiguous input
- **WHEN**一个 input 是 graph link、read-only 或无法形成唯一 widget reference
- **THEN**该 input MUST 不进入 binding candidates，但 workflow 与可见 form MUST 保持可运行和可查看

### Requirement: Send override 必须使用固定优先级并保留下层值
Send snapshot MUST 按以下优先级计算每个 target 的最终值：workflow saved value `<` Workflow Form override `<` selected Text binding 上的 non-empty Composer prompt `<` selected Image binding 上的 first Composer attachment。Composer prompt 为空、attachments 为空或 selector 为 `No binding` 时，系统 MUST 保留下层值。系统 MUST NOT 把同一个 prompt 或 attachment 广播到多个 widgets。

#### Scenario: Non-empty prompt 覆盖已绑定 text widget
- **WHEN**Text binding 有效且 Composer prompt 非空
- **THEN**Send snapshot MUST 只覆盖 selected text widget，并保留其它 text widgets 的 workflow 或 form values

#### Scenario: Empty prompt 保留 form value
- **WHEN**Text binding 有效但 Composer prompt 为空
- **THEN**Send snapshot MUST 保留 selected widget 的 form override；不存在 form override 时 MUST 保留 workflow saved value

#### Scenario: No binding 保留 workflow values
- **WHEN**Text binding 或 Image binding 为 `No binding`
- **THEN**系统 MUST 不对对应类型的 widget 注入 Composer value，并 MUST 保留 workflow 或 form values

### Requirement: Composer attachment injection 必须只消费第一张已绑定附件
当 Image binding 有效且 Composer 至少有一张 attachment 时，系统 MUST 只 materialize、上传并注入第一张 attachment。额外 attachments MUST 不上传、不进入 execution inputs，也 MUST 不覆盖其它 image widgets。Image binding 为 `No binding` 时，Composer attachment path MUST 保持零 upload；动态 form image widget 自身拥有的 remote/default value 或 uploader MUST 不被重复上传。

#### Scenario: 已绑定单张附件
- **WHEN**Image binding 有效且 Composer 含一张 attachment
- **THEN**系统 MUST 等待该 attachment 的 upload barrier，并只把返回值注入 selected image widget

#### Scenario: 已绑定多张附件
- **WHEN**Image binding 有效且 Composer 含多张 attachments
- **THEN**系统 MUST 只上传并注入第一张，且 MUST 不处理其余 attachments

#### Scenario: 未绑定图片输入
- **WHEN**Image binding 为 `No binding` 且 Composer 含 attachments
- **THEN**Composer attachment path MUST 发起零 upload，且 workflow MUST 使用已有 image values 继续运行

### Requirement: Unused-input notices 必须精确且不阻塞 Send
系统 MUST 只在用户实际提供会被忽略或截断的 Composer input 时显示 notice。prompt 非空且 Text binding 为 `No binding` 时 MUST 显示 `此 Workflow 不使用当前提示词`；attachments 非空且 Image binding 为 `No binding` 时 MUST 显示 `此 Workflow 未识别到图片输入，附件不会发送`；attachments 超过一张且 Image binding 有效时 MUST 显示 `此 Workflow 仅使用第一张附件`。这些 notices MUST NOT 改变 Send availability、workflow readiness 或 submission payload 中已保留的 workflow values。

#### Scenario: 当前提示词未使用
- **WHEN**Composer prompt 非空且 Text binding 为 `No binding`
- **THEN**UI MUST 显示 `此 Workflow 不使用当前提示词`，并保持 Send 可用性不受该 notice 影响

#### Scenario: 当前附件未使用
- **WHEN**Composer attachments 非空且 Image binding 为 `No binding`
- **THEN**UI MUST 显示 `此 Workflow 未识别到图片输入，附件不会发送`，并保持 Send 可用性不受该 notice 影响

#### Scenario: 只消费第一张附件
- **WHEN**Composer attachments 超过一张且 Image binding 有效
- **THEN**UI MUST 显示 `此 Workflow 仅使用第一张附件`，并保持 Send 可用性不受该 notice 影响

#### Scenario: 没有实际 unused input
- **WHEN**Composer prompt 为空且 attachments 为空
- **THEN**UI MUST 不显示上述 unused-input notices

### Requirement: Form 与 bindings 不得建立 input-based Send gate
Send MUST 始终表示运行当前 selected complete workflow。系统 MUST NOT 因 Text binding 或 Image binding 为 `No binding`、prompt 为空、attachments 为空、candidate 数量、widget `maxCount`、可见 widget 数量或 unsupported widget 而禁用 Send。系统 MUST NOT 用 widget `maxCount` 隐藏 binding selector、禁用 Composer attachment 入口或增加额外 readiness 条件；Send 是否可 dispatch MUST 只服从 workflow selection、runtime capability、安全边界与 output-node preflight 等非输入绑定条件。

#### Scenario: Workflow 不消费 Composer inputs
- **WHEN**selected workflow 没有 Text binding 和 Image binding
- **THEN**用户 MUST 仍可 Send 该完整 workflow，并由 workflow 使用其保存值

#### Scenario: Widget 声明 maxCount
- **WHEN**selected image widget metadata 包含任意 bounded `maxCount`
- **THEN**系统 MUST 不用该值隐藏 Image binding selector、禁用 attachment 入口或改变 Send availability

#### Scenario: Prompt 或 attachment 缺失
- **WHEN**Composer prompt 为空或没有 attachment
- **THEN**系统 MUST 保留下层 workflow/form values，并 MUST 不因此创建 Send gate

### Requirement: Mask 与 custom nodes 不得被 Form 层拒绝
Workflow Form MUST 在能够安全表示时显示 mask widget 的 remote/default value，但本 Change MUST NOT 引入 Photoshop mask-specific materializer、mask binding 或 mask live/UXP acceptance。mask node、custom node 或 unsupported custom widget 的存在 MUST NOT 使 workflow discovery、admission、form construction 或 Send availability 失败；系统 MUST 对无法安全编辑或绑定的值保持原值。

#### Scenario: Workflow 含 mask widget
- **WHEN**selected workflow 含有 mask widget
- **THEN**Form MUST 在能够安全表示时显示其 remote/default value，但 MUST 不要求 Photoshop mask materialization，且 MUST 不拒绝该 workflow

#### Scenario: Workflow 含 unsupported custom node
- **WHEN**selected workflow 含有 converter registry 不认识的 custom node
- **THEN**系统 MUST 保留其原始 graph/value，且 MUST 不因该 node 本身阻塞 Send
