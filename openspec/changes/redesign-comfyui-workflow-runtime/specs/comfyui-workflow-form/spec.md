## ADDED Requirements

### Requirement: Workflow Form 必须对 Frontend 与 API Format 使用统一模型
系统 MUST 将 Frontend Save Format 与 API Format workflow 转换为同一个 format-neutral `WorkflowForm`、`WorkflowFormNode` 与 `WorkflowFormWidgetRef` 模型。Frontend converter MUST 从 Canvas nodes/widgets 读取 node 与 widget identity、current value、writable metadata 和原始顺序；API converter MUST 从 graph literal inputs 与 bounded `object_info` metadata 合成等价信息。V1 可见 editor 集合 MUST 只包含安全、可写的 string、multiline string、boolean、number、combo 与 seed literal。无法安全转换或不在 V1 editor 集合内的 widget MUST 保留 workflow 原值，且 MUST NOT 成为 workflow admission 或 Send 的阻塞条件。

#### Scenario: Frontend workflow 构建 form
- **WHEN** selected Frontend workflow 含有可安全识别的 Canvas widgets
- **THEN** Frontend converter MUST 将 node、widget identity、current value、writable metadata 与原始顺序投影为 format-neutral Workflow Form

#### Scenario: API workflow 构建 form
- **WHEN** selected API workflow 含有 literal inputs 且对应 `object_info` metadata 可用
- **THEN** API converter MUST 生成可由同一 renderer 与 binding logic 消费的 Workflow Form

#### Scenario: 不支持的 widget
- **WHEN** converter 无法把某个 widget 证明为安全、可写的 V1 editor
- **THEN** 系统 MUST 隐藏该 widget、保留其 workflow 原值，并继续允许完整 workflow 进入 Send preflight

### Requirement: Form visibility 必须只显示显式标记的 active node
所有 workflow node MUST 默认从 dynamic Form 隐藏。仅当 active node 的当前 title 以 `#` 开头、含至少一个可见 V1 editor，且未 muted、未 bypassed 时，该 node 才 MUST 显示。title 以 `.` 开头的 node MUST 隐藏；registered converter 或已知 node type MUST NOT 绕过 `#` 标记规则。

#### Scenario: 未标记 node 默认隐藏
- **WHEN** active node 含有受支持 widgets，但当前 title 不以 `#` 开头
- **THEN** 该 node MUST 不出现在 dynamic Form 中

#### Scenario: 井号标记 node 显示
- **WHEN** active node 的当前 title 以 `#` 开头且含至少一个可见 V1 editor
- **THEN** 该 node MUST 出现在 dynamic Form 中，无论其由 registered converter 还是 generic converter 解析

#### Scenario: 点号 node 隐藏
- **WHEN** node title 以 `.` 开头
- **THEN** 该 node MUST 从 dynamic Form 隐藏

#### Scenario: Muted 或 bypassed node 隐藏
- **WHEN** node 当前为 muted 或 bypassed
- **THEN** 该 node MUST 从 dynamic Form 隐藏，且其 workflow 原值 MUST 保持不变

### Requirement: 可见 node 必须使用 natural locale numeric ordering
系统 MUST 先从可见 node title 移除开头 `#` 并 trim，再使用当前 locale 的 natural numeric ordering 排序，因此数字片段 MUST 按数值而非纯字典序比较。排序 key 相同时，系统 MUST 以 workflow 原始 node order 作为 tie-breaker。每个 node section 的显示标题 MUST 使用该 normalized title，MUST NOT 显示 leading `#`，也 MUST NOT 用 node type、id 或自动生成标题替换。

#### Scenario: 数字 title 自然排序
- **WHEN** 可见 node 的规范化排序 key 分别为 `Sampler 2` 与 `Sampler 10`
- **THEN** `Sampler 2` section MUST 排在 `Sampler 10` section 之前

