## 1. Authority 与失败优先 harness

- [ ] 1.1 在旧 `add-comfyui-generation-backend` Change 标明本 Change 已取代其 ComfyUI 产品语义；旧 manual UXP tasks 只作为历史事实，不得作为本 Change 的 authority 或验收证据。
- [ ] 1.2 为 execution package 建立 internal Frontend/API Format、bounded workflow document、`object_info`、output-node metadata、native validation error、multi-output history 与 zero-image history Case Bank。
- [ ] 1.3 为 Application 建立 `PersistedComfyUiState`、runtime workflow cache、revision-scoped mapping、session-only parameter draft 与 completed-empty-output 的 `createTestHarness()`。
- [ ] 1.4 为 app 建立 Generation Workspace ViewModel、ComfyUI Settings root、Workflow Picker、conditional Input Mapping 与 `#`-exposed Parameters 的 deterministic UI harness。
- [ ] 1.5 为 Bridge 建立 identity discovery、selected workflow open、Form values、value mutation、native Queue、reset/dispose 与 bounded native error fixtures，移除 harness 对 Imagen contract schema 的依赖。

## 2. Singleton connection 与状态生命周期

- [ ] 2.1 在 Application 定义只含 `baseUrl`、`selectedWorkflowId` 与 revision-scoped explicit mappings 的 `PersistedComfyUiState`，删除 `connectionId`、connection list、display name 与 connection CRUD public contracts。
- [ ] 2.2 将 `requestTimeoutMs`、`workflowLoadTimeoutMs`、observation policy 与 numeric renderer policy 移入 code-owned `ComfyUiRuntimePolicy`，不得通过 production Settings 持久化或编辑。
- [ ] 2.3 实现 Chrome 与 UXP persistence adapters，只保存 canonical `baseUrl`、`selectedWorkflowId` 与 explicit ambiguous mappings；不得保存 workflow JSON、catalog、capabilities、probe results、metadata cache、parameter drafts 或 dirty state。
- [ ] 2.4 实现显式 HTTP(S) 与 bare host/IP/port/path normalization、bounded HTTPS/HTTP candidate probe、userinfo/query/fragment/control-char rejection 与 reverse-proxy base-path-preserving route join。
- [ ] 2.5 内部保持 API、workflow discovery、native Queue capability facts 分离，并向 UI 投影一个 action-oriented connection/workflow status；不得显示技术 capability badges。
- [ ] 2.6 添加 package/Application/host adapter contracts，证明 persistence allowlist、session restart、revision invalidation、candidate selection、base-path preservation、runtime-only caches 与 no-secret logging。

## 3. Remote Workflow discovery 与 selection

- [ ] 3.1 保留 Frontend Save Format/API Format structural detector、bounded document validator 与 fixtures作为 internal driver capability，不向 production UI 暴露 format、source 或 import entry。
- [ ] 3.2 定义只面向 ComfyUI remote saved workflows 的 `WorkflowIdentity`，包含稳定 `workflowId`、`displayName`、canonical path 与 revision/fingerprint；不得建立 imported workflow repository 或 local JSON CRUD。
- [ ] 3.3 将 Frontend discovery 改为返回全部 bounded canonical workflow identities，不逐个 load、compile、contract-filter、binding-filter 或 output-node-filter。
- [ ] 3.4 实现 selected-workflow deferred open、document/revision runtime cache、stale-result suppression 与 refresh invalidation；workflow document不得跨 plugin session 持久化。
- [ ] 3.5 持久化当前 `selectedWorkflowId`；startup 时仅在当前 catalog/revision仍可解析时恢复，否则显示 scoped unavailable state且不猜 replacement。
- [ ] 3.6 添加 discovery/selection Case Bank，覆盖 search/group paths、duplicate identities、revision change、missing workflow、no dynamic inputs、multiple text/image inputs、custom/mask nodes 与 oversized/unsafe documents。

## 4. Opt-in Workflow Parameters

- [ ] 4.1 定义 format-neutral `WorkflowForm`、`WorkflowFormNode`、`WorkflowFormWidgetRef`、bounded value metadata 与 converter registry，UI不得感知 Frontend/API format。
- [ ] 4.2 实现 Frontend Canvas converter与 internal API graph + `object_info` converter，保留 graph links、read-only values、unknown/custom shapes 与原始 workflow values。
- [ ] 4.3 固定 node visibility：muted/bypassed隐藏，`.` prefix隐藏，`#` prefix显示，其余全部隐藏；不得因 registered converter 存在而默认显示 node。
- [ ] 4.4 以移除首个 `#` 并 trim 后的 title 作为 section label和排序 key，使用 locale-aware numeric natural sort，并以 workflow node order 作为稳定 tie-breaker。
- [ ] 4.5 V1只为 exposed node 渲染安全 writable `string`、`multiline-string`、`boolean`、`number`、`combo` 与 `seed` editors，并保持 node内 widget原顺序。
- [ ] 4.6 linked input、read-only value、image/mask/video、arbitrary JSON、file browser、complex segment 与 unsupported custom widget不得显示 editor；跳过 widget不得拒绝 workflow或改变其原值。
- [ ] 4.7 实现 per-workflow-revision `WorkflowRuntimeDraft`：从 ComfyUI saved values初始化，在当前 Photoshop/plugin session内跨 Settings/MainPage、重复 Send与 workflow来回切换保留，reload或revision变化时清除。
- [ ] 4.8 Parameter edit必须立即更新 session draft并作用于 future sends；不得增加 Save、Apply、Reset、dirty indicator、unsaved confirmation或跨session override migration。
- [ ] 4.9 添加 visibility、natural ordering、safe editor allowlist、unsupported widget、immediate draft update、session retention与reload/revision reset contract/UI cases。

