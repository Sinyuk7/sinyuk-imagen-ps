## 1. 前置架构与authority门槛

- [x] 1.1 完成`generalize-task-job-execution-architecture`全部tasks、Task v2 cutover、strict OpenSpec validation、non-Provider fake proof与`pnpm validate`。
- [x] 1.2 对照CHANGE-01确认ComfyUI只实现既有`GenerationBackend`、`JobExecutionRequest`、`ExecutionLane`、`ExecutionAdapter`与Task projection seams；若需要修改公共contract则停止CHANGE-02并重新打开CHANGE-01。
- [x] 1.3 将旧`add-comfyui-execution-backend` OpenSpec标记为被取代并禁止复制其parallel Session/Task/asset/cache设计；不删除git branch、不改写history、不把ignored local build output作为产品任务。
- [x] 1.4 固定module import map：execution package不得依赖Application/React/DOM/UXP，Application不得拥有raw ComfyUI transport，host adapters不得复制parser/uploader/projector。

## 2. Execution package与canonical workflow contract

- [x] 2.1 从tracked source建立`@imagen-ps/execution-backend-comfyui` package、build/test configs与transport-neutral public exports；default tests必须mock-only。
- [x] 2.2 基于真实D01 workflow定义并验证`ImagenWorkflowBindingContract`与`ImagenWorkflowTypeContract` stable class IDs及V1 JSON schema，覆盖schemaVersion、operation、role/slot、required/dataType、locator与maskEncoding。
- [x] 2.3 在execution package实现authoritative parser/validator、role+slot严格merge、operation/cardinality/type/encoding validation以及64KB per-node、32 entries、128-char locator bounds；Application、drivers与host adapters只消费canonical result。
- [x] 2.4 在execution package建立single canonical schema与valid/invalid fixture Case Bank；integration runtime schema/validator只能由canonical source生成/复制，不得手写schema或独立parser。
- [x] 2.5 建立TS/Python/JS cross-language conformance harness，验证相同fixtures得到相同accept/reject结果，并验证handshake schemaVersion与SHA-256 digest一致。
- [x] 2.6 添加workflow contract authoritative suite，覆盖missing/duplicate/extra/discontinuous slots、operation conflict、mask encoding、output ordering与unsupported version。

## 3. Connection、workflow import与target selection

- [x] 3.1 在Application定义ComfyUI connection、workflow与repository ports；V1 connection只允许unauthenticated HTTP(S)/WS并拒绝userinfo、auth、secretRefs与custom headers。
- [x] 3.2 实现Chrome与UXP connection/workflow persistence adapters及list/get/save/delete/test commands，不新增secret store或ComfyUI-specific cache。
- [x] 3.3 实现API Graph importer，只接受plain ComfyUI API Format并执行2MB、2000 nodes、depth 32、nodeId 128、class type 256 bounds；拒绝Frontend JSON、cycle、prototype与non-finite values。
- [x] 3.4 对合法API Graph保存deep-cloned/deep-frozen snapshot并在upload/submission前验证两个contract nodes与literal targets。
- [x] 3.5 定义current-state `GenerationTargetSelection`：Provider继续使用profile/model，ComfyUI只保存workflowId；connection/source从workflow repository派生。
- [x] 3.6 实现target cleanup：删除workflow/connection、切换backend或selected workflow invalid时清空selection，不自动选择replacement且不改变Provider既有行为。
- [x] 3.7 实现source-specific readiness：API要求connection/graph/contract，Frontend额外要求remote path、Bridge tuple、schema digest与native Queue capabilities。
- [x] 3.8 添加Application cases覆盖malformed/oversized/frontend-format import、repository round-trip、unauthenticated boundary、target cleanup与readiness transitions。
- [x] 3.9 实现image-only readiness guard：任何含mask entry的canonical workflow返回`not-ready/workflow`，并在Task dispatch、asset resolution、upload或submission前fail closed；保留schema/parser vocabulary，mask runtime另起Change。

## 4. Bridge integration与fixed protocol