#### Scenario: 相同排序 key 保持原始顺序
- **WHEN** 两个可见 node 的规范化排序 key 相同
- **THEN** 系统 MUST 按 workflow 原始 node order 渲染这两个 sections

#### Scenario: Section 使用 node title
- **WHEN** 系统渲染一个可见 node section
- **THEN** section title MUST 等于移除leading `#`并trim后的当前node title

### Requirement: Form visibility 不得依赖 `sdppp_*` namespace
V1 MUST 直接读取 workflow node title，MUST NOT 读取、写入或迁移 `sdppp_widgetable_title`、`#sdppp_variant`、`sdppp_min`、`sdppp_max`、`sdppp_step` 或任何其它 `sdppp_*` property、identifier、marker 或 compatibility alias。系统 MUST NOT 为 visibility 自动改写用户 node title 或保存额外 hidden marker property。

#### Scenario: Workflow 含有 `sdppp_*` property
- **WHEN** 已加载的 remote workflow node 含有任意 `sdppp_*` property
- **THEN** Workflow Form MUST 忽略该 property，并只按当前 title、node state 与 V1 editor rules 投影 visibility

#### Scenario: 编辑 form draft
- **WHEN** 用户修改 dynamic Form 中的 widget value
- **THEN** 系统 MUST NOT 向 workflow 写入 `sdppp_*` metadata

### Requirement: 可见 node 必须按原始 widget 顺序显示全部安全 V1 editors
对每个可见 node，dynamic Form MUST 按 workflow 原始 widget/input 顺序显示全部安全、可写的 string、multiline string、boolean、number、combo 与 seed editors。Text 或 Image mapping MUST NOT 从原位置移除、折叠、隐藏或复制任何原本可见的 editor。linked input、unknown widget、read-only value、image、mask、video、任意 JSON 与 custom complex widget MUST 隐藏并保留 workflow 原值。

#### Scenario: 混合支持 editor
- **WHEN** 可见 node 按原始顺序包含 string、boolean、number、combo 与 seed widgets
- **THEN** dynamic Form MUST 以相同顺序显示全部这些 editors

#### Scenario: Multiline string editor
- **WHEN** 可见 node 含有明确标记为 multiline 且可写的 string literal
- **THEN** dynamic Form MUST 在该 widget 的原始位置显示 multiline string editor

#### Scenario: Linked 与 complex widgets 隐藏
- **WHEN** 可见 node 同时含有 linked input、image、mask、video、任意 JSON 或 custom complex widget
- **THEN** dynamic Form MUST 隐藏这些 widgets、保留其原值，且 MUST 继续显示同 node 中其它安全 V1 editors

#### Scenario: Mapped widget 仍在 form 中
- **WHEN** 一个可见 string editor 成为 Text mapping target
- **THEN** 该 editor MUST 继续出现在原 node 与原 widget 位置，并允许用户编辑其 form draft value

### Requirement: Form draft 必须是 workflow revision scoped 的 session state
用户对 dynamic Form 的编辑 MUST 只写入当前 Photoshop session 中、以 selected workflow revision 为 scope 的 Form draft，MUST NOT 持久化到 workflow document、settings storage 或跨 Photoshop reload 的 presentation state。Draft MUST 在用户离开并返回 Settings、切换到另一 workflow 后再返回当前 workflow 时保留；Photoshop plugin reload 或当前 workflow revision 改变时 MUST 清除。Surface MUST NOT 提供 Save、Reset 或 dirty-state UI；编辑 MUST 立即成为当前 revision 的 draft，且 MUST NOT 发起 Queue、Run、Task 创建或 remote submission。

#### Scenario: 页面往返保留 draft
- **WHEN** 用户编辑 Form、离开 Settings 后在同一 Photoshop session 返回相同 workflow revision
- **THEN** dynamic Form MUST 恢复该 revision 的 session draft

#### Scenario: Workflow 往返保留 draft
- **WHEN** 用户从一个 workflow revision 切换到其它 workflow 后再返回
- **THEN** dynamic Form MUST 恢复前一 revision 在当前 Photoshop session 中的 draft

