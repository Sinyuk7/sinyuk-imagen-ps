## 1. 前置架构与authority门槛

- [ ] 1.1 完成`generalize-task-job-execution-architecture`全部tasks、Task v2 cutover、strict OpenSpec validation、non-Provider fake proof与`pnpm validate`。
- [ ] 1.2 对照CHANGE-01确认ComfyUI只实现既有`GenerationBackend`、`JobExecutionRequest`、`ExecutionLane`、`ExecutionAdapter`与Task projection seams；若需要修改公共contract则停止CHANGE-02并重新打开CHANGE-01。
- [ ] 1.3 将旧`add-comfyui-execution-backend` OpenSpec标记为被取代并禁止复制其parallel Session/Task/asset/cache设计；不删除git branch、不改写history、不把ignored local build output作为产品任务。
- [ ] 1.4 固定module import map：execution package不得依赖Application/React/DOM/UXP，Application不得拥有raw ComfyUI transport，host adapters不得复制parser/uploader/projector。

## 2. Execution package与canonical workflow contract

- [ ] 2.1 从tracked source建立`@imagen-ps/execution-backend-comfyui` package、build/test configs与transport-neutral public exports；default tests必须mock-only。
- [ ] 2.2 基于真实D01 workflow定义并验证`ImagenWorkflowBindingContract`与`ImagenWorkflowTypeContract` stable class IDs及V1 JSON schema，覆盖schemaVersion、operation、role/slot、required/dataType、locator与maskEncoding。
- [ ] 2.3 在execution package实现authoritative parser/validator、role+slot严格merge、operation/cardinality/type/encoding validation以及64KB per-node、32 entries、128-char locator bounds；Application、drivers与host adapters只消费canonical result。
- [ ] 2.4 在execution package建立single canonical schema与valid/invalid fixture Case Bank；integration runtime schema/validator只能由canonical source生成/复制，不得手写schema或独立parser。
- [ ] 2.5 建立TS/Python/JS cross-language conformance harness，验证相同fixtures得到相同accept/reject结果，并验证handshake schemaVersion与SHA-256 digest一致。
- [ ] 2.6 添加workflow contract authoritative suite，覆盖missing/duplicate/extra/discontinuous slots、operation conflict、mask encoding、output ordering与unsupported version。

## 3. Connection、workflow import与target selection

- [ ] 3.1 在Application定义ComfyUI connection、workflow与repository ports；V1 connection只允许unauthenticated HTTP(S)/WS并拒绝userinfo、auth、secretRefs与custom headers。
- [ ] 3.2 实现Chrome与UXP connection/workflow persistence adapters及list/get/save/delete/test commands，不新增secret store或ComfyUI-specific cache。
- [ ] 3.3 实现API Graph importer，只接受plain ComfyUI API Format并执行2MB、2000 nodes、depth 32、nodeId 128、class type 256 bounds；拒绝Frontend JSON、cycle、prototype与non-finite values。
- [ ] 3.4 对合法API Graph保存deep-cloned/deep-frozen snapshot并在upload/submission前验证两个contract nodes与literal targets。
- [ ] 3.5 定义current-state `GenerationTargetSelection`：Provider继续使用profile/model，ComfyUI只保存workflowId；connection/source从workflow repository派生。
- [ ] 3.6 实现target cleanup：删除workflow/connection、切换backend或selected workflow invalid时清空selection，不自动选择replacement且不改变Provider既有行为。
- [ ] 3.7 实现source-specific readiness：API要求connection/graph/contract，Frontend额外要求remote path、Bridge tuple、schema digest与native Queue capabilities。
- [ ] 3.8 添加Application cases覆盖malformed/oversized/frontend-format import、repository round-trip、unauthenticated boundary、target cleanup与readiness transitions。

## 4. Bridge integration与fixed protocol

