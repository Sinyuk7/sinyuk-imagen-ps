## Context

现有 ComfyUI backend 已接入 shared Task/Job/Session、AssetStore、History 与 Photoshop Placement，但产品模型围绕多 `ComfyUiConnection`、两类 source record、两个 Imagen contract nodes、预声明 operation 与 output binding 建立。实际结果是 workflow discovery 必须加载或验证 contract，普通 ComfyUI workflow 被过滤，Composer prompt/attachments 成为 workflow admission 条件，Settings 还把 Provider/global 内容与 ComfyUI connection list混在同一 TAB。

参考 monorepo 的稳定行为是：一个 `comfyURL`、列出 remote workflow paths、打开完整 Frontend workflow、把 Canvas widgets投影为 form、等待图片上传后调用native Queue。它不要求 Imagen marker nodes，也不把 workflow 分类为 `text-to-image` 或 `image-edit`。本设计复用该交互模型，但继续遵守本仓库既有 Task/Job/asset/logging/UXP safety owners，不复制 monorepo store、task、resource URI 或 `sdppp_*` namespace。

ComfyUI server 对 runnable prompt 的原生最低要求是 graph 可解析且至少包含一个 class metadata 为 `output_node: true` 的 node；没有 output node 时 remote 会返回 `prompt_no_outputs`。output node 不保证 `history.outputs` 一定包含 `images[]`，因此 workflow runnable 与 image result success必须分离。

## Goals / Non-Goals

**Goals:**

- ComfyUI 使用一个持久化 `baseUrl` 与一组 collapsed advanced settings，不存在 ComfyUI profile/connection list。
- Frontend Save Format 与 API Format workflow 都能进入同一 workflow list、form、binding 与 Send体验。
- workflow discovery 快速列出完整 bounded identity，不再 contract-filter；只有 selected workflow 才加载详细结构。
- Send 固定表示运行当前完整 workflow；prompt 与 attachments 仅在用户选择 binding 且值存在时覆盖。
- Workflow、Text binding 与 Image binding selectors 始终显示；未使用输入只显示简短 notice，不阻塞 Send。
- 动态 form支持 monorepo 的converter与`#`/`.` visibility语义，但使用项目自己的类型和命名。
- Provider与ComfyUI通过一个Generation Workspace ViewModel向`MainPage`投影UI和submit intent。
- ComfyUI TAB独占其所有配置与workflow UI，不泄漏Provider/global/prompt settings。
- execution success无图片时形成durable completed Task，并有明确UI projection。
- deterministic harness先覆盖format、form、binding、UI projection、submission与output；real Chrome/UXP只做后续显式gate。

**Non-Goals:**

- 不实现ComfyUI authentication、custom headers、secret query或credential profiles。
- 不实现mask-specific Photoshop capture/materialization、mask binding或mask live/UXP acceptance；包含mask/custom nodes的workflow仍可按原值运行。
- 不复制monorepo的Task system、UploadPass registry、resource URI/cache或Provider architecture。
- 不在ComfyUI TAB加入Run、AutoRun、batch multiplier或第二套execution/history入口。
- 不保证任意custom node都能得到原生精美editor；unsupported widget保持workflow原值。
- 不修改Provider transport、profile/model repository与capability truth。

## Decisions

### 1. 新Change成为唯一ComfyUI authority

`redesign-comfyui-workflow-runtime`完成后，`add-comfyui-generation-backend`不得继续指导产品语义或实现。可复用的只有shared backend seam、HTTP/WebSocket、upload/history/download safety、one-shot submission、Task projection与host adapters；多connection、Imagen contract schema、mask readiness guard、contract-only mutation、contract-only output collection与connection editor全部删除或替换。

本项目是current-state、零用户、零production data；不保留旧ComfyUI persistence schema或`sdppp_*`兼容alias。Provider数据与shared Task history不参与该cutover。

### 2. Singleton server settings取代connection repository

Application拥有一个record：

```ts
interface ComfyUiServerSettings {
  readonly baseUrl: string;
  readonly requestTimeoutMs: number;
  readonly workflowLoadTimeoutMs: number;
  readonly observationTimeoutMs: number;
  readonly useSliderForNumberWidget: boolean;
}
```

不再保存`connectionId`、display name、connection list或per-workflow connection relation。需要lane/history identity时内部使用稳定backend identity `comfyui`，不得重新暴露成profile。

