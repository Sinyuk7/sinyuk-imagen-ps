## ADDED Requirements

### Requirement: Settings 必须提供互斥的 Provider 与 ComfyUI TAB
Settings surface MUST 保留 Provider 与 ComfyUI 两个可显式切换的 TAB，并将两个 TAB 渲染为完全分离的内容分支。ComfyUI TAB MUST 只消费 singleton server、`selectedWorkflowId`、selected workflow detail、Input Mapping 与 Workflow Form 的状态，不得消费或渲染 Provider management 内容。

#### Scenario: 打开 ComfyUI TAB
- **WHEN** Settings 当前选择 ComfyUI TAB
- **THEN** surface MUST 只渲染 ComfyUI settings branch，且 MUST NOT 同时渲染 Provider settings branch

#### Scenario: 打开 Provider TAB
- **WHEN** Settings 当前选择 Provider TAB
- **THEN** surface MUST 只渲染 Provider settings branch，且 MUST NOT 保留可交互的 ComfyUI branch

### Requirement: ComfyUI Settings root 必须使用固定信息层级
ComfyUI Settings root MUST 按以下固定顺序渲染：`Connection`、`Current Workflow`、条件显示的 `Input Mapping`、`Workflow Parameters`。Surface MUST NOT 插入永久 workflow tree/list、Import、Save、Reset、dirty state、Advanced settings、format badge、source badge、Run、AutoRun、batch multiplier、global Stop、History 或第二套 execution/result controls。首页 Send MUST 保持唯一 workflow execution 入口。

#### Scenario: 渲染完整 root
- **WHEN** 用户打开 ComfyUI TAB 且 Input Mapping 需要交互或 notice
- **THEN** root MUST 按 Connection、Current Workflow、Input Mapping、Workflow Parameters 的顺序渲染

#### Scenario: Input Mapping 无需显示
- **WHEN** Text 与 Image 都有唯一 candidate 并已自动映射
- **THEN** root MUST 隐藏 Input Mapping，并保持 Connection、Current Workflow、Workflow Parameters 的相对顺序

#### Scenario: 检查排除内容
- **WHEN** ComfyUI Settings 处于任意 connection、picker 或 root state
- **THEN** surface MUST NOT 渲染永久 workflow tree、Import、Save、Reset、dirty state、Advanced settings、format/source badges 或 workflow execution controls

### Requirement: Connection 必须只管理一个 Address 与一个 merged status
Connection section MUST 只提供一个 `baseUrl` Address input、一个 Connect action 与一个 merged connection status。Connect MUST 对当前 Address 发起 bounded capability detection，并将 canonical Address 与 API、Frontend、Bridge capability 的合并结果投影为一个状态区域。Surface MUST NOT 提供 display name、profile selector、connection list、connection row、Add Connection、connection CRUD、`connectionId` 编辑入口或三个常驻 capability status blocks。

#### Scenario: 连接当前 Address
- **WHEN** 用户输入 host、IP、HTTP(S) URL 或带 reverse-proxy path 的 Address 并触发 Connect
- **THEN** surface MUST 测试该唯一 Address、显示 bounded progress，并在完成后以一个 merged status 显示 canonical Address 与 capability summary

#### Scenario: 重新连接不同 Address
- **WHEN** 用户修改 Address 后再次触发 Connect
- **THEN** surface MUST 替换 singleton server settings 的 `baseUrl`，且 MUST NOT 新增第二个 connection record 或 connection row

#### Scenario: 部分 capability unavailable
- **WHEN** API ready 但 Frontend 或 Bridge unavailable 或 incompatible
- **THEN** merged status MUST 准确呈现 degraded 结果，且 MUST NOT 把该结果误报为 workflow JSON format error

### Requirement: Diagnostics 必须只在错误状态或 developer mode 出现
Connection diagnostics MUST 默认隐藏。仅当 merged connection status 为 error/degraded 且存在可诊断信息，或 developer mode 已启用时，surface 才 MUST 显示 Diagnostics 入口或内容。Diagnostics MUST NOT 成为第四个常驻 capability status block，也 MUST NOT 改变 connection 或 workflow availability。

