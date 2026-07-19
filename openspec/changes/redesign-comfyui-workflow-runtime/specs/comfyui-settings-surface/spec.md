## ADDED Requirements

### Requirement: Settings 必须提供互斥的 Provider 与 ComfyUI TAB
Settings surface MUST 保留 Provider 与 ComfyUI 两个可显式切换的 TAB，并将两个 TAB 渲染为完全分离的内容分支。ComfyUI TAB MUST 只消费 singleton server、workflow catalog、selected workflow detail 与 Workflow Form 的状态，不得消费或渲染 Provider management 内容。

#### Scenario: 打开 ComfyUI TAB
- **WHEN** Settings 当前选择 ComfyUI TAB
- **THEN** surface MUST 只渲染 ComfyUI settings branch，且 MUST NOT 同时渲染 Provider settings branch

#### Scenario: 打开 Provider TAB
- **WHEN** Settings 当前选择 Provider TAB
- **THEN** surface MUST 只渲染 Provider settings branch，且 MUST NOT 保留可交互的 ComfyUI branch

### Requirement: ComfyUI TAB 必须使用固定信息层级
ComfyUI TAB MUST 按以下固定顺序渲染且不得插入其他 settings section：`Address + Connect + status`、collapsed Advanced settings、Workflow list/import/refresh、selected workflow detail + dynamic form。未选择 workflow 时第四段 MUST 显示 bounded empty detail state，而不得改变前三段顺序。

#### Scenario: 渲染完整 ComfyUI TAB
- **WHEN** 用户打开 ComfyUI TAB 且已有 selected workflow
- **THEN** surface MUST 按固定顺序渲染 server connection、Advanced settings、Workflow management 与 selected workflow detail/Form

#### Scenario: 尚未选择 Workflow
- **WHEN** 用户打开 ComfyUI TAB 且没有 selected workflow
- **THEN** surface MUST 在第四段显示未选择状态，并保持前三段可见且顺序不变

### Requirement: Server connection 区必须只管理一个 Address
ComfyUI TAB MUST 只提供一个 `baseUrl` Address input、一个 Connect action 与当前 server status。Surface MUST NOT 提供 display name、profile selector、connection list、connection row、Add Connection、connection CRUD 或 `connectionId` 编辑入口。Connect action MUST 对当前 Address 发起 bounded capability detection，并将 canonical Address 与结果投影回同一区域。

#### Scenario: 连接当前 Address
- **WHEN** 用户输入 host、IP、HTTP(S) URL 或带 reverse-proxy path 的 Address 并触发 Connect
- **THEN** surface MUST 测试该唯一 Address、显示 bounded progress，并在完成后显示 canonical Address 与 capability status

#### Scenario: 重新连接不同 Address
- **WHEN** 用户修改 Address 后再次触发 Connect
- **THEN** surface MUST 替换 singleton server settings 的 `baseUrl`，且 MUST NOT 新增第二个 connection record 或 connection row

#### Scenario: 不显示多连接管理
- **WHEN** ComfyUI TAB 已连接或未连接
- **THEN** surface MUST NOT 渲染 profile selector、connection list、Add Connection 或独立 connection editor navigation

### Requirement: Connection status 必须按 capability 分区呈现
Connection status MUST 分别呈现 API、Frontend 与 Bridge capability state，不得把 server address、workflow document format 与 Bridge compatibility 合并为一个判定。Frontend 或 Bridge unavailable MUST 只影响 remote Frontend workflow controls；只要 API ready，imported API workflow controls MUST 保持可用。

#### Scenario: API ready 但 Frontend 与 Bridge unavailable
- **WHEN** capability detection 返回 API `ready`、Frontend `unavailable` 且 Bridge `unavailable` 或 `incompatible`
- **THEN** surface MUST 保持 API workflow import 与已导入 API workflow detail 可用，并只在 remote Frontend workflow area 显示 scoped unavailable state

#### Scenario: 三类 capability 都可用
- **WHEN** capability detection 返回 API `ready`、Frontend `ready` 与 Bridge `compatible`
- **THEN** surface MUST 显示三类独立成功状态，并允许 remote Frontend discovery 与 API workflow import

#### Scenario: API unavailable
- **WHEN** capability detection 返回 API `unavailable`
- **THEN** surface MUST 在 API status 中显示 scoped failure，且 MUST NOT 将该结果误报为 workflow JSON format error

### Requirement: Advanced settings 必须默认折叠
ComfyUI TAB MUST 将 `requestTimeoutMs`、`workflowLoadTimeoutMs`、`observationTimeoutMs` 与 `useSliderForNumberWidget` 放入默认折叠的 Advanced settings section。展开与收起 MUST NOT 改变 Address、capability status、workflow selection 或 dynamic Form values。V1 Advanced settings MUST NOT 提供 authentication、custom headers、credential profile、secret query、Run、AutoRun 或 batch controls。

#### Scenario: 初次打开 ComfyUI TAB
- **WHEN** 用户进入 ComfyUI TAB
- **THEN** Advanced settings MUST 默认折叠，并保持当前配置摘要或展开入口可发现

#### Scenario: 展开并修改 Advanced settings
- **WHEN** 用户展开 Advanced settings 并保存合法配置
- **THEN** surface MUST 更新 singleton server settings，且 MUST 保持当前 workflow selection 与 Form values