Address normalization接受显式HTTP(S) URL与bare host/IP/port/path。显式scheme原样规范化；缺少scheme时构造bounded HTTPS/HTTP candidates并选择第一个通过ComfyUI capability probe的candidate。拒绝userinfo、query、fragment、control chars与unsupported scheme。保留reverse-proxy path并规范化trailing slash；所有API routes必须通过base-path-preserving join构造，不能使用丢弃path prefix的root-relative URL。

Connection evidence分开记录：

```ts
interface ComfyUiServerCapabilities {
  readonly api: 'ready' | 'unavailable';
  readonly frontend: 'ready' | 'unavailable';
  readonly bridge: 'compatible' | 'incompatible' | 'unavailable';
}
```

`baseUrl`不拥有Frontend/API workflow format。API probe使用native bounded endpoint；Bridge status只判断Frontend workflow controls，不再作为API readiness唯一证据。

### 3. Workflow identity与format detection统一

Workflow record不保存Imagen contract或connection relation：

```ts
interface ComfyUiWorkflowRecord {
  readonly workflowId: string;
  readonly displayName: string;
  readonly source:
    | { readonly kind: 'remote-frontend'; readonly remotePath: string }
    | { readonly kind: 'imported-json'; readonly document: BoundedWorkflowDocument };
  readonly format: 'frontend' | 'api';
}
```

Remote Frontend discovery先通过Bridge返回bounded canonical paths，不下载、编译或验证每个workflow。API Format没有标准remote list endpoint，因此通过同一ComfyUI TAB内Import JSON/File加入。Imported document使用structural signature自动检测：Frontend Format要求top-level `nodes[]`与graph save fields；API Format要求non-empty node map且每个node包含bounded `class_type`与plain `inputs`。ambiguous或mixed shape fail closed。

成功import保存deep-cloned/deep-frozen snapshot与content-derived stable identity。remote path选择后才打开workflow、取得form structure/current values与可提交representation，并按workflow revision/load identity缓存。

### 4. Workflow准入只保留结构、安全边界与output-node preflight

Importer/loader继续执行2MB、2000 nodes、depth 32、bounded ids/class names、plain JSON、finite values、no cycle/no prototype等limits。它不要求prompt/image binding、固定node title、Imagen marker、固定图片数量、operation或指定image output。

Send-time preflight把selected workflow转换为canonical API prompt representation：API Format直接clone；Frontend Format由compatible Frontend runtime准备并保留native Queue ownership。Preflight必须通过class metadata证明至少一个active `OUTPUT_NODE = True`；API workflow优先使用bounded `/object_info/{class_type}` cache，Frontend workflow可使用loaded node definition/compiled prompt metadata。

没有output node时返回direct bounded `invalid-workflow/prompt-no-outputs` error且零submission。存在output node但最终无`images[]`仍属于successful remote execution。

### 5. Workflow Form是唯一动态widget projection

新增format-neutral model：

```ts
interface WorkflowForm {
  readonly workflowId: string;
  readonly nodes: Readonly<Record<string, WorkflowFormNode>>;
  readonly nodeOrder: readonly string[];
}

interface WorkflowFormWidgetRef {
  readonly nodeId: string;
  readonly inputName?: string;
  readonly widgetIndex?: number;
}
```

Frontend Form来自Canvas nodes/widgets；API Form由graph literal inputs与`object_info` metadata合成。Converter registry负责known node/widget value shape与setter，generic converter只暴露bounded primitive editors。Widget types至少覆盖`images`、`masks`、`string`、`boolean`、`number`、`combo`、`segment`与`video`；mask renderer可以显示remote/default value，但不获得Photoshop mask-specific materializer。

Visibility完全使用当前node title或API `_meta.title`：

- muted/bypassed node隐藏；
- title以`.`开头强制隐藏；
- 没有widgets隐藏；
- registered converter node默认显示；
- generic node只有title以`#`开头才显示；
- 排序比较前移除`#`并trim title。

V1不写hidden marker property。若真实runtime证明node会自动覆盖user title，再单独使用repo-owned `imagen_ps_form_title`；禁止复制`sdppp_widgetable_title`、`#sdppp_variant`、`sdppp_min/max/step`或其他`sdppp_*` names。

### 6. Bindings是optional execution-time overrides

每个workflow保存独立presentation state：

```ts
interface WorkflowPresentationState {
  readonly textBinding: WorkflowFormWidgetRef | null;
  readonly imageBinding: WorkflowFormWidgetRef | null;
  readonly overrides: Readonly<Record<string, JsonValue>>;
}
```

