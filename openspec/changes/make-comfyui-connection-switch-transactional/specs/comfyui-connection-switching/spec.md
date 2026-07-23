## ADDED Requirements

### Requirement: Connection switch SHALL use one immutable target
系统 SHALL 在用户发起连接时先校验并 canonicalize 当前 `draftBaseUrl`，再创建带有唯一 `attemptId` 的 immutable connection target。该 target SHALL 显式包含 `http:` 或 `https:` scheme，并 SHALL 成为该 attempt 的 API probe、WebView/iframe source、`postMessage` target origin、received-message origin validation，以及任何 WebSocket URL 的唯一派生输入。Bridge Resolver SHALL NOT 在 resolve 期间读取 persisted state 或其他隐式 connection source。

#### Scenario: 使用新的 draft address 发起连接
- **WHEN** `committedBaseUrl` 为 `https://old.example`，用户输入 `http://127.0.0.1:8188` 并激活 `Connect`
- **THEN** 系统 SHALL 以 `http://127.0.0.1:8188` 创建 immutable target
- **AND** API probe、Frontend Bridge 与 message origin validation SHALL NOT 使用 `https://old.example`

#### Scenario: Resolver 解析 discovery Bridge
- **WHEN** connection transaction 请求 Bridge Resolver 创建 `discovery` session
- **THEN** 调用方 SHALL 显式传入本次 attempt 的 immutable target 与 `AbortSignal`
- **AND** Resolver SHALL NOT 调用 `ComfyUiStateRepository.load()` 或等价 persistence reader

#### Scenario: 相似 host 表示不同 origin
- **WHEN** 两个 target 分别为 `http://localhost:8188` 与 `http://127.0.0.1:8188`
- **THEN** 系统 SHALL 将它们视为不同 origin 与不同 connection target
- **AND** 系统 SHALL NOT 复用前一 target 的 Bridge session 或 origin validation state

### Requirement: Connection state SHALL separate draft committed active and provisional ownership
系统 SHALL 分别维护 UI-only `draftBaseUrl`、durable `committedBaseUrl`、runtime `activeConnection` 与至多一个 `provisionalAttempt`。编辑 draft SHALL NOT 直接修改 committed 或 active state；provisional resources SHALL 只归创建它们的 attempt 所有。

#### Scenario: 初次加载 persisted connection
- **WHEN** Settings 首次获得 `committedBaseUrl`
- **THEN** 系统 SHALL 用该值初始化尚未被用户编辑的 `draftBaseUrl`
- **AND** 后续异步 reload 或旧 attempt 结果 SHALL NOT 覆盖已经变化的 draft

#### Scenario: 编辑 active connection 的地址
- **WHEN** `activeConnection.baseUrl` 为 A，用户把输入框从 A 编辑为 B
- **THEN** `draftBaseUrl` SHALL 变为 B
- **AND** `activeConnection` 与 `committedBaseUrl` SHALL 保持 A，直到 B 的 connection transaction 成功提交

#### Scenario: provisional attempt 失败
- **WHEN** attempt B 在 commit 前失败、被中断或被 supersede
- **THEN** 系统 SHALL dispose 仅属于 attempt B 的 provisional Bridge generation
- **AND** 系统 SHALL 保留原 `activeConnection` 及其 resources

### Requirement: Connection switch SHALL promote only a fully validated transaction
connection transaction SHALL 按 URL validation、API probe、Frontend Bridge load、Bridge handshake、Bridge contract validation、durable persistence 与 active promotion 的顺序执行。API 与 Bridge validation 全部成功前 SHALL NOT 写入 committed state；durable persistence 成功前 SHALL NOT 替换 active connection。Repository commit SHALL 提供 atomic、attempt-aware 的完成边界，使被 abort 或 supersede 的 attempt 不会成为最终 durable state。

#### Scenario: 完整连接成功
- **WHEN** attempt target 通过有效 API response、Frontend Bridge load、handshake 与 contract validation，且 durable persistence 成功
- **THEN** 系统 SHALL 将同一个 target 同时发布为 `committedBaseUrl` 与新的 `activeConnection`
- **AND** 系统 SHALL 在 promotion 后 dispose 旧 active connection generation

#### Scenario: API 成功但 Bridge load 失败
- **WHEN** `/system_stats` 返回有效成功 response，但 target 的 Frontend Bridge WebView 或 iframe 无法加载
- **THEN** transaction SHALL 失败且 SHALL NOT 持久化或激活该 target
- **AND** 原 active connection SHALL 继续工作

#### Scenario: persistence 失败
- **WHEN** provisional target 已通过 API 与 Bridge validation，但 repository commit 失败
- **THEN** transaction SHALL 返回 `PERSISTENCE_FAILED`
- **AND** committed 与 active connection SHALL 保持原值
- **AND** provisional resources SHALL 被 dispose

