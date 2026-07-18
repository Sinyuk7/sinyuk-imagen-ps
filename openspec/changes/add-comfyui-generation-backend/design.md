## Context

本 Change 依赖 `generalize-task-job-execution-architecture` 已完成并通过 parity gate。该基础 Change 提供单一 backend-neutral Job kernel、Application-owned Task orchestration、`GenerationBackend` policy port 与 Core-facing `ExecutionAdapter` transport port。ComfyUI 必须只实现这些 seams，不能再创建独立 Session、Task、queue、result history或asset system。

ComfyUI有两种真实submission方式：

```text
API Graph
  validated API workflow -> input mutation -> POST /prompt

Frontend Queue
  open remote frontend workflow -> widget mutation -> native Queue
```

两者的本地输入、remote image upload、prompt observation、history/view output与Task projection高度相同；区别只存在于submission driver。Sibling `monorepo` reference repository仅作为 ComfyUI交互行为oracle：本地image/mask materialize、upload获得remote name、等待全部uploads、写入widget、再Queue。它的React stores、UploadPass registry、resource URI/cache和task system不进入本仓库。

## Goals / Non-Goals

**Goals:**

- 一个 `ComfyUiGenerationBackend` 接入既有Application Task/Session结构。
- 一个 `ComfyUiExecutionAdapter` 内部组合 `ApiGraphDriver` 与 `FrontendQueueDriver`。
- Chrome与Photoshop UXP都能从现有attachments/selection得到image/mask，上传、执行并把结果放回共享History/Placement链。
- 只通过两个project-owned contract nodes声明workflow输入输出，不猜测内部graph结构。
- 对remote submission保持at-most-once；unknown execution state不自动replay。
- 以mock contract、owner-local AutoDL Chrome proof与Photoshop UXP manual smoke形成分层证据。

**Non-Goals:**

- 不修改CHANGE-01的Job、Task、Session、`GenerationBackend`或`ExecutionAdapter` contract。
- 不把ComfyUI实现成`Provider`，不加入Provider profile/model/catalog/billing体系。
- 不创建第二套AssetStore、StoredAssetRef、upload cache、TaskStore、History、Preview、Download或Placement。
- 不兼容或分析Reroute、Primitive、Get/Set、subgraph及任意custom nodes；它们对本项目保持opaque。
- 不提供arbitrary Canvas scripting、generic widget discovery、compiled graph handoff或page-side binary upload。
- 不做multi-batch、concurrent Canvas operations或automatic remote cancellation。

## Decisions

### 0. Module ownership固定且不创建平行架构

```text
packages/execution-backends/comfyui (@imagen-ps/execution-backend-comfyui)
  transport-neutral ExecutionAdapter、HTTP/WebSocket、upload、history/view、
  Frontend Bridge protocol、workflow contract schema/fixtures与fakes

packages/application/src/comfyui
  ComfyUiGenerationBackend、connection/workflow repositories、target selection、
  admission/readiness/retry与Task projection

apps/app/src/adapters/chrome + apps/app/src/adapters/uxp
  host persistence、iframe/WebView、AssetStore/HostPort wiring与UXP network lifecycle

integrations/comfyui-imagen-bridge
  server custom nodes/status endpoint与page-side Bridge integration
```

`packages/execution-backends/comfyui`不得导入Application、React、DOM、UXP或Photoshop。`packages/application`不得拥有raw ComfyUI HTTP/WebSocket或page runtime。Host adapters不得重新实现contract parser、upload mapper、history collector或Task projection。

旧git branch不是本Change的清理对象；ignored `dist/.turbo/node_modules`也不是产品artifact。实施只归档或删除被本Change取代的旧OpenSpec authority，并从新的tracked source重建package与integration。

### 1. ComfyUI 是一个 backend、两个 drivers

Application composition注册一个 `ComfyUiGenerationBackend`，Core dispatcher注册一个 `ComfyUiExecutionAdapter`。Admitted execution params使用source discriminant选择driver：