## 5. Conditional Prompt/Image mapping

- [ ] 5.1 生成唯一 writable text-like literal candidates与upload-image candidates；link-shaped、read-only、ambiguous locator或unsupported widget不得进入candidate list。
- [ ] 5.2 对每类 input执行固定投影：0 candidate隐藏selector并显示“不接收当前输入”的setting notice；1 candidate自动绑定且隐藏selector；2+ candidates显示target selector。
- [ ] 5.3 当Prompt与Image都无需人工选择时隐藏整个 Input Mapping section；不得在首页或Settings常态显示 `No binding` controls。
- [ ] 5.4 只持久化2+ candidate情况下用户明确选择的mapping，并用`workflowId + revision/fingerprint`定位；auto-binding不得持久化。
- [ ] 5.5 revision变化、target消失或type不兼容时使saved mapping失效，不猜replacement；重新显示歧义selector但仍允许workflow按saved values运行。
- [ ] 5.6 Send snapshot按`workflow saved value < session parameter draft < non-empty prompt < first attachment`解析；prompt/attachment只覆盖resolved target，不广播到多个widgets。
- [ ] 5.7 Image mapping有效时只materialize/upload第一张attachment；无resolved image target时零upload，额外attachments不进入execution inputs。
- [ ] 5.8 保留精确non-blocking notices：当前提示词未使用、附件不会发送、只使用第一张附件；mapping、prompt、attachment或candidate数量不得形成Send gate。
- [ ] 5.9 添加0/1/many candidates、explicit mapping persistence、stale revision、precedence、first-attachment、zero-upload、setting notices与main-page notices cases。

## 6. Native validation 与 one-shot submission

- [ ] 6.1 建立bounded class metadata cache作为optimization：metadata已知且确认无active output node时可本地fast-fail；metadata unknown时必须继续到native validation，不得返回plugin false negative。
- [ ] 6.2 重写internal API Format driver：clone完整graph、应用session/Composer overrides、等待实际upload、单次`POST /prompt`，并将native `error`/`node_errors`映射为bounded workflow validation error。
- [ ] 6.3 将Bridge allowlist改为workflow list/open/form values/set values/submit/reset/dispose；删除import、schema digest、contract summary、contract mutation与arbitrary property path payload。
- [ ] 6.4 重写Frontend driver：打开exact remote workflow、恢复session draft、应用Composer overrides、等待实际upload，再调用native Queue恰好一次并将native validation failure映射为bounded error。
- [ ] 6.5 保留operation dedupe、Canvas lease、Session lane、submission-started no-replay、`remoteMayContinue`与reload/dispose cleanup，并使用workflow identity而非connection identity。
- [ ] 6.6 删除execution package与Bridge中的Imagen contract parser/schema/generated validators、contract nodes与sync artifacts，不保留`sdppp_*`或legacy compatibility aliases。
- [ ] 6.7 添加known-no-output fast-fail、metadata-unknown custom node pass-through、native API/Queue rejection、one-shot counts、upload ordering、duplicate operation、unknown state、reload/dispose与cleanup contracts。

## 7. Observation、outputs 与 History projection

- [ ] 7.1 重写known-prompt output collector，按bounded history node enumeration与node内顺序收集全部`history.outputs[*].images[]`，并逐条执行path/type/bytes/MIME/signature guards。
- [ ] 7.2 successful remote execution必须接受`outputs: []`并形成canonical `completed` Task；unsafe descriptors只产生bounded warning且不阻断其它安全图片。
- [ ] 7.3 从`completed && outputs.length === 0`派生`completed-without-image-output`，Preview、Download、Place保持disabled且不得伪造error。
- [ ] 7.4 添加multiple output nodes、PreviewImage/SaveImage/custom standard images、unsafe mixed outputs与zero-image completion的execution/Application/app cases。

## 8. Generation Workspace ViewModel 与主页面