Workflow、Text binding、Image binding selectors在ComfyUI mode始终显示。Text candidates只含unique writable text-like literal widgets；Image candidates只含unique writable upload-image widgets。每个selector始终含`No binding`，没有candidate时仍保持可见并只提供`No binding`。saved ref不存在或不兼容时归一化为`No binding`，不猜replacement。

Binding不改变动态Form visibility；所有符合visibility rules的widgets持续显示。Form编辑的是workflow override，Composer只在Send snapshot中提供更高优先级override：

```text
workflow saved value
  < Workflow Form override
  < non-empty Composer prompt at selected Text binding
  < first Composer attachment at selected Image binding
```

Composer prompt为空、attachment不存在或binding为`No binding`时保留下层值。Image binding只映射当前首张attachment；额外attachments不上传，并显示`此 Workflow 仅使用第一张附件`。不得读取widget `maxCount`来隐藏selector、禁用attachment入口或建立额外Send gate。

只有当用户确实提供将被忽略的输入时才显示notice：

- prompt非空且Text binding为`No binding`：`此 Workflow 不使用当前提示词`；
- attachments非空且Image binding为`No binding`：`此 Workflow 未识别到图片输入，附件不会发送`；
- attachments超过一张且Image binding存在：`此 Workflow 仅使用第一张附件`。

这些notice不影响Send availability。

### 7. Generation Workspace ViewModel拥有backend切换

`generationMode`从ComfyUI management移到Application/UI composition的Generation Workspace controller：

```ts
type GenerationWorkspaceState = {
  readonly mode: 'provider' | 'comfyui';
  readonly provider: { readonly profileId: string | null; readonly modelId: string | null };
  readonly comfyui: { readonly workflowId: string | null };
};
```

`buildProviderComposerViewModel()`与`buildComfyUiComposerViewModel()`投影同一个`GenerationComposerViewModel`，包含header target、ordered toolbar controls、prompt surface、attachment surface、billing/status surface、notices、settings route、Send label/availability与backend-specific submit intent。`MainPage`不再接收或解释ComfyUI connection/contract，也不自行拼接Provider/ComfyUI readiness。

切换mode保留shared Composer draft与两侧各自selection，不自动清空、替换或猜target。Provider继续使用现有model capability/readiness；ComfyUI的input bindings不参与readiness。ComfyUI Send label/tooltip固定为运行workflow，不使用Provider operation vocabulary。

### 8. ComfyUI TAB是唯一管理surface

Settings保留Provider/ComfyUI segmented TAB，但两个TAB完全分支。ComfyUI TAB的固定顺序为：

```text
Address + Connect + status
Collapsed Advanced settings
Workflow list/import/refresh
Selected workflow detail + dynamic form
```

ComfyUI TAB不渲染Global Generation、Prompt Settings、Provider profiles、billing、connection rows或Add Connection。删除独立`ComfyUiConnectionPage`入口；main header/settings按钮根据current mode直接打开matching TAB。

Workflow list只显示identity tree与loading/error/empty；选择后在同一TAB进入detail，保留list返回、refresh、import、reset与适用的save action。TAB不提供Run、AutoRun、batch multiplier或global Stop，因为首页Send是唯一execution入口。

API ready但Frontend/Bridge unavailable时，TAB仍允许imported API workflows；remote Frontend list显示scoped unavailable state，不把整个ComfyUI backend标记为不可用。

### 9. 两种submission保持内部实现差异

API Format driver对admitted graph clone应用Form与Composer overrides，等待实际使用的image upload完成，再App-owned `POST /prompt`一次。Frontend driver打开exact workflow、恢复Form overrides、应用Composer overrides、等待实际使用的image upload完成，再调用native Queue一次。driver差异不进入ViewModel或Task history。

现有one-shot operation identity、submission-started no-replay、unknown-state `remoteMayContinue`、Session lane与Canvas lease ordering继续保留。Bridge命令改为workflow list/open/import/form values/set values/submit/reset/dispose的bounded allowlist；移除Imagen contract schema digest与contract mutation payload。raw workflow document只允许在bounded import/open command中传输，仍禁止arbitrary script/property path、Task metadata、client id与raw image bytes。

只上传selected Image binding实际消费的首张attachment。没有Image binding时保持零upload。Frontend/Image Form自身产生的remote values继续由其own widget uploader负责，不重复进入Composer upload path。

### 10. Output collection默认宽松但仍安全