#### Scenario: connection promotion 完成
- **WHEN** 新 connection generation 被原子发布为 active
- **THEN** 系统 SHALL 使旧 server 的 catalog、current workflow runtime 与 pending refresh result 失效
- **AND** 后续 discovery SHALL 只通过新 active target 执行

### Requirement: Connection attempts SHALL enforce latest-wins ownership
系统 SHALL 使用单调递增的 `attemptId`、`AbortController` 与 current-owner check 管理所有 manual connect、startup recovery、reload 与内部调用。只有 current attempt MAY 更新 connection state、写入 persistence、发布 failure 或 promote resources；所有 late completion SHALL 被忽略并回收。

#### Scenario: 连接 A 时输入改为 B
- **WHEN** attempt A 尚未完成且用户把 draft 改为 canonical target B
- **THEN** 系统 SHALL 立即将 attempt A 标记为 `SUPERSEDED`、abort 其 pending waits，并 dispose A 的 provisional resources
- **AND** 系统 SHALL 保留 draft B 与原 active connection C
- **AND** 系统 SHALL NOT 自动发起 attempt B

#### Scenario: A 在被 supersede 后晚到成功
- **WHEN** attempt A 已被 B 的 draft edit supersede，而 A 的 probe、Bridge 或 persistence callback 随后完成
- **THEN** A SHALL NOT 写入 committed state、替换 active connection、覆盖 draft、发布 success 或显示 error

#### Scenario: 用户显式连接 B
- **WHEN** A 已被 supersede 且用户在有效 draft B 上再次激活 `Connect`
- **THEN** 系统 SHALL 创建新的 attempt B 与独立 provisional resources
- **AND** attempt B 的结果 SHALL 只由其自己的 `attemptId` 与 immutable target 决定

#### Scenario: 等价 draft 表示同一 canonical target
- **WHEN** attempt 正在连接 target A，用户编辑 raw draft 但 canonicalization 后仍为 A
- **THEN** 系统 MAY 继续该 attempt
- **AND** attempt 完成时 SHALL NOT 用旧 raw text 覆盖用户当前 draft

### Requirement: Connection resources SHALL have deterministic disposal
每个 provisional 或 active Bridge generation SHALL 暴露 idempotent `dispose()`。Failure、timeout、abort、supersession 与 host teardown SHALL 结束相关 waits、移除 message/load listeners、清理 timers，并 detach 对应 iframe 或 UXP WebView；同一 resource 的重复 disposal SHALL 无副作用。

#### Scenario: attempt timeout
- **WHEN** Bridge load 或 handshake 超过该 attempt 的 bounded timeout
- **THEN** 系统 SHALL reject pending waits 并 dispose 该 attempt 的 provisional generation
- **AND** 原 active generation SHALL 不受影响

#### Scenario: Settings connection control unmount
- **WHEN** 发起 manual connection attempt 的 Settings connection control unmount
- **THEN** 系统 SHALL abort 并 dispose 该 control 发起的 current provisional attempt
- **AND** host-owned active generation SHALL 继续可用于其他页面与 generation execution
- **AND** late DOM 或 message events SHALL NOT 更新已卸载的 UI

#### Scenario: Chrome 或 UXP host dispose
- **WHEN** Chrome 或 UXP host 被 dispose
- **THEN** 系统 SHALL abort current provisional attempt 并 dispose provisional 与 active Bridge generations
- **AND** late DOM 或 message events SHALL NOT 更新 Application state

#### Scenario: 新 connection 成功替换旧 connection
- **WHEN** provisional generation B 已成功 promote 为 active
- **THEN** 系统 SHALL 先发布 B 为 active，再 dispose 旧 active generation A
- **AND** dispose A 的失败 SHALL NOT 回滚已成功提交的 B

### Requirement: Connection failures SHALL preserve phase-specific meaning
系统 SHALL 使用 structured connection result 区分 `API_UNREACHABLE`、`API_INVALID_RESPONSE`、`WEBVIEW_LOAD_FAILED`、`BRIDGE_HANDSHAKE_TIMEOUT`、`BRIDGE_CONTRACT_MISMATCH`、`PERSISTENCE_FAILED`、`SUPERSEDED` 与 `ABORTED`。成功的 HTTP request 只 SHALL 证明 API phase；它 SHALL NOT 被解释为 Frontend Bridge 成功。`SUPERSEDED` 与 `ABORTED` SHALL 作为 control-flow result，不得显示为用户错误。

#### Scenario: API endpoint 不可达
- **WHEN** target 的 API request 被拒绝、网络失败或 timeout
- **THEN** result SHALL 为 `API_UNREACHABLE`
- **AND** UI SHALL 表达无法连接 ComfyUI server，而非 Bridge failure