```ts
type ComfyUiExecutionSource =
  | { readonly kind: 'api-graph'; readonly workflowId: string; readonly graph: BoundedApiWorkflow }
  | { readonly kind: 'frontend-workflow'; readonly workflowId: string; readonly remotePath: string };
```

`ComfyUiGenerationBackend`只负责connection/workflow resolution、contract admission、lane/readiness、retry policy、Task display summary与terminal projection。`ComfyUiExecutionAdapter`负责remote side effects，不读取Session或TaskStore。

两个drivers共用connection snapshot、input upload service、error normalization、known-prompt observation与output downloader。它们不得在submission前伪装成一个graph executor。

备选方案是注册两个Application backends。拒绝该方案，因为connection、workflow identity、inputs、result与UI target相同，会复制repository、readiness与Task projection。

### 2. Connection 与 workflow repository 由 Application 拥有

Connection record保存stable id、display name、canonical HTTP(S) origin、bounded timeouts与capability status。V1产品连接只支持unauthenticated HTTP(S)/WS：record与commands不接受auth字段、secret refs、userinfo URL或headers。AutoDL SSH仅属于owner-local deploy/debug harness，不进入产品connection或tracked artifact。未来产品auth必须另起Change并复用CHANGE-01的dispatch-time secret-ref resolver。

Workflow config使用source discriminant：

```ts
interface ComfyUiWorkflowConfig {
  readonly workflowId: string;
  readonly displayName: string;
  readonly connectionId: string;
  readonly source:
    | { readonly kind: 'api-graph'; readonly graph: BoundedApiWorkflow }
    | { readonly kind: 'frontend-workflow'; readonly remotePath: string };
  readonly contract: ComfyUiWorkflowContract;
}
```

API Graph importer只接受ComfyUI API Format `Record<nodeId, { class_type, inputs }>`。输入必须是plain JSON object、可序列化、非空，限制为2,000,000 bytes、2,000 nodes、depth 32、node id 128 chars、class type 256 chars；包含Frontend `nodes`数组、non-finite value、cycle、function、prototype object或超过边界时fail closed。成功后保存deep-cloned/deep-frozen snapshot。Frontend workflow只保存canonical remote path与admitted contract，不保存Canvas、frontend JSON、compiled graph、load identity或client id。Discovery通过Bridge列出bounded canonical paths；refresh不自动改变当前target。

Application target selection替换单一Provider-only选择owner，但不改变Provider行为：

```ts
type GenerationTargetSelection =
  | { readonly kind: 'provider'; readonly profileId: string; readonly modelId?: string }
  | { readonly kind: 'comfyui'; readonly workflowId: string };
```

ComfyUI selection只保存`workflowId`；`connectionId`与`source.kind`始终由workflow repository解析，不重复持久化。删除selected workflow、删除其connection或切换backend时清空invalid selection，不自动选择replacement。Provider selection继续映射现有profile/model owner与现有可观察行为。

Backend readiness按source检查：两者都要求connection health与valid contract；API Graph要求graph可执行；Frontend workflow还要求remote path存在、Bridge handshake兼容且native Queue capability可用。

### 3. Binding/Type Contract 是唯一workflow理解边界

ComfyUI integration提供两个stable class ids的versioned project-owned metadata nodes：

- `ImagenWorkflowBindingContract`：声明role、slot order与统一locator `{ nodeId, fieldName }`。
- `ImagenWorkflowTypeContract`：声明schema version、operation、required/cardinality、data type与mask encoding。

V1 canonical JSON shapes为：