#### Scenario: Advanced settings 不承载执行控制
- **WHEN** 用户展开 Advanced settings
- **THEN** surface MUST NOT 显示 Run、AutoRun、batch multiplier、global Stop 或 credential controls

### Requirement: Workflow management 必须统一提供 list、import 与 refresh
Workflow management section MUST 显示 bounded workflow identity tree，并提供 Import JSON/File 与 refresh actions。List MUST 支持 scoped loading、error 与 empty states；remote discovery MUST 只列出 identity，不得在 list 阶段因 Imagen contract、binding、operation 或 output binding 过滤 workflow。Import 与 refresh MUST 保持在 ComfyUI TAB 内完成。

#### Scenario: 刷新 remote Frontend workflow
- **WHEN** 用户触发 refresh 且 Frontend/Bridge capability 可用
- **THEN** surface MUST 显示 scoped loading state，并在完成后渲染全部 bounded remote workflow identities

#### Scenario: Remote workflow list 为空
- **WHEN** remote discovery 成功但没有 workflow identity
- **THEN** surface MUST 显示 scoped empty state，并保持 Import JSON/File 可用

#### Scenario: 导入 API Format workflow
- **WHEN** 用户通过 Import JSON/File 提供合法 bounded API Format document
- **THEN** surface MUST 将 imported workflow identity 加入同一 workflow list，且 MUST NOT 导航到独立 import page

#### Scenario: Remote refresh 失败
- **WHEN** remote discovery 返回 bounded error
- **THEN** surface MUST 在 workflow list area 显示 scoped error 与 retry/refresh action，且 MUST NOT 清除已导入 workflow identities

### Requirement: Workflow detail 与 dynamic Form 必须在同一 TAB 导航
选择 workflow 后，Settings surface MUST 在当前 ComfyUI TAB 加载 selected workflow detail 与 dynamic Form，不得导航到独立 `ComfyUiConnectionPage`、workflow execution page 或新 settings route。Detail MUST 提供返回 list、refresh、import、reset 与适用的 save action；这些 controls MUST 管理 presentation/Form 状态而不得提交 execution。

#### Scenario: 从 list 选择 workflow
- **WHEN** 用户在 workflow identity tree 选择一个 workflow
- **THEN** surface MUST 在同一 ComfyUI TAB 显示该 workflow 的 scoped loading state，随后渲染 detail 与 dynamic Form

#### Scenario: 返回 workflow list
- **WHEN** 用户从 selected workflow detail 触发返回
- **THEN** surface MUST 回到同一 TAB 的 workflow list context，且 MUST NOT 打开 connection editor 或改变 generation mode

#### Scenario: 编辑 dynamic Form
- **WHEN** 用户修改 dynamic Form widget 并触发适用的 save action
- **THEN** surface MUST 保存该 workflow 的 presentation/Form overrides，且 MUST NOT Queue、Run 或创建 Task

#### Scenario: 重置 dynamic Form
- **WHEN** 用户在 selected workflow detail 触发 reset
- **THEN** surface MUST 恢复该 workflow 的可重置 presentation/Form values，且 MUST NOT 修改 singleton Address 或其他 workflow 的 values

### Requirement: ComfyUI TAB 必须排除非 ComfyUI 管理内容与重复执行入口
ComfyUI TAB MUST NOT 渲染 Provider profiles/models、Global Generation、Prompt Settings、billing、connection rows、Add Connection、Run、AutoRun、batch multiplier、global Stop、History 或第二套 execution/result controls。首页 Send MUST 保持唯一 workflow execution 入口，Settings actions MUST 只管理 server、workflow identity、binding 与 Form presentation state。

#### Scenario: 检查 ComfyUI TAB 内容边界
- **WHEN** ComfyUI TAB 处于任意 connection、list 或 detail state
- **THEN** surface MUST NOT 渲染 Provider/global/prompt/connection-list 内容或任何 workflow execution action

#### Scenario: 用户保存 Workflow 配置
- **WHEN** 用户在 ComfyUI TAB 保存 workflow binding 或 Form presentation state
- **THEN** Settings MUST 只持久化管理状态，并要求用户回到首页通过 Send 运行 workflow

### Requirement: Settings 初始 TAB 必须服从 current generation mode route
Settings surface MUST 接受 generation workspace view model 投影的 mode-specific route。由 ComfyUI mode 发起的 settings navigation MUST 初始打开 ComfyUI TAB；由 Provider mode 发起的 navigation MUST 初始打开 Provider TAB。用户在 Settings 内显式切换 TAB MUST 只更新 Settings navigation state，不得反向修改 generation mode、shared Composer draft 或 backend selections。

#### Scenario: 从 ComfyUI mode 打开 Settings
- **WHEN** current generation mode 为 ComfyUI 且用户触发 settings navigation
- **THEN** Settings surface MUST 初始打开 ComfyUI TAB 并显示该 singleton server 与 workflow state

#### Scenario: 从 Provider mode 打开 Settings
- **WHEN** current generation mode 为 Provider 且用户触发 settings navigation
- **THEN** Settings surface MUST 初始打开 Provider TAB

#### Scenario: 在 Settings 内切换 TAB
- **WHEN** 用户在 Settings 内从一个 TAB 显式切换到另一个 TAB
- **THEN** Settings surface MUST 只改变当前 Settings TAB，且 MUST NOT 改写 generation mode、Composer draft 或任何 backend selection
