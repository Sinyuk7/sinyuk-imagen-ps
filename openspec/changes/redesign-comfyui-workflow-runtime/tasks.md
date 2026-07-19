## 1. Authority 与失败优先 harness

- [ ] 1.1 在旧 `add-comfyui-generation-backend` Change 标明本 Change 已取代其 ComfyUI 产品语义，保留尚未完成的 manual UXP evidence 为历史事实但不得继续作为实现 authority。
- [ ] 1.2 为 execution package 建立 Frontend/API Format、bounded workflow document、`object_info`、output-node metadata、multi-output history 与 zero-image history Case Bank，并先写失败断言。
- [ ] 1.3 为 Application 建立 singleton server settings、workflow repository、presentation state、binding override 与 completed-empty-output 的 `createTestHarness()`。
- [ ] 1.4 为 app 建立 Generation Workspace ViewModel、always-visible selectors、unused-input notices 与 ComfyUI-exclusive TAB 的 deterministic UI harness。
- [ ] 1.5 为 Bridge 建立 identity discovery、selected workflow open、Form values、value mutation、native Queue 与 reset/dispose 的 bounded JS/Python fixtures，移除 harness 对 Imagen contract schema 的依赖。

## 2. Singleton server settings 与 capability detection

- [ ] 2.1 在 Application 定义 `ComfyUiServerSettings`、`ComfyUiServerCapabilities` 与 singleton repository ports，删除 `connectionId`、connection list、display name 与 connection CRUD public contracts。
- [ ] 2.2 实现 Chrome 与 UXP singleton persistence adapters，并按 current-state policy 直接删除 legacy ComfyUI connection/profile persistence schema而不增加 migration alias。
- [ ] 2.3 实现显式 HTTP(S) 与 bare host/IP/port/path normalization、bounded HTTPS/HTTP candidate probe、userinfo/query/fragment/control-char rejection 与 canonical `baseUrl` persistence。
- [ ] 2.4 实现保留 reverse-proxy path 的 route join，以及 API、Frontend、Bridge 三类独立 capability probes、timeouts、cancellation 与 bounded errors。
- [ ] 2.5 添加 package/Application/host adapter contract cases，证明 singleton round-trip、candidate selection、base-path preservation、scoped capability failure 与 no-secret logging。

## 3. Workflow format、repository 与 discovery

- [ ] 3.1 实现 Frontend Save Format 与 API Format structural detector、2MB/2000 nodes/depth 32 等 bounded JSON guards，以及 ambiguous/mixed shape fail-closed cases。
- [ ] 3.2 实现 `ComfyUiWorkflowRecord`、content-derived imported identity、deep-cloned/deep-frozen imported snapshot 与 per-workflow presentation repository。
- [ ] 3.3 将 Frontend discovery 改为只返回全部 bounded canonical workflow identities，不逐个 load、compile、contract-filter 或 output-node-filter。
- [ ] 3.4 实现 selected-workflow deferred load、load identity/revision cache、Frontend open 与 imported API detail projection。
- [ ] 3.5 删除 workflow admission 对 `ImagenWorkflowBindingContract`、`ImagenWorkflowTypeContract`、marker title、fixed locator、fixed input cardinality 与预声明 operation 的依赖。
- [ ] 3.6 添加 discovery/import/load Case Bank，覆盖无动态输入、多文本、多图片、hard-coded values、custom nodes、mask nodes、无图片输出与 oversized/unsafe documents。

## 4. Format-neutral Workflow Form

- [ ] 4.1 定义 `WorkflowForm`、`WorkflowFormNode`、`WorkflowFormWidgetRef`、bounded value metadata 与 converter registry 的 transport-neutral public contracts。
- [ ] 4.2 实现 Frontend Canvas node/widget converter，覆盖 `images`、`masks`、`string`、`boolean`、`number`、`combo`、`segment` 与 `video` supported shapes。
- [ ] 4.3 实现 API graph literal input + bounded `object_info` converter，并确保 graph links、read-only values 与 unknown shapes 保持原值。
- [ ] 4.4 实现 muted/bypassed、`.` force-hide、registered default-show、`#` generic force-show 与 title-normalized stable ordering；禁止读取或写入任何 `sdppp_*` name。
- [ ] 4.5 在 shared UI 建立 compact dynamic Form renderer、value editor、reset/save states 与 UXP-safe controls，绑定 widget 仍保持原位可编辑。
- [ ] 4.6 添加 converter、visibility、ordering、unsupported value、Form persistence 与 renderer contract/UI cases。