```ts
type ContractRole = 'prompt' | 'image' | 'mask' | 'output-image';
type ContractDataType = 'text' | 'image' | 'mask';
type ContractMaskEncoding = 'grayscale' | 'alpha' | 'inverted-alpha';

interface ContractKey {
  readonly role: ContractRole;
  readonly slot: number;
}

interface BindingContractEntry extends ContractKey {
  readonly locator: { readonly nodeId: string; readonly fieldName: string };
}

interface TypeContractEntry extends ContractKey {
  readonly required: boolean;
  readonly dataType: ContractDataType;
  readonly maskEncoding?: ContractMaskEncoding;
}

interface ImagenWorkflowBindingContractV1 {
  readonly schemaVersion: 1;
  readonly bindings: readonly BindingContractEntry[];
}

interface ImagenWorkflowTypeContractV1 {
  readonly schemaVersion: 1;
  readonly operation: 'text-to-image' | 'image-edit';
  readonly entries: readonly TypeContractEntry[];
}
```

两个nodes各自的canonical JSON最大65,536 bytes，合并后最多32个entries；nodeId与fieldName各最多128 chars。两边必须具有完全相同且唯一的`role+slot` key。`prompt`只能slot 0且必须是required text；`image`与`output-image` slots必须从0连续；`mask`最多一个slot 0且必须声明mask data type/encoding；至少一个required output-image。`text-to-image`禁止image/mask entries；`image-edit`至少一个required image，mask可选。任何缺失、额外、重复、断序或type/encoding冲突均fail closed。

两者合并为一个bounded `ComfyUiWorkflowContract`。同一locator在API driver中解释为API node input，在Frontend driver中解释为Canvas widget name；driver必须验证实际target唯一且type兼容。无声明、重复role、重复slot、missing target、link-shaped API input、missing widget或type mismatch均fail closed。

支持roles仅为：

```text
prompt
image[0..N]
mask (optional)
output-image[0..N]
```

系统不扫描CLIPTextEncode/LoadImage等class来自动猜binding，不遍历link，不解释contract target上下游的Reroute、Primitive、subgraph或custom nodes。内部workflow保持opaque。

Canonical JSON schema、authoritative parser/validator与valid/invalid fixtures由`packages/execution-backends/comfyui/contract/`单点拥有。TypeScript parser/validator直接消费该schema并产生canonical `ComfyUiWorkflowContract`；Application、drivers与host adapters只能消费其结果，不得重新解释accept/reject规则。integration build从同一source生成/复制runtime schema与validator artifact，Python/JS不得手写第二份schema或独立parser。Bridge handshake报告`contractSchemaVersion`与canonical schema SHA-256 digest；cross-language contract tests必须让TS/Python/JS对同一fixtures产生相同accept/reject结果。

### 4. 本地asset生命周期完全复用现有owners

Chrome/Photoshop inputs继续进入现有 `HostImageAsset -> ImageResource -> StoredAssetRef -> AssetStore` 链。Mask source在用户Send/admission阶段按当前selection/attachment frame materialize为canonical local asset，并与主图几何保持一致；Task与execution params只保存StoredAssetRef和bounded metadata。

Placement只使用CHANGE-01已有`TaskPlacement`。App在Send/admission前按现有`PlacementIntent`生成`exact-frame/document-only/unbound`，`ComfyUiGenerationBackend`将running Task中的placement原样带到terminal projection。不得新增ComfyUI placement evidence、document selector或generic evidence副本。

不引入resource URI、UploadPass、global upload queue或remote upload cache。Host-specific bytes只由现有AssetStore/HostPort adapters解析；Bridge protocol永不接收raw bytes。

### 5. 两个drivers共享App-side remote upload barrier

Task durable running write成功后、任何submission前，`ComfyUiExecutionAdapter`通过host-injected asset resolver读取所有StoredAssetRefs。Mask按contract的explicit encoding生成ComfyUI upload bytes。共享uploader：

1. 为ordered images与optional mask构建bounded multipart `/upload/image` requests；
2. 验证HTTP status、response size与returned `{name|filename, subfolder, type}` descriptor；
3. 从validated descriptor生成唯一exact widget value；
4. 等待全部required uploads成功；
5. 失败时终止Task，且两个driver均零`/prompt`、零native Queue。