#### Scenario: Plugin reload 清除 draft
- **WHEN** Photoshop plugin reload 后重新打开相同 workflow
- **THEN** dynamic Form MUST 从 workflow 当前保存值初始化，且 MUST NOT 恢复 reload 前的 draft

#### Scenario: Revision 改变清除 draft
- **WHEN** 当前 workflow revision 改变
- **THEN** 系统 MUST 丢弃旧 revision 的 Form draft，并从新 revision 的 workflow 值初始化

#### Scenario: Form 不显示持久化 controls
- **WHEN** 用户查看或编辑 dynamic Form
- **THEN** surface MUST NOT 显示 Save、Reset 或 dirty-state indicator

### Requirement: Input Mapping 必须按 candidate 数量渐进披露
系统 MUST 分别计算 Text 与 Image binding candidates。对任一类型，零个 candidate 时 MUST 不显示 selector，并在 Settings 的 Input Mapping section 显示该类型无法映射的 non-blocking notice；恰好一个 candidate 时 MUST 自动绑定该 candidate 且不显示 selector；多于一个 candidate 时 MUST 显示 selector，并在用户显式选择前保持该类型未映射、MUST NOT 猜测。若 Text 与 Image 都恰好一个 candidate，整个 Input Mapping section MUST 隐藏。

#### Scenario: 零个 candidate
- **WHEN** Text 或 Image candidate 数量为零
- **THEN** Input Mapping MUST 不显示该类型 selector，并显示该类型无法映射的 non-blocking notice

#### Scenario: 唯一 candidate 自动绑定
- **WHEN** Text 或 Image candidate 数量恰好为一
- **THEN** 系统 MUST 自动绑定唯一 candidate，且 MUST 不显示该类型 selector

#### Scenario: 多个 candidates 要求显式选择
- **WHEN** Text 或 Image candidate 数量大于一
- **THEN** Input Mapping MUST 显示该类型 selector，并在用户选择前保持未映射且 MUST NOT 自动选择 candidate

#### Scenario: 两类 mapping 都唯一
- **WHEN** Text 与 Image candidate 数量都恰好为一
- **THEN** 系统 MUST 自动绑定两者，并隐藏整个 Input Mapping section

### Requirement: 只有显式歧义 mapping 可以按 revision 持久化
系统 MUST 只在用户从多个 candidates 中显式选择 target 时，才按 server identity、workflow identity 与 workflow revision 持久化该 mapping。零 candidate 的未映射状态与唯一 candidate 的自动 mapping MUST NOT 作为显式 selection 持久化。保存的显式 ref 在当前 revision 中不存在、不唯一、不可写或类型不兼容时 MUST 立即失效；系统 MUST 重新按 candidate 数量投影 UI，且 MUST NOT 猜测 replacement。Plugin reload 后相同 server、workflow 与 revision MUST 恢复该 mapping；workflow revision 改变时旧 mapping MUST 失效。

#### Scenario: 显式歧义 mapping 往返恢复
- **WHEN** 用户从多个 candidates 中显式选择 target，切换 workflow 后在同一 Photoshop session 返回相同 revision
- **THEN** 系统 MUST 恢复该 revision 的显式 mapping

#### Scenario: Plugin reload 后恢复显式 mapping
- **WHEN** Photoshop plugin reload 后重新连接相同 server 并加载相同 workflow revision
- **THEN** 系统 MUST 恢复该 revision 的显式 ambiguous mapping

#### Scenario: 唯一 mapping 不保存 selection
- **WHEN** 某类型只有一个 candidate
- **THEN** 系统 MUST 在每次投影该 revision 时自动绑定唯一 candidate，且 MUST NOT 写入显式 selection state

#### Scenario: Saved mapping 已失效
- **WHEN** revision-scoped 显式 mapping ref 不再是合法 candidate
- **THEN** 系统 MUST 清除该 mapping、保持该类型未映射，并 MUST NOT 自动选择其它 ambiguous candidate