- [ ] 4.1 建立`integrations/comfyui-imagen-bridge` tracked source，提供两个contract nodes、bounded status/version endpoint与page-side Bridge；不增加其他project workflow nodes。
- [ ] 4.2 实现固定request/response envelope与`handshake/list-workflows/submit-workflow/reset/dispose` allowlist，拒绝unknown commands和unknown fields。
- [ ] 4.3 实施2MB message、512-byte path、1000 list entries、16 mutations、128-char ids与30s configure timeout bounds。
- [ ] 4.4 实现handshake identity/version/capability/limits/schema digest，固定并验证pinned frontend/core/Bridge tuple。
- [ ] 4.5 实现Frontend workflow discovery，返回canonical remote path与bounded contract summary；不返回raw workflow、Canvas、compiled graph或client id。
- [ ] 4.6 实现submit payload validation，仅允许operationId、remotePath、batchCount 1、contract-derived locator/value mutations与timeouts；拒绝raw bytes、upload handles、graph、Task/Job metadata、promptId request及script/property paths。
- [ ] 4.7 添加Bridge authoritative contract suite，覆盖origin/source/load identity、payload/limits、schema digest、path/list bounds、invalid command与sanitized error envelope。

## 5. Shared asset resolution与upload barrier

- [ ] 5.1 在Composer Send/admission阶段复用`HostImageAsset -> ImageResource -> StoredAssetRef -> AssetStore` materialize ordered images与frame-consistent canonical mask。
- [ ] 5.2 直接复用CHANGE-01 `TaskPlacement`的`exact-frame/document-only/unbound`，禁止新增ComfyUI placement evidence、document selector或generic evidence副本。
- [ ] 5.3 实现execution-time StoredAssetRef resolver、MIME/signature/size guards与explicit mask encoding；Bridge永不接收raw bytes。
- [ ] 5.4 实现共享`/upload/image` multipart builder、bounded response descriptor validator与exact widget value mapper，供两个drivers唯一复用。
- [ ] 5.5 实现required upload barrier：全部uploads成功前API `/prompt`与Frontend native Queue call count均为0；任一失败终止且不自动submission。
- [ ] 5.6 添加shared asset/upload Case Bank，覆盖missing/evicted refs、image/mask geometry、MIME/signature/size、malformed descriptor、partial remote orphan与AbortSignal。

## 6. API Graph driver

- [ ] 6.1 实现admitted graph clone与contract-only prompt/image/mask literal mutation，保留未提供optional defaults并验证ordered output targets。
- [ ] 6.2 实现ephemeral client identity/realtime channel与App-owned单次`POST /prompt`调用；promptId只能取自bounded server acknowledgement，不得由App预造或override。
- [ ] 6.3 实现runtime-only API receipt并立即进入known-prompt observer；receipt/promptId不得进入Task、Job input、History或durable store。
- [ ] 6.4 实现timeout/network/invalid acknowledgement的submission-unknown、remoteMayContinue与no-replay policy；reload/dispose不恢复、不reattach、不从global history猜identity。
- [ ] 6.5 添加API driver contract cases，覆盖optional defaults、ordered inputs、one POST、server promptId、receipt mismatch、unknown state、abort与safe pre-submit retry。
- [ ] 6.6 在owner-local AutoDL Chrome harness证明真实API Graph D01 image+mask upload、one `/prompt`、server receipt、history/view与TaskOutput后再进入Frontend live proof。

## 7. Frontend Queue driver

- [ ] 7.1 实现Application/host Bridge session lifecycle；FrontendQueueDriver在dispatch调用栈生成runtime-only operationId，禁止写入GenerationCommand、Job input、Task或History。
- [ ] 7.2 使用CHANGE-01 per-connection lane cap 1作为scheduler authority；Canvas lease只保护已dispatch open/mutate/Queue/reset临界区且不得回调Session或获取新lane。
- [ ] 7.3 实现exact workflow open、operation-bound configure readiness、contract/widget validation与contract-derived prompt/image/mask mutation。
- [ ] 7.4 调用native `app.queuePrompt(0, 1)`恰好一次；App `/prompt` call count必须为0。
- [ ] 7.5 实现narrow pass-through receipt observer，保持current `api.queuePrompt` arguments/response/real POST并只restore自己的wrapper；无法安全组合时fail closed。
- [ ] 7.6 实现page-load operation dedupe：duplicate返回原bounded receipt且不Queue；reload更换loadId、清空page state且Application不得把旧operation发送到新load。
- [ ] 7.7 在finally清除Canvas lease waiter并reset/release任何partially acquired lease；acquisition/configure timeout、abort、reload、dispose或wrapper conflict必须返回bounded error并经正常Job terminal path释放Session lane，不得造成widget交叉、lock leak或automatic replay。
- [ ] 7.8 添加Frontend/Bridge cases覆盖concurrency、duplicate operation、identity mismatch、mutation bounds、reload/dispose、receipt unknown、Frontend one POST/App zero POST、lease acquisition timeout与lane release ordering。
- [ ] 7.9 在owner-local AutoDL Chrome harness证明真实Frontend D01 image+mask widget mutation、native Queue、runtime receipt、history/view与cleanup。