Remote filenames只在当前execution中存在，不持久化为asset identity，也不跨Task复用。Upload可能已经在remote留下input文件；该副作用不授权submission replay。

备选方案是让Frontend Bridge上传bytes。拒绝该方案，因为会复制AssetStore解析、扩大2 MB message boundary并产生frontend upload handle/cache系统。

### 6. API Graph driver拥有canonical submission

API Graph driver clone admitted graph，按contract写入non-empty prompt与ordered uploaded image/mask values，保留未提供的optional values。它在submission前验证graph limits、node/input existence、literal target与output contract。

Driver使用ephemeral client id建立realtime channel并POST `/prompt`恰好一次。`promptId`由ComfyUI server acknowledgement产生；App不得预造或要求request携带promptId。Response必须提供bounded promptId并绑定本次request/client context。WebSocket events是progress hints；bounded `/history/{promptId}`与`/queue` reconciliation是terminal authority。

API receipt为execution-local `{ promptId, acknowledgedAt }`，由`ApiGraphDriver`拥有并立即交给shared known-prompt observer；它不进入Task、Job input、History或durable receipt store。

HTTP timeout、disconnect或invalid acknowledgement造成unknown execution state时，driver不replay `/prompt`，Task写入bounded unknown-state `TaskError`，并只在generic `details.remoteMayContinue: true`表达remote may continue；不得新增ComfyUI Task字段。Generic Retry禁用。reload/dispose不恢复observer、不reattach prompt、不查询全局history猜测identity；用户再次Generate创建新Task/Job，server为新submission产生新prompt id。

### 7. Frontend Queue driver拥有native submission

Frontend protocol使用固定request/response envelope：

```ts
interface BridgeRequest {
  readonly requestId: string;
  readonly identity: { readonly origin: string; readonly sourceId: string; readonly loadId: string };
  readonly command: 'handshake' | 'list-workflows' | 'submit-workflow' | 'reset' | 'dispose';
  readonly payload: Readonly<Record<string, unknown>>;
}

type BridgeResponse =
  | { readonly requestId: string; readonly ok: true; readonly payload: Readonly<Record<string, unknown>> }
  | { readonly requestId: string; readonly ok: false; readonly errorCode: string };
```

固定limits为2,000,000-byte message、512-byte workflow path、1,000 workflow list entries、16 widget mutations、128-char request/operation/prompt ids与30,000ms configure timeout。`handshake`返回identity、protocol/bridge/frontend/core/contract versions、schema digest、capabilities与limits；`list-workflows`返回canonical path与bounded contract summary，不返回raw workflow；`submit-workflow`只接受operationId、remotePath、`batchCount: 1`、contract-derived `{locator,value}` mutations与configure/receipt timeouts；`reset`只接受operationId；`dispose`无业务payload。所有command拒绝unknown fields。

Bridge不接收raw bytes、upload handles、API graph、compiled graph、Task/Job metadata、promptId request、client id、event subscriptions、script或property path。Frontend driver在App-side uploads全部完成后发送`submit-workflow`。Bridge：

1. 验证origin/source/load identity、protocol/core/frontend/contract versions；
2. 获取connection-scoped exclusive Canvas lease；
3. 打开exact remote workflow并等待operation-bound configure readiness；
4. 读取并验证两个contract nodes与exact target widgets；
5. 应用prompt/image/mask values；
6. 调用native `app.queuePrompt(0, 1)`恰好一次；
7. 通过不改变arguments/response/POST的narrow receipt observer取得server prompt id；
8. 返回bounded receipt并在finally reset/release Canvas lease。

