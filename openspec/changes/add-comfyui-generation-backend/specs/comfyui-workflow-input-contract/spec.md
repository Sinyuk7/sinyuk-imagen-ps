## ADDED Requirements

### Requirement: 两个stable class IDs必须是唯一workflow contract authority
ComfyUI integration MUST只识别`ImagenWorkflowBindingContract`与`ImagenWorkflowTypeContract`两个stable class IDs。Application、execution package、API/Frontend drivers与Bridge MUST消费同一个contract schema/version，MUST不维护第三份binding model。

#### Scenario: Contract完整
- **WHEN**两个stable contract nodes声明合法且一致的workflow contract
- **THEN**系统 MUST产生一个canonical `ComfyUiWorkflowContract`并允许对应source admission

#### Scenario: Contract缺失或冲突
- **WHEN**任一node缺失、class ID错误、version unsupported或两边contract keys不一致
- **THEN**workflow admission MUST fail closed且 MUST不upload或submit

### Requirement: V1 contract必须使用固定shape与bounds
Binding node MUST声明`schemaVersion: 1`与`bindings[] {role, slot, locator {nodeId, fieldName}}`。Type node MUST声明`schemaVersion: 1`、`operation: text-to-image|image-edit`与`entries[] {role, slot, required, dataType, maskEncoding?}`。Role MUST只允许`prompt/image/mask/output-image`，dataType MUST只允许`text/image/mask`，maskEncoding MUST只允许`grayscale/alpha/inverted-alpha`。

每个node canonical JSON MUST不超过65,536 bytes，合并后 MUST不超过32 entries，nodeId/fieldName MUST各不超过128 chars。两边 MUST具有完全相同且唯一的`role+slot` keys；prompt只能required slot 0 text，image/output-image slots必须从0连续，mask最多一个slot 0且必须声明mask type/encoding，至少一个required output-image。Text-to-image MUST禁止image/mask；image-edit MUST至少一个required image且 MAY包含optional mask。

#### Scenario: V1字段完整
- **WHEN**两个nodes字段、keys、operation/cardinality、locators与bounds全部合法
- **THEN**系统 MUST按role+slot稳定顺序合并为canonical contract

#### Scenario: V1字段不合法
- **WHEN**字段缺失、unknown、duplicate、out-of-order、oversized或operation/type/encoding冲突
- **THEN**系统 MUST在upload或submission前fail closed

### Requirement: Canonical schema、parser/validator与fixtures必须只有一个owner
Canonical JSON schema、authoritative parser/validator与valid/invalid fixtures MUST由execution package单点拥有。Parser/validator MUST直接消费canonical schema并产生canonical `ComfyUiWorkflowContract`；Application、drivers与host adapters MUST只消费其结果，MUST不重新解释accept/reject规则。Integration runtime schema与validator artifact MUST从canonical source生成或复制，Python/JS MUST不手写第二份schema或独立parser。Bridge handshake MUST报告contractSchemaVersion与canonical schema SHA-256 digest；TS/Python/JS MUST对同一fixture得到相同accept/reject结论。

#### Scenario: Schema digest不匹配
- **WHEN**Bridge报告的schema version或digest与Application/execution package不一致
- **THEN**Frontend readiness MUST fail closed且 MUST不open workflow或Queue

#### Scenario: Consumer接收validated contract
- **WHEN**Application、driver或host adapter接收execution package已验证的canonical contract
- **THEN**consumer MUST直接使用该结果且 MUST不运行独立accept/reject parser

### Requirement: Workflow内部nodes必须保持opaque
系统 MUST只验证contract声明的target node/input/widget与output node，MUST不扫描class names猜binding、不遍历links、不声明兼容Reroute、Primitive、Get/Set、subgraph或其他custom nodes。

#### Scenario: Contract target经过内部subgraph
- **WHEN**contract声明的外部widget合法且内部workflow包含subgraph或custom nodes
- **THEN**系统 MUST只处理declared locator并把内部graph视为opaque

### Requirement: API与Frontend必须使用同一个locator contract
API与Frontend MUST使用同一`locator {nodeId, fieldName}`。API driver MUST验证对应API node literal input；Frontend driver MUST验证Canvas node上唯一matching widget。Link-shaped API input、missing widget或type mismatch MUST fail closed。

#### Scenario: API input已变为link
- **WHEN**saved contract指向的API input不再是可写literal
- **THEN**API driver MUST在upload/submission前拒绝workflow

#### Scenario: Frontend widget不存在
- **WHEN**remote workflow打开后找不到exact node/widget
- **THEN**Frontend driver MUST在native Queue前失败并释放Canvas lease

### Requirement: 本地image、mask与TaskPlacement必须复用现有owners
Chrome与Photoshop inputs MUST复用`HostImageAsset/ImageResource/StoredAssetRef/AssetStore`。Mask MUST在Send/admission阶段按主图frame与existing host materialization生成canonical stored asset。Placement MUST直接复用CHANGE-01 `TaskPlacement`并原样进入terminal projection。系统 MUST不创建ComfyUI-specific local store、resource URI、cache、placement evidence或document selector。

#### Scenario: Photoshop image-edit admission
- **WHEN**用户从Photoshop capture image并提供selection mask
- **THEN**Task与execution params MUST只保存ordered StoredAssetRefs、bounded geometry/type facts及existing TaskPlacement，image/mask bytes MUST由existing host adapters拥有

### Requirement: Remote upload必须使用共享barrier
Running Task write成功后，`ComfyUiExecutionAdapter` MUST解析required StoredAssetRefs、按explicit mask encoding准备bytes、上传到`/upload/image`并验证returned descriptor。所有required uploads成功前，API `/prompt`与Frontend native Queue call count MUST均为0。

#### Scenario: 所有uploads成功
- **WHEN**ordered images与optional mask全部返回valid descriptors
- **THEN**shared mapper MUST生成contract-aligned exact widget values并允许selected driver继续

#### Scenario: 任一upload失败
- **WHEN**任一required asset missing、oversized、MIME invalid或upload response malformed
- **THEN**Task MUST失败且 MUST零`/prompt`、零native Queue；是否允许Retry MUST只由pre-submission retry policy决定

### Requirement: Remote upload state不得成为第二套asset system
Remote filenames/descriptors MUST只存在于当前execution plan，MUST不作为durable asset identity、不跨Task缓存、不进入Task history。Bridge MUST不接收raw bytes或upload handles。

#### Scenario: Upload后submission失败
- **WHEN**remote inputs已上传但selected driver在submission前失败
- **THEN**系统 MUST丢弃local remote descriptor state，且 MUST不从orphaned remote files自动submission或replay