## 5. Optional Text/Image bindings 与 overrides

- [ ] 5.1 实现 workflow-scoped `WorkflowPresentationState`，并生成唯一 writable text-like 与 upload-image candidates；invalid saved ref归一化为 `No binding`且不猜 replacement。
- [ ] 5.2 在 ComfyUI Composer 始终显示 Workflow、Text binding、Image binding selectors；零 candidate 时仍显示只含 `No binding` 的 selector。
- [ ] 5.3 实现 `workflow value < Form override < non-empty prompt < first attachment` snapshot resolver，不广播 prompt/attachment，不用空值覆盖下层值。
- [ ] 5.4 将 attachment materialization/upload barrier 收束到 selected Image binding 消费的第一张附件；`No binding` 时零 upload，额外附件不进入 execution inputs。
- [ ] 5.5 投影三条精确 unused-input notice，且删除 prompt、attachment、binding、candidate、`maxCount`、mask 或动态输入数量形成的 Send gate。
- [ ] 5.6 添加 candidate、stale binding、precedence、first-attachment、zero-upload、notice visibility 与 Send availability contract cases。

## 6. Output-node preflight 与 workflow submission

- [ ] 6.1 建立 bounded class metadata cache，并在 Send-time 验证至少一个 active `OUTPUT_NODE = True`；无 output node 返回 `invalid-workflow/prompt-no-outputs` 且 submission count 为零。
- [ ] 6.2 重写 API Format driver：clone完整 graph、应用 Form/Composer overrides、等待实际使用的 upload、单次 `POST /prompt`，并保留 server-issued prompt identity。
- [ ] 6.3 将 Bridge allowlist 改为 workflow list/open/import/form values/set values/submit/reset/dispose，删除 schema digest、contract summary、contract mutation 与 arbitrary property path payload。
- [ ] 6.4 重写 Frontend driver：打开 exact complete workflow、恢复 Form values、应用 Composer overrides、等待实际 upload，再调用 native Queue 恰好一次且 App-owned `/prompt` count 为零。
- [ ] 6.5 保留 operation dedupe、Canvas lease、Session lane、submission-started no-replay、`remoteMayContinue` 与 reload/dispose cleanup contracts，并用新 workflow identity替换 per-connection identity。
- [ ] 6.6 删除 execution package 与 Bridge integration 中的 Imagen contract parser/schema/generated validators、contract nodes 与 sync artifacts，不保留 `sdppp_*` 或 legacy compatibility aliases。
- [ ] 6.7 添加 API/Frontend driver 与 Bridge contracts，覆盖 complete graph、one-shot counts、output preflight、upload ordering、duplicate operation、unknown state、reload、dispose、timeout 与 cleanup。

## 7. Observation、outputs 与 History projection

- [ ] 7.1 重写 known-prompt output collector，按 bounded history node enumeration 与 node内顺序收集全部 `history.outputs[*].images[]`，并逐条执行 path/type/bytes/MIME/signature guards。
- [ ] 7.2 让 successful remote execution 接受 `outputs: []` 并形成 canonical `completed` Task；unsafe descriptors只产生 bounded warning且不阻断其它安全图片。
- [ ] 7.3 从 `completed && outputs.length === 0` 派生 `completed-without-image-output`，并保持 Preview、Download、Place actions disabled且不伪造 error。
- [ ] 7.4 添加 multiple output nodes、PreviewImage/SaveImage/custom standard images、unsafe mixed outputs 与 zero-image completion 的 execution/Application/app cases。

## 8. Generation Workspace ViewModel 与首页