`operationId`由FrontendQueueDriver在dispatch调用栈生成，不进入GenerationCommand、Job input、Task或History。Bridge以operation id做page-load内one-shot dedupe并保留accepted receipt直到该load结束；duplicate返回原receipt且不第二次Queue。Timeout/reload/disconnect/ambiguous receipt后App与Bridge均不自动replay。reload产生新loadId并清空旧page state；Application不得把旧operation投递到新load。Frontend `/prompt` call count必须为1，App `/prompt` call count必须为0。

Frontend receipt使用唯一bounded shape：

```ts
interface FrontendQueueReceipt {
  readonly operationId: string;
  readonly promptId: string;
  readonly acknowledgedAt: number;
}
```

Receipt由`FrontendQueueDriver`拥有、验证operationId后立即交给shared known-prompt observer。Task只接收最终normalized result或bounded unknown-state error，不保存Bridge receipt、operationId或promptId。reload/dispose时若submission可能已发生但未terminal，CHANGE-01 startup reconciliation将running Task标记interrupted并保留`remoteMayContinue`；系统不提供durable receipt recovery。

Bridge不返回graph、Canvas object、raw Queue payload、client id、raw event或image bytes。Progress/terminal events只作为prompt-scoped hints；receipt后仍由App使用shared history/view authority。

### 8. 两个drivers从prompt identity开始共享result chain

Known prompt observer验证history/queue response bounds与error state，只接受contract声明的ordered output nodes。每个image descriptor必须拒绝absolute path、traversal、control chars与unsupported type。`/view` download必须验证status、byte limit、image MIME与signature。

Output bytes写入现有AssetStore并形成ordered TaskOutputs。`ComfyUiGenerationBackend.projectTerminal()`只使用CHANGE-01的genericTask contract：backend/connection/target display summary、outputs、bounded warnings/error与timestamps。History、Preview、Download、retention和Photoshop Placement不按ComfyUI driver分支。

两个drivers共享以下bounded error vocabulary：

```ts
type ComfyUiErrorStage = 'prepare' | 'upload' | 'submit' | 'observe' | 'download' | 'project';
type ComfyUiErrorCode =
  | 'invalid-connection' | 'invalid-workflow' | 'invalid-contract'
  | 'asset-unavailable' | 'upload-failed'
  | 'submission-rejected' | 'submission-unknown'
  | 'execution-failed' | 'execution-state-unknown'
  | 'history-timeout' | 'unsafe-output' | 'download-failed'
  | 'projection-failed' | 'bridge-incompatible';
```

Normalized error只含stage、code、safe message key、`remoteMayContinue`与retry disposition，不含raw endpoint/path/graph/payload/stack。只有submission call尚未开始的deterministic `prepare/upload` failure可由`GenerationBackend.retry()`创建same Task/new Job；submit开始后无论acknowledged、rejected、unknown或terminal，generic Retry均禁用，再执行必须new Task。

### 9. Retry、queue 与result ambiguity遵循统一Task/Job contract

每个ComfyUI connection使用CHANGE-01 `ExecutionLane { key: connectionId, maxConcurrency: 1 }`；Session lane是唯一调度authority。Frontend Canvas lease只保护已dispatch operation的open/mutate/Queue/reset临界区，不提供第二queue、retry或fairness policy。顺序固定为Session取得lane slot -> adapter dispatch -> acquire Canvas lease -> open/mutate/Queue/reset -> release lease -> adapter return -> Job terminal；持有lease期间不得回调Session或等待新lane slot。lease acquisition/configure的timeout、abort、reload、dispose或failure必须清除waiter并在finally释放任何partially acquired lease，返回bounded `bridge-incompatible`或normalized submit-stage error，让adapter settle并由正常Job terminal path释放Session lane；不得留下pending lane/lease，也不得自动replay。Queued removal/reload drop沿用CHANGE-01。

Submission call尚未开始的deterministic local failure可通过CHANGE-01 backend retry seam创建same Task/new Job。任何`/prompt` call或native Queue call已经开始、receipt unknown或remote may continue的Task不可使用generic Retry；再次执行必须创建新Task、Job与operation identity。CHANGE-02不改变Task/Job状态机。