- [ ] 8.1 建立统一Generation Workspace controller，拥有`generationMode`、shared Composer draft、Provider selection、ComfyUI `selectedWorkflowId`与mode-specific settings route。
- [ ] 8.2 实现Provider/ComfyUI builders，输出统一`GenerationComposerViewModel`与backend-specific submit intent；ComfyUI projection不得包含format/source/capability技术字段。
- [ ] 8.3 将`MainPage`收敛为聊天记录、Prompt、Attachments、Send、results/History与current target summary；移除Text/Image mapping selectors、connection/contract/operation branches与backend payload assembly。
- [ ] 8.4 将ComfyUI Send固定为运行current selected complete workflow，并读取Settings产生的resolved mapping与session parameter draft；没有mapping或parameters时仍按ComfyUI saved values运行。
- [ ] 8.5 将`AppShell`、settings action与mode switch接入统一controller；切换mode保留shared draft与两侧selection，Settings内切TAB不得反写generation mode。
- [ ] 8.6 添加ViewModel/MainPage/AppShell cases，覆盖双向mode switch、draft retention、current workflow summary、submit intent、settings route、unused-input notices与Provider regression。

## 9. ComfyUI Workflow Configuration Surface

- [ ] 9.1 将Settings重构为互斥Provider/ComfyUI branches；ComfyUI root按Connection、Current Workflow、conditional Input Mapping、Workflow Parameters、conditional Diagnostics顺序渲染。
- [ ] 9.2 Connection只提供Address、Connect/Test action与一个user-facing status；删除Advanced settings与API/Frontend/Bridge技术状态展示。
- [ ] 9.3 Current Workflow只显示name、canonical path、Change workflow、Refresh与Open in ComfyUI；不得永久展开workflow tree或显示format/source badge。
- [ ] 9.4 实现独立Workflow Picker子页，包含search、Recent、按canonical path分组的remote list与loading/error/empty states；选择后立即返回Settings root。
- [ ] 9.5 Input Mapping只在0候选notice或2+候选歧义存在时显示；1 candidate auto-binding不得产生selector或section噪音。
- [ ] 9.6 Workflow Parameters按`#` node section展示并立即写入session draft；无exposed node时只显示一次empty-state guidance，不永久显示教学文案。
- [ ] 9.7 Diagnostics只在error state或diagnostics build出现，可提供bounded diagnostics与copy logs；不得暴露runtime policy编辑器或raw workflow/payload/secrets。
- [ ] 9.8 删除`ComfyUiConnectionPage`、connection rows、Add Connection、Import JSON/File、Save/Apply/Reset、Provider/global/prompt/billing内容与Run/AutoRun/batch/global Stop/History重复入口。
- [ ] 9.9 添加Chrome与fake-UXP UI cases，覆盖root hierarchy、Picker navigation/search/grouping、narrow viewport、merged status、conditional mapping、parameter empty state、Diagnostics与无重复execution controls。
- [ ] 9.10 审计并更新ComfyUI persistence/management/settings/MainPage tests与fakes，删除对legacy connection list、contract API、imported workflow、persistent override、always-visible selectors及Advanced UI的断言。

## 10. Host composition、validation 与 writeback

- [ ] 10.1 更新Chrome/UXP composition与app services，注入singleton persistence、runtime workflow/form caches、session draft、revision mapping与new Bridge/runtime adapters，保留Provider和shared Task/Asset/Placement owners。
- [ ] 10.2 运行`pnpm --filter @imagen-ps/execution-backend-comfyui build`、对应package tests、`pnpm --filter @imagen-ps/application test`与全部新deterministic Case Banks。
- [ ] 10.3 运行Bridge Python/Node suites、`pnpm --filter @imagen-ps/app test`、`pnpm --filter @imagen-ps/app test:ui`、`pnpm test:uxp`与`pnpm check:policy`。
- [ ] 10.4 运行`pnpm validate`与`pnpm release:verify`，并扫描tracked files确认无credentials、owner-local URLs、workflow payloads、generated images、raw logs、contract schema、legacy aliases或`sdppp_*` names。
- [ ] 10.5 使用owner-local API Format fixture运行internal driver live gate，证明native validation、optional injection、one`/prompt`、history/view、TaskOutput与zero replay；不得建立production Import入口且不测试mask。
- [ ] 10.6 使用ComfyUI remote saved Frontend workflow运行product Chrome live gate，证明discovery、Picker selection、`#` Parameters、conditional mapping、native Queue、history/view与cleanup；不测试mask。
- [ ] 10.7 在真实Photoshop/UXP Developer Tool运行remote Frontend image-only smoke，验证Connection、Workflow Picker、Settings draft、主页面capture/Send、output placement、reload/destroy与cleanup；明确跳过mask-specific proof。
- [ ] 10.8 将稳定architecture/testing/release facts写回`docs/ENGINEERING_CONTEXT.md`、`docs/TESTING.md`或matching`AGENTS.md`，删除被新contract取代的旧说明。
- [ ] 10.9 严格校验并完成本Change后归档`add-comfyui-generation-backend`，确保旧Change不再作为ComfyUI authority且不误标旧manual tasks为新语义证据。