#### Scenario: API response 不符合 contract
- **WHEN** `/system_stats` 返回非成功 status 或不符合 bounded schema 的 payload
- **THEN** result SHALL 为 `API_INVALID_RESPONSE`
- **AND** transaction SHALL NOT 继续创建 Frontend Bridge

#### Scenario: Bridge handshake timeout
- **WHEN** WebView/iframe 已加载，但 Bridge 未在 bounded timeout 内完成 handshake
- **THEN** result SHALL 为 `BRIDGE_HANDSHAKE_TIMEOUT`
- **AND** UI SHALL 表达 API 已可达但 Frontend Bridge 未响应

#### Scenario: Bridge contract 不兼容
- **WHEN** handshake response 的 protocol 或 required command contract 不兼容
- **THEN** result SHALL 为 `BRIDGE_CONTRACT_MISMATCH`
- **AND** UI SHALL 表达当前 ComfyUI Frontend 与插件 Bridge 不兼容

### Requirement: Connection control SHALL use one input one action and one persistent status region
ComfyUI Settings connection control SHALL 只包含一个 address `TextField`、一个 primary action `Button` 与一个预留高度的 persistent status/help region。该 control SHALL NOT 增加独立 `Test`、`Save`、`Cancel` 或 status-icon button；此限制 SHALL NOT 移除页面其他独立职责的现有 runtime actions。

#### Scenario: draft 无效
- **WHEN** draft 为空、缺少 `http://` 或 `https://` scheme、缺少 host，或 URL 无法解析
- **THEN** action label SHALL 为 `Connect` 且 action SHALL disabled
- **AND** `TextField` SHALL 显示 field-level invalid state 与修复性 help text

#### Scenario: draft 有效且不同于 active
- **WHEN** draft 是有效 target 且与 active target 不同
- **THEN** action label SHALL 为 `Connect` 且 action SHALL enabled
- **AND** status region SHALL 在存在 active connection 时持续显示真实 active address 与切换含义

#### Scenario: 正在连接
- **WHEN** current attempt 正在执行任一 phase
- **THEN** action SHALL 显示 spinner 与 `Connecting...`、保持固定宽度且 disabled
- **AND** address input SHALL 保持可编辑
- **AND** status region SHALL 显示当前实际 phase

#### Scenario: draft 与 active 相同
- **WHEN** 没有 current attempt 且有效 draft 与 active target 相同
- **THEN** action label SHALL 为 `Reconnect` 且 action SHALL enabled
- **AND** persistent status SHALL 表达当前已连接 target

#### Scenario: 当前 draft 的连接失败
- **WHEN** `lastFailure.target` 与当前 canonical draft 相同
- **THEN** action label SHALL 为 `Retry` 且 action SHALL enabled
- **AND** status region SHALL 显示准确、可操作的 failure message

### Requirement: Connection UI SHALL distinguish input validation from runtime failure
只有用户可修复的 URL validation failure SHALL 标记 `TextField` invalid。API、WebView、Bridge 与 persistence failure SHALL 保持合法输入的普通 field visual，并通过 negative status/help text 表达。Persistent connection feedback SHALL 保留在 control 内；toast MAY 补充反馈但 SHALL NOT 成为 success 或 failure 的唯一证据。

#### Scenario: 新 target 失败且旧 connection 可用
- **WHEN** draft B 的 connection attempt 失败，而 active target A 仍可用
- **THEN** status SHALL 同时表达无法连接 B 与仍连接 A
- **AND** 输入框 SHALL 保留 B，且 SHALL NOT 被改回 A

#### Scenario: 用户在 failure 后编辑地址
- **WHEN** `lastFailure.target` 为 A 且用户把 draft 改为不同 canonical target B
- **THEN** UI SHALL 清除 A 对当前 draft 的 failure projection
- **AND** active connection status SHALL 继续准确显示

#### Scenario: 按 Enter 提交
- **WHEN** focus 位于 address input 且当前 action enabled
- **THEN** `Enter` SHALL 等价于激活当前 `Connect`、`Reconnect` 或 `Retry` action
- **AND** invalid 或 connecting 状态下的 `Enter` SHALL NOT 创建 attempt

#### Scenario: 状态文字变化
- **WHEN** UI 在 ready、connecting、failed 与 connected 之间切换
- **THEN** input 与 button SHALL 保持相同高度，button label 变化 SHALL NOT 改变 action width
- **AND** status region SHALL 预留至少一行并允许最多两行，不得造成 connection control 的明显 layout shift 或文字重叠

#### Scenario: 状态包含长 connection target
- **WHEN** active、draft 或 failed target 的可见 address 超过两行可用宽度
- **THEN** status region SHALL 安全断词并在两行内截断，不得产生 horizontal overflow 或挤压 action
- **AND** 完整 canonical address SHALL 仍通过 accessible text 或 non-button tooltip 可获得