## 8. Shared observation、errors与Application backend

- [ ] 8.1 实现known-prompt WebSocket hints与bounded history/queue reconciliation，忽略unrelated prompts与server-global queue signals。
- [ ] 8.2 实现contract-owned ordered output collection、safe descriptor/path validation、`/view` status/byte/MIME/signature guards与download。
- [ ] 8.3 把validated output bytes写入existing AssetStore并形成ordered StoredAssetRefs/TaskOutputs；不创建ComfyUI result cache/history。
- [ ] 8.4 固定shared error stages`prepare/upload/submit/observe/download/project`与approved bounded codes，禁止raw endpoint/path/graph/payload/stack进入Task/log。
- [ ] 8.5 实现retry disposition：submission call开始前的deterministic prepare/upload failure可same Task/new Job；submit开始后只能new Task，unknown states标记remoteMayContinue。
- [ ] 8.6 实现Application `ComfyUiGenerationBackend` admission、readiness、connection lane、retry policy、generic execution summary与terminal Task projection；不得执行transport。
- [ ] 8.7 实现reload/startup行为：无durable receipt recovery；可能已提交的running Task按CHANGE-01变为interrupted，并只通过generic `TaskError.details.remoteMayContinue`保留bounded事实。
- [ ] 8.8 添加shared result/backend cases，覆盖multiple outputs、remote failure/unknown、history timeout、unsafe descriptor、download/project failure、retry boundary与API/Frontend相同Task contract。

## 9. Shared UI与host integration

- [ ] 9.1 在existing target/settings/list patterns加入backend选择、ComfyUI connection/workflow管理、API import、Frontend discovery与readiness，不创建第三套list/selection UI。
- [ ] 9.2 接入Composer Send flow，按contract required/optional inputs复用prompt、attachments、Photoshop capture、mask source与existing TaskPlacement，不硬编码D01 locators。
- [ ] 9.3 接入Chrome persistence、iframe/Bridge、AssetStore与test harness，验证Task/History/Preview/Download以及reload/destroy。
- [ ] 9.4 接入Photoshop UXP persistence、network/WebView、AssetStore/HostPort与existing placement writeback；遵守manifest/network/modal边界。
- [ ] 9.5 验证Provider、API Graph与Frontend Tasks在same History view并列显示，Preview/Download/Retry/Place actions只依赖generic Task contract。

## 10. Validation与真实环境门槛

- [ ] 10.1 运行execution package、Bridge integration、Application与app focused deterministic suites；default tests必须mock-only且不读取live credentials。
- [ ] 10.2 使用`IMAGEN_COMFYUI_LIVE_BASE_URL`与`IMAGEN_COMFYUI_LIVE_SSH_TARGET`或local SSH alias运行owner-local AutoDL Chrome API/Frontend gates；SSH password只从owner-local approved storage读取。
- [ ] 10.3 在真实Photoshop/UXP Developer Tool执行API Graph smoke：capture image、selection mask、upload、one `/prompt`、history/view、output placement与cleanup。
- [ ] 10.4 在真实Photoshop/UXP Developer Tool执行Frontend smoke：WebView/Bridge、contract widgets、native Queue one POST、receipt、history/view、placement、reload/destroy与cleanup。
- [ ] 10.5 运行`pnpm check:policy`、`pnpm validate`与适用release gates，明确区分mock、AutoDL Chrome与manual UXP evidence。
- [ ] 10.6 扫描tracked files，确认无credentials、fixed AutoDL values、workflow payload、generated images、raw logs、duplicate schema、asset/task/cache/placement systems或legacy aliases。
- [ ] 10.7 重新执行CHANGE-01 stop-rule review；若CHANGE-02仍需修改Job、Workflow、GenerationBackend、Session queue或Task lifecycle public contract则停止并重新打开CHANGE-01。
- [ ] 10.8 归档旧`add-comfyui-execution-backend` OpenSpec change并把稳定架构/testing facts写回canonical docs；不删除git branch或改写history。