Known prompt observer继续以history/queue为terminal authority。没有explicit output binding时遍历全部bounded `history.outputs` entries，只收集标准`images[]` descriptors，保持history node enumeration与node内image顺序。每个descriptor继续执行path traversal、type、response bytes、MIME与signature guards；unsafe entry跳过并形成bounded warning，不能构造unsafe `/view` URL。

Validated images写入existing AssetStore并形成ordered TaskOutputs。若remote execution成功且安全images为零，canonical execution result允许`outputs: []`，Task投影为`status: completed`与empty outputs；History从`completed && outputs.length === 0`派生`completed-without-image-output`，Preview/Download/Place保持disabled且不伪造error。

### 11. Harness-first cutover

先建立fixtures与fakes：Frontend/API format detection、bounded workflow documents、`object_info` node metadata、Workflow Form converters、visibility ordering、binding candidates/overrides/notices、singleton URL normalization/path join、workspace VM、exclusive TAB、one-shot submissions与zero-image results。默认tests不访问network或owner credentials。

真实gate顺序固定为：deterministic package/application/app tests -> Chrome owner-local API/Frontend smoke -> Photoshop UXP manual smoke。mask-specific smoke继续跳过。任何live fallback若改变native Queue、prompt identity或no-replay语义必须停止并重新设计，不能静默替换。

## Risks / Trade-offs

- [Risk] Generic widget converter会把read-only或link input误判为writable。→ candidate与editor必须依赖literal value、node metadata与registered converter；unknown保持原值。
- [Risk] bare address双scheme probe增加首次连接时间。→ probes bounded、可取消、命中后持久化canonical `baseUrl`，后续不重复猜scheme。
- [Risk] Frontend workflow list快但selected workflow首次open仍可能慢。→ list与detail分阶段，detail使用load identity/revision cache并显示scoped loading state。
- [Risk] binding selector与动态widget同时编辑同一target造成理解差异。→ contract固定Form为base override、Composer为Send-time override，并只在Composer值存在时覆盖。
- [Risk] 多attachments只使用首张可能与Provider习惯不同。→ selector始终可见，发送前显示固定notice，未使用attachments不上传或写入Task execution inputs。
- [Risk] output-node metadata对custom nodes不可用。→ bounded class metadata lookup失败时Send preflight返回direct invalid-workflow，不以class name allowlist猜测。
- [Risk] zero-image completion让History没有preview。→ 使用derived completion label与现有disabled resource actions，不扩张Task status enum。
- [Risk] 同时重构runtime与shared UI blast radius较大。→ 以capability harness分段cutover，优先稳定Workspace VM与new repositories，再删除legacy branches。
- [Trade-off] TAB不复制monorepo Run/AutoRun/batch。→ 保持一个Send入口和shared Task/History authority，减少重复execution surface。

## Migration Plan

1. 冻结旧Change剩余manual tasks并记录新Change为唯一ComfyUI authority；保留当前working tree中的owner-local diagnostics，实施时逐项吸收而非回退。
2. 建立singleton server settings、URL normalizer/base-path join与capability tester，迁移host persistence后删除connection list CRUD。
3. 建立bounded workflow document/format detector、unfiltered identity discovery与new workflow repository；导入fixtures与selected-detail cache。
4. 建立Workflow Form model、converter registry、visibility rules、Form values/presentation repository与API/Frontend adapters。
5. 替换Imagen contract admission/mutation/output filtering；加入optional bindings、unused-input notices、output-node preflight与broad image collection。
6. 建立Generation Workspace controller/view model，迁移`AppShell`/`MainPage` props、Send intent与mode-specific surfaces。
7. 重建ComfyUI-exclusive TAB，删除connection editor、多connection UI、ComfyUI TAB中的Provider/global内容与duplicate run controls。
8. 放宽execution result为empty outputs，加入History `completed-without-image-output` projection与resource action tests。
9. 更新Bridge commands/integration，删除contract nodes/schema artifacts与`sdppp_*` names，运行cross-package deterministic gates。
10. 运行opt-in Chrome与UXP image-only smoke；通过后归档旧Change并把稳定事实写回canonical docs。

Rollback在cutover完成前按capability commit恢复上一通过gate的slice；不得同时注册legacy与new ComfyUI repositories/backends。Provider与shared Task/Job architecture不回滚。

## Open Questions

无。V1已锁定singleton server、always-visible selectors、first-attachment injection、non-blocking input notices、完整dynamic Form、首页唯一Send、至少一个output node与zero-image completed projection。