### 10. 测试只保护stable boundaries

Default suites使用：

- execution backend contract fake：upload、API submit、frontend receipt、history/view与error cases；
- Application scenarios：connection/workflow admission、contract、lane、Task projection；
- app adapter scenarios：Chrome/UXP StoredAssetRef、mask materialization与Bridge message boundary；
- Bridge protocol contract：identity、limits、one-shot operation、exact mutations、Queue once与cleanup。

不为每个ComfyUI node或graph形状建立tests。真实network只进入opt-in release/live harness。AutoDL Chrome vertical proof必须覆盖API与Frontend各一条完整image/mask flow；Photoshop UXP manual smoke必须覆盖real capture/mask、WebView/Bridge、output placement与cleanup。

## Risks / Trade-offs

- [Risk] Contract nodes schema尚未被真实workflow验证。→ 先用真实D01 workflow固化两个node schema与locator semantics，再扩大fixtures；不做automatic discovery fallback。
- [Risk] TS/Python/JS schema drift导致同一workflow在不同层结论不同。→ 单一canonical schema/fixtures，integration build生成runtime copy，handshake报告version+digest，cross-language tests验证同一case bank。
- [Risk] Frontend native Queue receipt API不稳定。→ 固定verified frontend/core/Bridge tuple，使用pass-through receipt observer；无法证明exactly-one时fail closed。
- [Risk] Reload后remote execution仍继续但本地receipt丢失。→ 明确不恢复、不猜测、不replay；running Task转interrupted并显示remote may continue。
- [Risk] Session lane与Canvas lease产生lock inversion。→ lane先于adapter，lease只存在于adapter内部，finally释放后才terminal。
- [Risk] App-side upload成功但submission失败会留下remote input文件。→ 文件名operation-scoped、不建立cache；该副作用记录bounded diagnostic但不触发replay。
- [Risk] Photoshop UXP WebView message/source或network权限与Chrome不同。→ Chrome证据不替代manual UXP gate；manifest/network与real-host行为单独验证。
- [Risk] 两个drivers产生不同error vocabulary。→ execution package统一stage/error codes，Application只接收bounded normalized result。
- [Trade-off] 仅支持pinned tuple与contract nodes，不宣称generic ComfyUI compatibility。→ 范围可验证且不要求理解workflow内部实现。

## Migration Plan

1. 完成并验证CHANGE-01；用non-Provider fake证明公共seams稳定。
2. 建立tracked execution package与integration skeleton，固定module imports、canonical contract schema/fixtures与cross-language conformance harness。
3. 建立ComfyUI connection/workflow/target Application contracts与deterministic repositories，并完成bounded API Graph import。
4. 实现两个contract nodes、Bridge status/handshake/discovery/fixed protocol与pinned compatibility evidence。
5. 建立transport-neutral upload、history/view、error/result parsers与fakes；实现共享input materialization/upload barrier与API Graph driver。
6. 实现Frontend Queue driver，完成exact widget mutation、native Queue once、runtime-only receipt与reload no-replay contract。
7. 接入Application `ComfyUiGenerationBackend`、Session lane、Task projection与shared target/settings。
8. 接入Chrome/UXP host adapters、mask、History/Preview/Download与existing TaskPlacement。
9. 运行default deterministic gates、opt-in AutoDL live gates与Photoshop UXP manual smoke。
10. 归档被本Change取代的旧OpenSpec change，避免双authority；不删除git branch或改写history。

Rollback只移除ComfyUI backend registration、UI target与Bridge integration；CHANGE-01通用架构和Provider behavior保持不变。

## Open Questions

无。V1锁定unauthenticated product connection、bounded API Format、contract schema V1、runtime-only receipt/no reload recovery、per-connection lane cap 1、batch count 1、existing TaskPlacement以及pinned frontend/core/Bridge tuple。