#### Scenario: 状态与动作本地化
- **WHEN** shared UI 以任一受支持 locale 渲染 connection control
- **THEN** action label、validation、phase、success 与 failure copy SHALL 通过 `apps/app` i18n message owner 提供
- **AND** raw endpoint value、origin 与技术错误 code SHALL 保持原值，不得由 UI 任意翻译或改写

#### Scenario: 状态无障碍通知
- **WHEN** connection phase 或 persistent result 发生变化
- **THEN** status/help region SHALL 通过稳定的 `aria-describedby` 与 address input 关联，并使用适合状态严重度的 live-region semantics
- **AND** loading spinner SHALL 有可访问名称且 SHALL NOT 成为唯一 loading indicator

#### Scenario: UXP disabled action 被事件激活
- **WHEN** UXP 在 invalid 或 connecting 状态仍向 action 派发 click 或 keyboard event
- **THEN** handler SHALL 通过显式 guard 拒绝该操作
- **AND** 系统 SHALL NOT 只依赖 native `disabled` attribute 防止新 attempt

### Requirement: Connecting status SHALL expose the real phase
UI SHALL 将 current attempt phase 映射为准确且稳定的状态文字，至少覆盖 API check、Frontend Bridge load、Bridge validation 与 persistence。Button SHALL 始终使用统一 `Connecting...` label，而非把内部 phase 塞入 action label。

#### Scenario: API probe 正在执行
- **WHEN** attempt phase 为 API probe
- **THEN** status region SHALL 表达正在检查 ComfyUI server

#### Scenario: Frontend Bridge 正在加载
- **WHEN** API probe 已成功且 attempt phase 为 WebView/iframe load
- **THEN** status region SHALL 表达正在加载 Frontend Bridge
- **AND** SHALL NOT 显示 server unavailable

#### Scenario: durable state 正在写入
- **WHEN** API 与 Bridge validation 已成功且 attempt phase 为 persistence
- **THEN** status region SHALL 表达正在保存 connection
- **AND** active status SHALL 在 commit 完成前继续指向旧 connection

### Requirement: Bridge messaging SHALL enforce exact UXP and Chrome origin boundaries
Chrome iframe 与 Photoshop UXP WebView transport SHALL 从 immutable target 派生 exact connection origin。Outgoing `postMessage` SHALL 显式提供该 `targetOrigin`；incoming event SHALL 同时校验 exact `event.origin`、expected source 与 Bridge identity。`network.domains` 与 `webview.domains` SHALL 作为独立权限边界验证，API probe 成功 SHALL NOT 绕过 WebView permission 或 message validation。

#### Scenario: UXP API permission 可用但 WebView permission 不可用
- **WHEN** `network.domains` 允许 target 且 API probe 成功，但 `webview.domains` 或 message bridge policy 不允许该 target
- **THEN** transaction SHALL 在 WebView phase 失败并保持旧 active connection
- **AND** failure SHALL NOT 被映射为 `API_UNREACHABLE`

#### Scenario: 收到不同 origin 的 message
- **WHEN** Bridge session 收到 `event.origin` 不等于 immutable target origin 的 message，即使 host 名称看起来等价
- **THEN** transport SHALL 拒绝该 message
- **AND** message SHALL NOT 完成 handshake 或任何 pending exchange

#### Scenario: outgoing UXP message
- **WHEN** UXP host 向 provisional 或 active WebView 发送 Bridge request
- **THEN** `postMessage` SHALL 使用 immutable target origin 作为显式 `targetOrigin`

### Requirement: Diagnostics SHALL be useful without exposing connection identifiers
Production diagnostics SHALL 记录 bounded trace/span、transport、phase、reason 与 result，并 SHALL NOT 记录 raw endpoint、origin、WebView URL、WebSocket URL、workflow identity、request identity、header 或 payload。Deterministic in-memory harness SHALL 可检查 `probeUrl`、`webViewSrc`、`messageTargetOrigin` 与 `websocketUrl` 的 exact value，以证明它们来自同一 target。

#### Scenario: production connection failure log
- **WHEN** connection attempt 在 Bridge handshake phase 失败
- **THEN** log SHALL 包含可关联的 trace/span、`phase`、bounded `reason` 与 `result`
- **AND** log SHALL NOT 包含 raw connection target 或 Bridge payload

#### Scenario: deterministic target consistency harness
- **WHEN** harness 以 `http://127.0.0.1:8188/proxy` 发起 connection attempt
- **THEN** harness SHALL 能断言 probe、WebView、message target origin 与可选 WebSocket transport 各自的 exact derived value
- **AND** production logger SHALL 仍只接收 redacted bounded attributes