- [x] 4.1 建立`integrations/comfyui-imagen-bridge` tracked source，提供两个contract nodes、bounded status/version endpoint与page-side Bridge；不增加其他project workflow nodes。
- [x] 4.2 实现固定request/response envelope与`handshake/list-workflows/submit-workflow/reset/dispose` allowlist，拒绝unknown commands和unknown fields。
- [x] 4.3 实施2MB message、512-byte path、1000 list entries、16 mutations、128-char ids与30s configure timeout bounds。
- [x] 4.4 实现handshake identity/version/capability/limits/schema digest，固定并验证pinned frontend/core/Bridge tuple。
- [x] 4.5 实现Frontend workflow discovery，返回canonical remote path与bounded contract summary；不返回raw workflow、Canvas、compiled graph或client id。
- [x] 4.6 实现submit payload validation，仅允许operationId、remotePath、batchCount 1、contract-derived locator/value mutations与timeouts；拒绝raw bytes、upload handles、graph、Task/Job metadata、promptId request及script/property paths。
- [x] 4.7 添加Bridge authoritative contract suite，覆盖origin/source/load identity、payload/limits、schema digest、path/list bounds、invalid command与sanitized error envelope。

## 5. Shared asset resolution与upload barrier

- [x] 5.1 在Composer Send/admission阶段复用`HostImageAsset -> ImageResource -> StoredAssetRef -> AssetStore` materialize ordered images；mask 语义仅作为 reserved vocabulary，不进入当前 V1 runtime path。
- [x] 5.2 直接复用CHANGE-01 `TaskPlacement`的`exact-frame/document-only/unbound`，禁止新增ComfyUI placement evidence、document selector或generic evidence副本。
- [x] 5.3 实现execution-time StoredAssetRef resolver、MIME/signature/size guards；mask encoding 仅保留为 reserved vocabulary，Bridge永不接收raw bytes。
- [x] 5.4 实现共享`/upload/image` multipart builder、bounded response descriptor validator与exact widget value mapper，供两个drivers唯一复用。
- [x] 5.5 实现required upload barrier：全部uploads成功前API `/prompt`与Frontend native Queue call count均为0；任一失败终止且不自动submission。
- [x] 5.6 添加shared asset/upload Case Bank，覆盖missing/evicted refs、image geometry、MIME/signature/size、malformed descriptor、partial remote orphan与AbortSignal；mask cases不属于本Change。

## 6. API Graph driver

- [x] 6.1 实现admitted graph clone与contract-only prompt/image literal mutation，保留未提供optional image defaults并验证ordered output targets；mask workflow由3.9 readiness guard阻断。
- [x] 6.2 实现ephemeral client identity/realtime channel与App-owned单次`POST /prompt`调用；promptId只能取自bounded server acknowledgement，不得由App预造或override。
- [x] 6.3 实现runtime-only API receipt并立即进入known-prompt observer；receipt/promptId不得进入Task、Job input、History或durable store。
- [x] 6.4 实现timeout/network/invalid acknowledgement的submission-unknown、remoteMayContinue与no-replay policy；reload/dispose不恢复、不reattach、不从global history猜identity。
- [x] 6.5 添加API driver contract cases，覆盖optional defaults、ordered inputs、one POST、server promptId、receipt mismatch、unknown state、abort与safe pre-submit retry。
- [x] 6.6 在owner-local AutoDL Chrome harness使用不含mask entry的D01 API Graph证明真实image upload、one `/prompt`、server receipt、history/view与TaskOutput后再进入Frontend live proof；mask不属于本Change。

## 7. Frontend Queue driver

- [x] 7.1 实现Application/host Bridge session lifecycle；FrontendQueueDriver在dispatch调用栈生成runtime-only operationId，禁止写入GenerationCommand、Job input、Task或History。
- [x] 7.2 使用CHANGE-01 per-connection lane cap 1作为scheduler authority；Canvas lease只保护已dispatch open/mutate/Queue/reset临界区且不得回调Session或获取新lane。
- [x] 7.3 实现exact workflow open、operation-bound configure readiness、contract/widget validation与contract-derived prompt/image mutation；mask workflow由3.9 readiness guard阻断。
- [x] 7.4 调用native `app.queuePrompt(0, 1)`恰好一次；App `/prompt` call count必须为0。
- [x] 7.5 实现narrow pass-through receipt observer，保持current `api.queuePrompt` arguments/response/real POST并只restore自己的wrapper；无法安全组合时fail closed。
- [x] 7.6 实现page-load operation dedupe：duplicate返回原bounded receipt且不Queue；reload更换loadId、清空page state且Application不得把旧operation发送到新load。
- [x] 7.7 在finally清除Canvas lease waiter并reset/release任何partially acquired lease；acquisition/configure timeout、abort、reload、dispose或wrapper conflict必须返回bounded error并经正常Job terminal path释放Session lane，不得造成widget交叉、lock leak或automatic replay。
- [x] 7.8 添加Frontend/Bridge cases覆盖concurrency、duplicate operation、identity mismatch、mutation bounds、reload/dispose、receipt unknown、Frontend one POST/App zero POST、lease acquisition timeout与lane release ordering。
- [x] 7.9 在owner-local AutoDL Chrome harness使用不含mask entry的D01 Frontend workflow证明真实image widget mutation、native Queue、runtime receipt、history/view与cleanup；mask不属于本Change。