#### Scenario: Revision 改变清除 mapping
- **WHEN** workflow revision 改变
- **THEN** 系统 MUST 清除旧 revision 的显式 mapping，并按当前 candidates 重新计算 mapping state

### Requirement: Binding candidates 必须只包含唯一可写 literal widgets
Text candidates MUST 只包含 identity 唯一、writable、text-like 的 literal widgets；Image candidates MUST 只包含 identity 唯一、writable、可接收 upload-image value 的 widgets。Candidate identity MUST 由稳定的 `nodeId` 加 `inputName` 或 `widgetIndex` 构成。link-shaped input、read-only output、缺少唯一 locator、类型不匹配或无法证明 writable 的 widget MUST 不进入 candidate list。Candidate filtering MUST NOT 删除对应 workflow 原值或拒绝 workflow。

#### Scenario: Writable text literal
- **WHEN** form model 中存在 locator 唯一且 writable 的 text-like literal widget
- **THEN** 该 widget MUST 出现在 Text binding candidates 中

#### Scenario: Writable upload-image input
- **WHEN** form model 中存在 locator 唯一且 writable 的 upload-image widget
- **THEN** 该 widget MUST 出现在 Image binding candidates 中，即使 image widget 本身不在 dynamic Form 显示

#### Scenario: Link-shaped 或 ambiguous input
- **WHEN** 一个 input 是 graph link、read-only 或无法形成唯一 widget reference
- **THEN** 该 input MUST 不进入 binding candidates，但 workflow MUST 保持可运行和可查看

### Requirement: Send override 必须使用固定优先级并保留下层值
Send snapshot MUST 按以下优先级计算每个 target 的最终值：workflow saved value `<` revision-scoped Form draft `<` resolved Text mapping 上的 non-empty Composer prompt `<` resolved Image mapping 上的 first Composer attachment。Composer prompt 为空、attachments 为空或对应类型未映射时，系统 MUST 保留下层值。系统 MUST NOT 把同一个 prompt 或 attachment 广播到多个 widgets。

#### Scenario: Non-empty prompt 覆盖 mapped text widget
- **WHEN** Text mapping 已解析且 Composer prompt 非空
- **THEN** Send snapshot MUST 只覆盖 mapped text widget，并保留其它 text widgets 的 workflow 或 draft values

#### Scenario: Empty prompt 保留 draft value
- **WHEN** Text mapping 已解析但 Composer prompt 为空
- **THEN** Send snapshot MUST 保留 mapped widget 的 Form draft；不存在 draft 时 MUST 保留 workflow saved value

#### Scenario: 未映射保留 workflow values
- **WHEN** Text 或 Image 类型未映射
- **THEN** 系统 MUST 不对对应类型的 widget 注入 Composer value，并 MUST 保留 workflow 或 draft values

### Requirement: Composer attachment injection 必须只消费第一张已映射附件
当 Image mapping 已解析且 Composer 至少有一张 attachment 时，系统 MUST 只 materialize、上传并注入第一张 attachment。额外 attachments MUST 不上传、不进入 execution inputs，也 MUST 不覆盖其它 image widgets。Image 类型未映射时，Composer attachment path MUST 保持零 upload；workflow image widget 自身拥有的 remote/default value MUST 不被重复上传。

#### Scenario: 已映射单张附件
- **WHEN** Image mapping 已解析且 Composer 含一张 attachment
- **THEN** 系统 MUST 等待该 attachment 的 upload barrier，并只把返回值注入 mapped image widget

#### Scenario: 已映射多张附件
- **WHEN** Image mapping 已解析且 Composer 含多张 attachments
- **THEN** 系统 MUST 只上传并注入第一张，且 MUST 不处理其余 attachments

#### Scenario: 未映射图片输入
- **WHEN** Image 类型未映射且 Composer 含 attachments
- **THEN** Composer attachment path MUST 发起零 upload，且 workflow MUST 使用已有 image values 继续运行

