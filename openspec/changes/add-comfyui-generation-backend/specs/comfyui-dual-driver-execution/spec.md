## ADDED Requirements

### Requirement: API Graph driver必须执行validated canonical submission
API Graph driver MUST clone admitted graph、只按contract写入prompt/image/mask literal values、验证ordered outputs，并从App侧调用`POST /prompt`恰好一次。未提供的optional input MUST保留admitted graph默认值；invalid target MUST在submission前失败。`promptId` MUST只取自ComfyUI server acknowledgement，App MUST不预造或override promptId。

#### Scenario: API Graph成功提交
- **WHEN**graph、contract、uploads与connection均合法
- **THEN**driver MUST执行一次`POST /prompt`并返回server acknowledgement中的bounded promptId

#### Scenario: Server acknowledgement缺少promptId
- **WHEN**`POST /prompt`返回成功status但promptId缺失、malformed或与本次response context不匹配
- **THEN**driver MUST进入`submission-unknown`且 MUST不第二次POST

### Requirement: API Graph submission不得自动replay
Timeout、network error、invalid acknowledgement或unknown remote state后，driver MUST不再次POST `/prompt`。Submission call开始前的deterministic prepare/upload failure MAY由backend Retry创建same Task/new Job；submission call开始后generic Retry MUST disabled，再执行 MUST创建new Task/new Job。

#### Scenario: `/prompt` acknowledgement超时
- **WHEN**POST可能到达server但receipt未确认
- **THEN**App `/prompt` call count MUST为1、Task MUST标记remote may continue且 MUST不replay

### Requirement: Submission receipts必须由driver局部拥有
API receipt MUST使用bounded `{promptId, acknowledgedAt}`；Frontend receipt MUST使用bounded `{operationId, promptId, acknowledgedAt}`。Owning driver MUST验证identity并立即把promptId交给shared observer。Receipt、operationId与promptId MUST保持runtime-only，MUST不进入Task、Job input、History或durable Bridge state。

#### Scenario: Frontend receipt operation不匹配
- **WHEN**Bridge返回的operationId与当前execution不一致
- **THEN**Frontend driver MUST拒绝receipt、进入bounded unknown state且 MUST不replay Queue

#### Scenario: Receipt后reload
- **WHEN**reload/dispose发生且当前execution尚未terminal
- **THEN**runtime receipt MUST失效，系统 MUST不恢复observer、不reattach、不从global history猜identity且 MUST不replay

### Requirement: Bridge commands必须使用固定envelope与payload
Bridge request MUST只包含bounded `requestId/identity/command/payload`；response MUST回显requestId并使用`ok + payload`或`ok: false + errorCode`。Command allowlist MUST固定为`handshake/list-workflows/submit-workflow/reset/dispose`，所有command MUST拒绝unknown fields。

`handshake` MUST返回identity、protocol/bridge/frontend/core/contract versions、schema digest、capabilities与limits；`list-workflows` MUST只返回canonical path与bounded contract summary；`submit-workflow` MUST只接受operationId、remotePath、`batchCount: 1`、contract-derived `{locator,value}` mutations与configure/receipt timeouts；`reset` MUST只接受operationId；`dispose` MUST无业务payload。

Bridge limits MUST固定为2,000,000-byte serialized message、512-byte workflow path、1,000 workflow list entries、16 mutations、128-char ids与30,000ms configure timeout。Bridge MUST不接收raw bytes、upload handles、API/compiled graph、Task/Job metadata、promptId request、client id、script或property path。

#### Scenario: 合法submit-workflow command
- **WHEN**request identity、payload allowlist、limits与contract-derived mutations均合法
- **THEN**Bridge MUST接受该operation并且只把固定字段传给Frontend driver

#### Scenario: Oversized或含unknown field
- **WHEN**request超过任一limit或包含raw graph、promptId request、logger、receiptHint、leaseToken等非allowlist字段
- **THEN**Bridge MUST在open workflow或Queue前返回bounded error

### Requirement: Frontend driver必须使用native Queue一次
Frontend driver MUST在App-side upload barrier后调用`submit-workflow`。Bridge MUST打开exact workflow、等待matching configure readiness、验证contract nodes/widgets、应用exact values并调用native `app.queuePrompt(0, 1)`恰好一次。

#### Scenario: Frontend成功提交
- **WHEN**Bridge兼容、workflow/contract/widgets合法且Queue acknowledgement有效
- **THEN**Frontend `/prompt` call count MUST为1、App `/prompt` call count MUST为0，并返回operationId对应的server promptId