## 8. Shared observation、errors与Application backend

- [x] 8.1 实现known-prompt WebSocket hints与bounded history/queue reconciliation，忽略unrelated prompts与server-global queue signals。
- [x] 8.2 实现contract-owned ordered output collection、safe descriptor/path validation、`/view` status/byte/MIME/signature guards与download。
- [x] 8.3 把validated output bytes写入existing AssetStore并形成ordered StoredAssetRefs/TaskOutputs；不创建ComfyUI result cache/history。
- [x] 8.4 固定shared error stages`prepare/upload/submit/observe/download/project`与approved bounded codes，禁止raw endpoint/path/graph/payload/stack进入Task/log。
- [x] 8.5 实现retry disposition：submission call开始前的deterministic prepare/upload failure可same Task/new Job；submit开始后只能new Task，unknown states标记remoteMayContinue。
- [x] 8.6 实现Application `ComfyUiGenerationBackend` admission、readiness、connection lane、retry policy、generic execution summary与terminal Task projection；不得执行transport。
- [x] 8.7 实现reload/startup行为：无durable receipt recovery；可能已提交的running Task按CHANGE-01变为interrupted，并只通过generic `TaskError.details.remoteMayContinue`保留bounded事实。
- [x] 8.8 添加shared result/backend cases，覆盖multiple outputs、remote failure/unknown、history timeout、unsafe descriptor、download/project failure、retry boundary与API/Frontend相同Task contract。

## 9. Shared UI与host integration

- [x] 9.1 在existing target/settings/list patterns加入backend选择、ComfyUI connection/workflow管理、API import、Frontend discovery与readiness，不创建第三套list/selection UI。
- [x] 9.2 接入Composer Send flow，按contract required/optional inputs复用prompt、attachments、Photoshop capture与existing TaskPlacement；含mask entry的workflow由3.9 readiness guard阻断，不硬编码D01 locators。
- [x] 9.3 接入Chrome persistence、iframe/Bridge、AssetStore与test harness，验证Task/History/Preview/Download以及reload/destroy。
- [x] 9.4 接入Photoshop UXP persistence、network/WebView、AssetStore/HostPort与existing placement writeback；遵守manifest/network/modal边界。
- [x] 9.5 验证Provider、API Graph与Frontend Tasks在same History view并列显示，Preview/Download/Retry/Place actions只依赖generic Task contract。

## 10. Validation与真实环境门槛

- [x] 10.1 运行execution package、Bridge integration、Application与app focused deterministic suites；default tests必须mock-only且不读取live credentials。
- [x] 10.2 使用`IMAGEN_COMFYUI_LIVE_BASE_URL`与`IMAGEN_COMFYUI_LIVE_SSH_TARGET`或local SSH alias运行owner-local AutoDL Chrome API/Frontend image-only gates；SSH password只从owner-local approved storage读取。
- [ ] 10.3 在真实Photoshop/UXP Developer Tool使用不含mask entry的API Graph执行smoke：capture image、upload、one `/prompt`、history/view、output placement与cleanup；mask runtime/smoke不属于本Change。
- [ ] 10.4 在真实Photoshop/UXP Developer Tool使用不含mask entry的Frontend workflow执行smoke：WebView/Bridge、contract widgets、native Queue one POST、receipt、history/view、placement、reload/destroy与cleanup；mask runtime/smoke不属于本Change。
- [x] 10.5 运行`pnpm check:policy`、`pnpm validate`与适用release gates，明确区分mock、AutoDL Chrome与manual UXP evidence。
- [x] 10.6 扫描tracked files，确认无credentials、fixed AutoDL values、workflow payload、generated images、raw logs、duplicate schema、asset/task/cache/placement systems或legacy aliases。
- [x] 10.7 重新执行CHANGE-01 stop-rule review；若CHANGE-02仍需修改Job、Workflow、GenerationBackend、Session queue或Task lifecycle public contract则停止并重新打开CHANGE-01。
- [x] 10.8 归档旧`add-comfyui-execution-backend` OpenSpec change并把稳定架构/testing facts写回canonical docs；不删除git branch或改写history。