#### Scenario: 健康连接的普通用户
- **WHEN** merged connection status healthy 且 developer mode 未启用
- **THEN** surface MUST 不显示 Diagnostics 入口或内容

#### Scenario: 连接错误
- **WHEN** merged connection status 含 error 且存在 bounded diagnostic detail
- **THEN** surface MUST 显示可查看的 Diagnostics，并保持主要 merged status 为唯一常驻状态

#### Scenario: Developer mode
- **WHEN** developer mode 已启用
- **THEN** surface MUST 显示 bounded Diagnostics，但 MUST NOT 增加 Run、Import 或其它管理 controls

### Requirement: Current Workflow 必须使用 `selectedWorkflowId` 与固定 actions
Current Workflow section MUST 以 `selectedWorkflowId` 作为持久的 current workflow identity，并显示当前 workflow 摘要。该 section MUST 提供 `Change`、`Refresh` 与 `Open in ComfyUI` actions；MUST NOT 引入 `lastWorkflowId`、永久 workflow navigation tree、format badge 或 source badge。`Refresh` MUST 重新获取当前 workflow 并按新 revision 重建 Form 与 Input Mapping；`Open in ComfyUI` MUST 在 capability 支持时打开当前 workflow 的 ComfyUI 页面，否则 MUST 显示 scoped unavailable state。

#### Scenario: 显示 current workflow
- **WHEN** `selectedWorkflowId` 指向可用 workflow
- **THEN** Current Workflow MUST 显示该 workflow 摘要与 Change、Refresh、Open in ComfyUI actions

#### Scenario: 刷新 current workflow
- **WHEN** 用户触发 Refresh
- **THEN** surface MUST 重新获取 `selectedWorkflowId` 对应 workflow，并按返回 revision 重新投影 Form 与 Input Mapping

#### Scenario: Open in ComfyUI 不可用
- **WHEN** 当前 server capability 无法为 selected workflow 提供 ComfyUI URL
- **THEN** Open in ComfyUI MUST 不执行导航，并显示 scoped unavailable state

### Requirement: Change 必须打开 Workflow Picker child page
触发 Change MUST 从 ComfyUI Settings root 导航到 Workflow Picker child page。Picker MUST 提供 search、recent workflows 与按bounded canonical remote path segments分组的workflow list；该 list MUST 只在 picker page 存在，不得同时常驻 root，也 MUST NOT 使用Frontend/API source kind分组。用户选择 workflow 后，surface MUST 持久化其 id 到 `selectedWorkflowId` 并自动返回 root；返回或取消 MUST 保留原 `selectedWorkflowId`。

#### Scenario: 打开 Workflow Picker
- **WHEN** 用户在 Current Workflow 触发 Change
- **THEN** surface MUST 打开含 search、recent 与 grouped workflow list 的 child page

#### Scenario: Search 过滤 picker
- **WHEN** 用户在 Workflow Picker 输入 search query
- **THEN** picker MUST 只过滤当前 picker 的 recent/grouped results，且 MUST NOT 修改 `selectedWorkflowId`

#### Scenario: 选择 workflow 返回 root
- **WHEN** 用户在 Workflow Picker 选择 workflow
- **THEN** surface MUST 将该 id 写入 `selectedWorkflowId`、返回 ComfyUI Settings root，并加载所选 workflow

#### Scenario: 取消 picker
- **WHEN** 用户从 Workflow Picker 返回或取消且未选择 workflow
- **THEN** surface MUST 返回 root，并保持原 `selectedWorkflowId` 不变

### Requirement: Input Mapping 必须只在需要用户注意时显示
Input Mapping section MUST 服从 Workflow Form 的 candidate-count contract：零 candidate 的类型显示 non-blocking notice 且不显示 selector；唯一 candidate 的类型自动映射且不显示 selector；多个 candidates 的类型显示 selector。Text 与 Image 都唯一时整个 section MUST 隐藏。Input Mapping MUST NOT 显示 Save、Reset 或 dirty state，且 mapping 不完整 MUST NOT 建立 Send gate。

#### Scenario: 零 candidate 显示 notice
- **WHEN** Text 或 Image candidate 数量为零
- **THEN** Input Mapping MUST 显示该类型无法映射的 notice，且 MUST 不显示该类型 selector