### Requirement: Frontend operation必须one-shot且Canvas lease服从Session lane
FrontendQueueDriver MUST在dispatch调用栈生成unique runtime-only operationId。Session MUST先取得`ExecutionLane {key: connectionId, maxConcurrency: 1}`slot，adapter随后取得Canvas lease并执行open/mutate/Queue/reset；lease MUST在adapter返回与Job terminal前释放，持有期间 MUST不回调Session或等待新lane slot。

Bridge MUST在同一load identity内保存accepted operation receipt；duplicate operationId MUST返回原receipt且不第二次Queue。Reload MUST生成新loadId并清空旧page state；Application MUST不把旧operation发送到新load。

lease acquisition/configure的timeout、abort、reload、dispose或failure MUST清除waiter并在finally释放任何partially acquired lease。Bridge/runtime不兼容 MUST映射为bounded `bridge-incompatible`；其他failure MUST映射为normalized submit-stage error。Adapter MUST settle并让Session通过正常Job terminal path释放lane，MUST不留下pending lane/lease或automatic replay。

#### Scenario: Duplicate operationId
- **WHEN**同一page load再次收到已accepted operationId
- **THEN**Bridge MUST返回原bounded receipt且 MUST不第二次Queue

#### Scenario: Concurrent Frontend submissions
- **WHEN**同connection有两个Frontend Jobs
- **THEN**Session lane MUST先串行dispatch，Canvas open/mutate/Queue/reset phases MUST不交叉且 MUST不产生lock inversion

#### Scenario: Canvas lease获取失败或超时
- **WHEN**Session已取得lane slot，但Canvas lease未取得、configure超时或operation被abort/reload/dispose
- **THEN**native Queue call count MUST为0，Bridge MUST清除waiter并释放任何partially acquired lease，adapter MUST返回bounded error，Session MUST通过正常Job terminal path释放lane

### Requirement: Bridge protocol必须bounded且无任意执行能力
Bridge MUST验证message origin、source object、load identity、protocol/core/frontend/contract versions、schema digest、command allowlist与limits。Protocol MUST不支持arbitrary script/property path，不返回graph、Canvas、raw Queue payload、client id、raw events或image bytes。

#### Scenario: Message identity不匹配
- **WHEN**origin、source或nested load identity与pinned session不匹配
- **THEN**Bridge MUST忽略或返回bounded error，且 MUST不open workflow或Queue

### Requirement: Receipt observer不得改变native Queue语义
若native `app.queuePrompt()`不直接暴露receipt，Bridge MAY使用narrow pass-through observer读取current `api.queuePrompt` response。Observer MUST调用current wrapped function一次、保持arguments/response/real POST并只restore自己的wrapper；MUST不替换`fetchApi`、伪造response或抑制POST。

#### Scenario: Existing Queue wrapper不兼容
- **WHEN**Bridge无法证明pass-through observer与current runtime wrapper安全组合
- **THEN**Frontend driver MUST fail closed且 MUST不宣称该frontend tuple兼容

### Requirement: Progress与terminal authority必须分离
WebSocket/Bridge progress、executed与success events MUST只作为当前accepted prompt-scoped hints。Known prompt的terminal/output authority MUST来自bounded history/queue reconciliation；unrelated prompt events MUST忽略，progress MUST不重写Task terminal facts。

#### Scenario: 收到success hint但history未完成
- **WHEN**Bridge或WebSocket报告success而history尚无terminal output
- **THEN**Application MUST继续bounded reconciliation且 MUST不提前完成Task

### Requirement: Driver errors必须共享固定bounded vocabulary
两个drivers MUST使用stage `prepare/upload/submit/observe/download/project`，并将错误映射到`invalid-connection/invalid-workflow/invalid-contract/asset-unavailable/upload-failed/submission-rejected/submission-unknown/execution-failed/execution-state-unknown/history-timeout/unsafe-output/download-failed/projection-failed/bridge-incompatible`之一。Normalized error MUST只含stage、code、safe message key、remoteMayContinue与retry disposition，MUST不含raw endpoint/path/graph/payload/stack。

#### Scenario: Pre-submission deterministic failure
- **WHEN**failure发生在submission call开始前的prepare或upload stage
- **THEN**backend MAY允许same Task/new Job Retry，且任何remote generation submission call count MUST为0

#### Scenario: Submission-started failure
- **WHEN**`POST /prompt`或native Queue call已经开始
- **THEN**generic Retry MUST disabled；unknown result MUST标记remoteMayContinue，再执行 MUST创建new Task/new Job