- [ ] 8.1 建立统一 Generation Workspace controller/state，拥有 `generationMode`、shared Composer draft、Provider selection、ComfyUI workflow selection 与 mode-specific settings route。
- [ ] 8.2 实现 `buildProviderComposerViewModel()` 与 `buildComfyUiComposerViewModel()`，输出同一 `GenerationComposerViewModel` 与 backend-specific submit intent。
- [ ] 8.3 将 `MainPage` 迁移为只消费统一 projection，删除页面内 ComfyUI connection/contract/operation/readiness 分支与 backend payload assembly。
- [ ] 8.4 将 ComfyUI Send label/tooltip固定为运行 current workflow，并保证没有 Text/Image binding 或动态输入时仍可按 workflow原值提交。
- [ ] 8.5 将 `AppShell`、settings action 与 mode switch 接入统一 controller；切换 mode保留 shared draft与两侧selection，Settings内切TAB不反写generation mode。
- [ ] 8.6 添加 ViewModel/MainPage/AppShell contract与UI cases，覆盖双向 mode switch、draft retention、submit intent、settings route、notices与Provider regression。

## 9. ComfyUI-exclusive Settings TAB

- [ ] 9.1 将 Settings 重构为互斥 Provider/ComfyUI branches，并按 `Address + Connect + status`、collapsed Advanced、workflow list/import/refresh、selected detail + dynamic Form 固定顺序渲染 ComfyUI TAB。
- [ ] 9.2 实现 singleton Address编辑、Connect progress、API/Frontend/Bridge scoped status与默认折叠 Advanced settings，且保持 selection/Form values稳定。
- [ ] 9.3 实现同 TAB workflow identity tree、Import JSON/File、refresh、loading/error/empty states、selected detail、back/reset/save interactions。
- [ ] 9.4 删除 `ComfyUiConnectionPage`、connection rows、Add Connection、Provider/global/prompt/billing内容以及 Run/AutoRun/batch/global Stop/History等重复入口。
- [ ] 9.5 添加 Chrome与fake-UXP UI cases，覆盖 fixed hierarchy、narrow viewport、API-only state、Frontend unavailable、same-TAB navigation、无重叠与无重复execution controls。

## 10. Host composition、cutover 与 validation

- [ ] 10.1 更新 Chrome/UXP composition与app services，注入 singleton settings、workflow/form repositories、new Bridge/runtime adapters与稳定 backend identity `comfyui`，保留Provider和shared Task/Asset/Placement owners。
- [ ] 10.2 运行 `pnpm --filter @imagen-ps/execution-backend-comfyui build`、对应 package tests、`pnpm --filter @imagen-ps/application test` 与全部新 deterministic Case Banks。
- [ ] 10.3 运行 Bridge Python/Node suites、`pnpm --filter @imagen-ps/app test`、`pnpm --filter @imagen-ps/app test:ui`、`pnpm test:uxp` 与 `pnpm check:policy`。
- [ ] 10.4 运行 `pnpm validate` 与 `pnpm release:verify`，并扫描 tracked files确认无 credentials、owner-local URLs、workflow payloads、generated images、raw logs、contract schema、legacy aliases或 `sdppp_*` names。
- [ ] 10.5 使用 owner-local image-only API Format workflow运行 opt-in Chrome live gate，证明 singleton Address、optional binding、one `/prompt`、history/view、TaskOutput与zero-replay；不测试 mask。
- [ ] 10.6 使用 owner-local image-only Frontend workflow运行 opt-in Chrome live gate，证明unfiltered discovery、selected load、dynamic Form、native Queue、history/view与cleanup；不测试 mask。
- [ ] 10.7 在真实 Photoshop/UXP Developer Tool 分别运行 API与Frontend image-only smoke，验证settings、首页selectors、capture/upload、Send、output placement、reload/destroy与cleanup；明确跳过 mask-specific proof。
- [ ] 10.8 将稳定 architecture/testing/release facts写回 `docs/ENGINEERING_CONTEXT.md`、`docs/TESTING.md` 或 matching `AGENTS.md`，删除被新 contract 取代的旧说明。
- [ ] 10.9 严格校验并完成本 Change 后归档 `add-comfyui-generation-backend`，确保旧 Change不再作为ComfyUI authority且不误标其旧manual tasks为新语义证据。