#### Scenario: Ambiguous mapping 显示 selector
- **WHEN** Text 或 Image candidate 数量大于一
- **THEN** Input Mapping MUST 只为该 ambiguous 类型显示 selector

#### Scenario: 两类唯一时隐藏 section
- **WHEN** Text 与 Image candidate 数量都恰好为一
- **THEN** Input Mapping MUST 完全隐藏

### Requirement: Workflow Parameters 必须直接编辑 revision-scoped Form draft
Workflow Parameters MUST 显示当前 workflow revision 中所有可见 Form editors。编辑 MUST 立即写入该 revision 的 Photoshop session draft；surface MUST NOT 要求或提供 Save、Reset 或 dirty-state confirmation。用户在同一 Photoshop session 内往返 page 或 workflow 后，Parameters MUST 恢复该 revision draft；plugin reload 或 revision 改变时 MUST 从 workflow 当前值重新初始化。

#### Scenario: 编辑 parameter
- **WHEN** 用户修改 Workflow Parameters 中的 editor
- **THEN** 新值 MUST 立即成为当前 workflow revision 的 Form draft，且 MUST NOT Queue、Run、创建 Task 或 remote submit

#### Scenario: Page 往返
- **WHEN** 用户离开 root 后在同一 Photoshop session 返回相同 workflow revision
- **THEN** Workflow Parameters MUST 恢复该 revision 的 draft，且 MUST 不显示 dirty state

#### Scenario: Reload 或 revision 改变
- **WHEN** plugin reload 或当前 workflow revision 改变
- **THEN** Workflow Parameters MUST 清除旧 draft，并从当前 workflow values 初始化

### Requirement: Parameters empty message 必须只出现在 resolved empty state
Workflow Parameters MUST 仅在当前 workflow revision 已成功解析且没有任何可见 Form editor 时显示 bounded empty-parameters message。Loading、error、未选择 workflow、workflow unavailable 或 picker child page state MUST 使用各自 scoped state，MUST NOT 同时显示 empty-parameters message。

#### Scenario: Parameters resolved empty
- **WHEN** 当前 workflow revision 解析成功且可见 Form editor 数量为零
- **THEN** Workflow Parameters MUST 显示 empty-parameters message

#### Scenario: Parameters loading
- **WHEN** 当前 workflow detail 或 Form 正在 loading
- **THEN** Workflow Parameters MUST 显示 loading state，且 MUST NOT 显示 empty-parameters message

#### Scenario: Parameters error
- **WHEN** 当前 workflow detail 或 Form 解析失败
- **THEN** Workflow Parameters MUST 显示 scoped error，且 MUST NOT 显示 empty-parameters message

#### Scenario: 尚未选择 Workflow
- **WHEN** `selectedWorkflowId` 为空
- **THEN** Current Workflow MUST 显示未选择状态，且 Workflow Parameters MUST NOT 显示 empty-parameters message

### Requirement: Settings 初始 TAB 必须服从 current generation mode route
Settings surface MUST 接受 generation workspace view model 投影的 mode-specific route。由 ComfyUI mode 发起的 settings navigation MUST 初始打开 ComfyUI TAB；由 Provider mode 发起的 navigation MUST 初始打开 Provider TAB。用户在 Settings 内显式切换 TAB MUST 只更新 Settings navigation state，不得反向修改 generation mode、shared Composer draft 或 backend selections。

#### Scenario: 从 ComfyUI mode 打开 Settings
- **WHEN** current generation mode 为 ComfyUI 且用户触发 settings navigation
- **THEN** Settings surface MUST 初始打开 ComfyUI TAB 并显示 singleton server 与 `selectedWorkflowId` 对应状态

#### Scenario: 从 Provider mode 打开 Settings
- **WHEN** current generation mode 为 Provider 且用户触发 settings navigation
- **THEN** Settings surface MUST 初始打开 Provider TAB

#### Scenario: 在 Settings 内切换 TAB
- **WHEN** 用户在 Settings 内从一个 TAB 显式切换到另一个 TAB
- **THEN** Settings surface MUST 只改变当前 Settings TAB，且 MUST NOT 改写 generation mode、Composer draft 或任何 backend selection