### Requirement: Unused-input notices 必须精确且不阻塞 Send
系统 MUST 只在用户实际提供会被忽略或截断的 Composer input 时显示 notice。prompt 非空且 Text 类型未映射时 MUST 显示 `此 Workflow 不使用当前提示词`；attachments 非空且 Image 类型未映射时 MUST 显示 `此 Workflow 未识别到图片输入，附件不会发送`；attachments 超过一张且 Image mapping 已解析时 MUST 显示 `此 Workflow 仅使用第一张附件`。这些 notices MUST NOT 改变 Send availability、workflow readiness 或 submission payload 中已保留的 workflow values。

#### Scenario: 当前提示词未使用
- **WHEN** Composer prompt 非空且 Text 类型未映射
- **THEN** UI MUST 显示 `此 Workflow 不使用当前提示词`，并保持 Send 可用性不受该 notice 影响

#### Scenario: 当前附件未使用
- **WHEN** Composer attachments 非空且 Image 类型未映射
- **THEN** UI MUST 显示 `此 Workflow 未识别到图片输入，附件不会发送`，并保持 Send 可用性不受该 notice 影响

#### Scenario: 只消费第一张附件
- **WHEN** Composer attachments 超过一张且 Image mapping 已解析
- **THEN** UI MUST 显示 `此 Workflow 仅使用第一张附件`，并保持 Send 可用性不受该 notice 影响

#### Scenario: 没有实际 unused input
- **WHEN** Composer prompt 为空且 attachments 为空
- **THEN** UI MUST 不显示上述 unused-input notices

### Requirement: Form 与 mappings 不得建立 input-based Send gate
Send MUST 始终表示运行当前 selected complete workflow。系统 MUST NOT 因 Text 或 Image 类型未映射、prompt 为空、attachments 为空、candidate 数量、widget `maxCount`、可见 editor 数量或 unsupported widget 而禁用 Send。系统 MUST NOT 用 widget `maxCount` 隐藏 Composer attachment 入口或增加额外 readiness 条件；Send 是否可 dispatch MUST 只服从 workflow selection、runtime capability、安全边界与 output-node preflight 等非输入映射条件。

#### Scenario: Workflow 不消费 Composer inputs
- **WHEN** selected workflow 没有 resolved Text mapping 和 Image mapping
- **THEN** 用户 MUST 仍可 Send 该完整 workflow，并由 workflow 使用其保存值或 Form draft

#### Scenario: Widget 声明 maxCount
- **WHEN** selected image widget metadata 包含任意 bounded `maxCount`
- **THEN** 系统 MUST 不用该值禁用 attachment 入口或改变 Send availability

#### Scenario: Prompt 或 attachment 缺失
- **WHEN** Composer prompt 为空或没有 attachment
- **THEN** 系统 MUST 保留下层 workflow/draft values，并 MUST 不因此创建 Send gate

### Requirement: 隐藏的 image、mask、video 与 custom widgets 不得被 Form 层拒绝
Workflow Form MUST 隐藏 image、mask、video、任意 JSON、unknown 与 custom complex widgets，并保留其 workflow 原值。其存在 MUST NOT 使 workflow discovery、admission、form construction 或 Send availability 失败；本 Change MUST NOT 引入 Photoshop mask-specific materializer、mask binding 或 mask live/UXP acceptance。

#### Scenario: Workflow 含 image、mask 或 video widget
- **WHEN** selected workflow 含有 image、mask 或 video widget
- **THEN** dynamic Form MUST 隐藏该 widget、保留其原值，且 MUST 不拒绝该 workflow

#### Scenario: Workflow 含 unsupported custom node
- **WHEN** selected workflow 含有 converter registry 不认识的 custom node 或 arbitrary JSON value
- **THEN** 系统 MUST 保留其原始 graph/value，且 MUST 不因该 node 本身阻塞 Send
