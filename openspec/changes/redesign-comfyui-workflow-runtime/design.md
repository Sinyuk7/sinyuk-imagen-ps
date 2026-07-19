## Context

现有 ComfyUI backend 已接入 shared Task/Job/Session、AssetStore、History 与 Photoshop Placement，但产品模型围绕多 `ComfyUiConnection`、两个 Imagen contract nodes、预声明 operation 与 output binding 建立。普通 workflow 会在 discovery 或 admission 阶段被过滤，Settings 同时承担 connection list、workflow tree、Import、Form persistence 与执行相关状态，Frontend/API Format 也被提升成用户需要理解的概念。

目标产品边界更简单：ComfyUI 是 workflow JSON 的创建、保存与管理 authority；插件只消费 remote workflow。首页是高频 generation surface，负责运行 current Workflow。Settings/ComfyUI TAB 是 Workflow Configuration Surface，负责连接、选择 current Workflow、解决必要的 input ambiguity、编辑本 session 的少量安全参数，以及呈现 scoped Diagnostics。它不运行 Workflow，也不成为第二个 workflow editor。

ComfyUI server 对 runnable prompt 的原生最低要求是 graph 可解析且至少包含一个 active output node。插件有 metadata 时可以提前证明无 output node；metadata 不完整时不能把“未知”当成“无”，必须让 native `/prompt` 或 native Queue 返回权威 validation result。output node 存在也不保证 `history.outputs` 含 `images[]`，因此 runnable 与 image result success 分开建模。

## Goals / Non-Goals

**Goals:**

- ComfyUI 只使用一个持久化 canonical `baseUrl`，不存在 profile/connection list。
- 首页保留 current Workflow 的高频 Send，语义固定为运行完整 Workflow。
- Settings/ComfyUI TAB 根页形成稳定 Workflow Configuration Surface：Connection、current Workflow、conditional Input Mapping、`#`-exposed Workflow Parameters、error/developer Diagnostics。
- current Workflow 区只提供 Change、Refresh、Open in ComfyUI；Change 进入独立 Picker 子页。
- Picker 只发现 bounded remote identities，并提供 search、recent、grouped list 与 scoped loading/error/empty states。
- remote document 的 Frontend/API Format 由内部 parser/driver 自动处理，UI 不暴露 format/source。
- Dynamic Form 默认不暴露 node；只有 `#` node 下可证明安全的 supported primitive widgets进入表单，`.` node 始终隐藏。
- persistence 仅包含 `baseUrl`、`selectedWorkflowId` 与 revision-scoped explicit ambiguous mappings；Form overrides 仅 session 有效。
- output metadata known 且无 active output node时 fast-fail；metadata unknown 时 defer native validation。
- remote success 无安全图片时形成 durable completed Task，并投影 `completed-without-image-output`。
- deterministic harness 先覆盖 parser、Picker、mapping、session state、submission 与 output；real Chrome/UXP 只做后续显式 gate。

**Non-Goals:**

- 不在插件内创建、导入、保存、重置、重命名、删除或版本管理 workflow JSON。
- V1 不提供 Import、Save、Reset、Advanced settings 或 persistent Form overrides。
- 不在 Settings、Picker 或 Diagnostics 提供 Run、Queue、AutoRun、batch、Stop、History 或结果 actions。
- 不向用户显示或要求选择 Frontend Save Format、API Format、source kind、parser 或 submission driver。
- 不持久化 workflow documents、catalog、capabilities、class/object metadata、compiled prompt、runtime cache、Diagnostics 或 error history。
- 不为 image、mask、video、upload、node graph、canvas、code、structured JSON 或其它 complex widgets提供 Dynamic Form editor。
- 不实现 ComfyUI authentication、custom headers、secret query 或 credential profiles。
- 不实现 mask-specific Photoshop capture/materialization、mask binding 或 mask live/UXP acceptance；包含 mask/custom nodes 的 workflow 仍可按原值运行。
- 不复制 ComfyUI 的 workflow editor、Task system、resource cache 或 Provider architecture。
- 不修改 Provider transport、profile/model repository 与 capability truth。

## Decisions

### 1. 新 Change 成为唯一 ComfyUI authority

`redesign-comfyui-workflow-runtime` 完成后，`add-comfyui-generation-backend` 不得继续指导产品语义或实现。可复用的只有 shared backend seam、HTTP/WebSocket、upload/history/download safety、one-shot submission、Task projection 与 host adapters；多 connection、Imagen contract schema、contract-only mutation、contract-only output collection、imported workflow store 与 connection editor 全部删除或替换。

本项目是 current-state、零用户、零 production data；不保留旧 ComfyUI persistence schema 或 `sdppp_*` compatibility alias。Provider 数据与 shared Task history 不参与 cutover。

### 2. Singleton Connection 与严格 persistence allowlist

Application 持久化 record 只含：

```ts
interface PersistedComfyUiSettings {
  readonly baseUrl: string;
  readonly selectedWorkflowId: string | null;
  readonly ambiguousMappingsByRevision: Readonly<
    Record<string, Readonly<Record<string, WorkflowInputRef>>>
  >;
}
```

`baseUrl` 是成功 normalization/capability probe 后的 canonical URL。Address normalization 接受显式 HTTP(S) URL 与 bare host/IP/port/path，拒绝 userinfo、query、fragment、control chars 与 unsupported scheme；保留 reverse-proxy path，所有 API route 使用 base-path-preserving join。

`selectedWorkflowId` 只用于恢复最近选择的 remote identity。它不等于持久化 workflow document；启动时必须重新 discovery/open。ambiguous mapping 只有用户在 UI 显式选择后才能写入，key 必须包含 server identity、workflow identity 与 loaded revision。revision 改变、target 消失或类型不兼容时 mapping 失效并回到 unresolved，不猜 replacement。

以下状态仅驻留 memory：workflow catalog、recent projection、remote document、format/source、capabilities、class/object metadata、compiled prompt、load state、Diagnostics 与 Form overrides。reload/destroy 后全部丢弃。禁止用 local storage、IndexedDB、settings blob 或 Task metadata旁路持久化。

### 3. Connection capability 只影响 scoped controls

Connection probe 可在 session 内派生：

```ts
interface ComfyUiServerCapabilities {
  readonly api: 'ready' | 'unavailable' | 'unknown';
  readonly frontend: 'ready' | 'unavailable' | 'unknown';
  readonly bridge: 'compatible' | 'incompatible' | 'unavailable' | 'unknown';
}
```

Capabilities 只驱动 current session 的 readiness、Open in ComfyUI、Picker 与 Diagnostics，不持久化。`baseUrl` 不拥有 workflow format。API、Frontend、Bridge failure 必须各自 scoped；一个 probe failure 不得被误报成 workflow JSON format error。

### 4. Workflow Configuration Surface 与页面职责固定

Settings/ComfyUI TAB 根页顺序固定：

```text
Connection
Current Workflow: Change / Refresh / Open in ComfyUI
Input Mapping (only when mapping attention is needed)
Workflow Parameters (only supported widgets under # nodes)
Diagnostics (only on error/degraded state or developer mode)
```

根页不永久渲染 remote workflow tree。`Change` push 到 Picker 子页；选择或返回后回到根页，并保留 session-local parameter overrides。`Refresh` 只重新加载 current Workflow document/revision/metadata，不运行、不保存 workflow。`Open in ComfyUI` 使用 bounded remote identity 打开原生 editor，创建与保存仍由 ComfyUI 完成。

Settings 不提供 Import、Save、Reset、Advanced、Run、AutoRun、batch、Stop、History 或 result actions。任何配置 action 都不得创建 Task 或触发 `/prompt`/native Queue。

### 5. Picker 子页只管理 remote identity selection

Discovery 先返回 bounded canonical remote identities，不逐个下载、compile、contract-filter 或 output-node-filter：

```ts
interface ComfyUiWorkflowIdentity {
  readonly workflowId: string;
  readonly displayName: string;
  readonly remotePath: string;
  readonly groupPath: readonly string[];
}
```

Picker 提供 search、recent 与 grouped list。Search 只匹配 bounded display/path text；recent 是当前 session 与 `selectedWorkflowId` 的 projection，不是独立持久化 history。grouped list 由 remote path 的稳定 segments 派生。loading、error、empty 与 retry 都限制在 Picker。

用户选择 identity 后才加载 document、计算 revision、解析 runtime representation 并返回根页。选择成功后写入 `selectedWorkflowId`；load 失败不替换当前可用 Workflow，并在 Picker/根页 Diagnostics 显示 scoped error。

### 6. Frontend/API Format 是内部 parser/driver detail

Remote document loader 继续执行 2MB、2000 nodes、depth 32、bounded ids/class names、plain JSON、finite values、no prototype pollution 等 guards。structural detector 在内部区分 Frontend Save Format 与 API Format；ambiguous/mixed shape fail closed。

Format/source 只存在于 runtime representation：

```ts
type LoadedWorkflowRuntime = {
  readonly workflowId: string;
  readonly revision: string;
  readonly document: BoundedWorkflowDocument;
  readonly driver: ComfyUiWorkflowDriver;
};
```

UI、persistence、Task history 与 user-facing error 不显示 `frontend`、`api`、source kind 或 driver selector。错误描述使用 Workflow、Connection、Open、Refresh、Send 等用户概念；developer Diagnostics 可显示 bounded parser/driver code，但不把它变成配置项。

### 7. Dynamic Form 使用 explicit `#` exposure 与 safe widget allowlist

Visibility 只使用 current node title 或 API `_meta.title`：

- muted/bypassed node 隐藏；
- title 以 `.` 开头始终隐藏；
- title 不以 `#` 开头默认隐藏；
- title 以 `#` 开头时，只检查其中可证明 writable 的 literal widgets；
- 展示标题时移除一个 leading `#` 并 trim；
- 不写 hidden marker property，不读取或复制任何 `sdppp_*` property/identifier。

V1 editor allowlist 仅包括 bounded `string`、`multiline-string`、`boolean`、finite `number`、bounded `combo`/enum与`seed`。renderer 必须同时证明 widget 是 literal、writable、locator 唯一、runtime setter 支持且 value shape 安全。image、mask、video、upload、segment/compound、canvas、code、JSON/object/array、linked input、unknown 与 custom complex widget 全部不显示 editor，保持 workflow 原值且不阻塞 Send。

```ts
interface WorkflowParameter {
  readonly ref: WorkflowInputRef;
  readonly kind: 'string' | 'multiline-string' | 'boolean' | 'number' | 'combo' | 'seed';
  readonly label: string;
  readonly workflowValue: string | boolean | number;
  readonly options?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}
```

Form edit 写入 current workflow revision 的 session-only override map。它不修改 remote document，不调用 ComfyUI save，不写 persistence。切换 Workflow 时可在 session cache 中按 revision 保留；reload/destroy 后丢失。`Refresh` 若 revision 改变则清除旧 revision overrides。

### 8. Input Mapping 只在需要用户注意时出现

Composer prompt 与首张 attachment 是 optional send-time inputs。runtime 先从 supported literal inputs 与 node metadata推导 candidate：

- zero candidate：保留 workflow 原值；Settings显示该类型不接收主页面输入的notice，有对应Composer input时首页再显示unused notice；
- one unambiguous safe candidate：可自动映射，仅存在 session snapshot，不持久化 explicit mapping；
- multiple compatible candidates 或 identity ambiguity：根页显示 Input Mapping，要求用户显式选择 target 或 `Do not map`；
- explicit ambiguous mapping 按 workflow revision 持久化；revision 不匹配即失效。

Image mapping 只允许已有 execution adapter 能安全上传并设置的 input ref；它不是 Dynamic Form image editor。V1 不提供 mask/video mapping。Form parameters 与 Input Mapping 是不同 surface：前者编辑 `#` node 的 supported primitive value，后者决定 Composer input 注入位置。

Send value 优先级固定：

```text
workflow value
  < session-only Workflow Parameter override
  < non-empty Composer prompt at resolved text mapping
  < first Composer attachment at resolved image mapping
```

空 prompt、无 attachment 或 `Do not map` 保留下层值。同一个 Composer input 不广播到多个 targets。只上传实际由 resolved image mapping消费的第一张 attachment；额外 attachments 不上传，也不写 execution inputs。

unused notice 不形成 Send gate：

- prompt 非空但无 resolved text mapping：`此 Workflow 不使用当前提示词`；
- attachments 非空但无 resolved image mapping：`此 Workflow 未识别到图片输入，附件不会发送`；
- attachments 超过一张且 image mapping resolved：`此 Workflow 仅使用第一张附件`。

### 9. 首页拥有唯一高频 execution surface

`generationMode` 由 Application/UI composition 的 Generation Workspace controller 统一拥有。`MainPage` 只消费 view model，不解释 connection profile、workflow format、driver、contract 或 mapping persistence。

ComfyUI mode 的 header/toolbar 投影 current Workflow identity、配置入口、readiness 与 notices；Send label/tooltip固定表达运行 current Workflow。首页不常驻 workflow tree、Dynamic Form、Input Mapping 或 Diagnostics；这些都属于 Settings Workflow Configuration Surface。

切换 Provider/ComfyUI mode 保留 shared Composer draft 与双方 selection，不自动清空或猜 target。ComfyUI Send availability只依赖 connection readiness、current Workflow load state与可证明的 fatal preflight facts。prompt、attachment、mapping数量、Dynamic Form参数数量与 mask-specific support 不形成额外 Send gate。

### 10. Output-node preflight 必须区分 known false 与 unknown

execution package 通过 bounded metadata port 查询 active nodes：

```ts
interface ComfyUiClassMetadata {
  readonly classType: string;
  readonly outputNode: boolean;
}

interface ComfyUiClassMetadataProvider {
  get(classType: string, signal?: AbortSignal): Promise<ComfyUiClassMetadata | undefined>;
}
```

Preflight 结果为三态：

- `has-output`：至少一个 active node metadata 明确 `outputNode: true`，继续 submit；
- `no-output`：所有 active node metadata 均 known，且全部 `false`，fast-fail `invalid-workflow/prompt-no-outputs`，submission count 为零；
- `unknown`：至少一个相关 metadata 缺失或 lookup 失败，且没有 known output；不得按 class name 猜测或本地拒绝，继续 native `/prompt` 或 native Queue。

native validation error 进入 canonical bounded execution error；one-shot operation identity、submission-started no-replay 与 `remoteMayContinue` 语义保持不变。metadata/cache只属于 session/runtime，不持久化。

### 11. Submission driver 保持内部差异

API driver clone 完整 graph、应用 session Form overrides 与 resolved Composer inputs、等待实际 upload，再 App-owned `POST /prompt` 恰好一次。Frontend driver打开 exact remote workflow、应用同样的 resolved overrides、等待实际 upload，再调用 native Queue 恰好一次。两者都运行完整 Workflow。

driver 差异不进入 UI、persistence、Task history 或 product vocabulary。Bridge command 使用 bounded workflow list/open/form values/set values/submit/reset/dispose allowlist；移除 Import、Imagen contract schema digest 与 contract mutation payload。`reset`/`dispose`只服务runtime cleanup与Canvas恢复，不成为用户按钮。raw document只在 bounded open/runtime command 中传输，仍禁止 arbitrary script/property path、Task metadata、client id 与 raw image bytes。

### 12. Diagnostics 是 scoped evidence，不是持久日志

根页只有在error/degraded state存在bounded evidence或developer mode启用时才显示Diagnostics入口或摘要；正常状态只使用Connection区的merged user-facing status，不渲染Diagnostics section。developer details通过显式disclosure展开。内容可以包含probe stage、workflow revision、parser/driver code、native validation code与bounded request identity，但不得包含raw workflow、secret、raw image bytes或无限日志。

Diagnostics不持久化，不进入Task metadata，不跨reload保留。用户可通过Refresh/Connect/Change重试对应owner；Diagnostics本身不提供执行或mutation action。

### 13. Output collection宽松但仍安全

Known prompt observer继续以 history/queue为 terminal authority。遍历全部 bounded `history.outputs` entries，只收集标准 `images[]` descriptors，保持 history node enumeration与 node 内 image 顺序。每个 descriptor执行 path traversal、type、response bytes、MIME与signature guards；unsafe entry跳过并形成 bounded warning，不能构造 unsafe `/view` URL。

Validated images写入 existing AssetStore并形成 ordered TaskOutputs。若remote execution成功且安全 images为零，canonical result允许`outputs: []`，Task投影为`status: completed`与 empty outputs；History从`completed && outputs.length === 0`派生`completed-without-image-output`，Preview/Download/Place保持 disabled且不伪造 error。

### 14. Harness-first cutover

先建立 deterministic fixtures与fakes：singleton URL normalization、persistence allowlist、bounded identity discovery、Picker search/recent/grouping、internal parser/driver detection、revision invalidation、conditional mapping、`#`/`.` visibility、safe widget allowlist、session-only Form overrides、known/unknown output metadata、one-shot submission、Diagnostics redaction与 zero-image result。

默认 tests 不访问 network 或 owner credentials。真实 gate 顺序固定为：deterministic package/application/app tests -> Chrome owner-local smoke -> Photoshop UXP manual smoke。任何 fallback 若改变 native Queue、prompt identity 或 no-replay语义必须停止并重新设计。

## Risks / Trade-offs

- [Risk] Picker remote list过大。-> discovery只返回 bounded identities；search、recent、grouped list只处理 bounded projection，错误限制在Picker。
- [Risk] `selectedWorkflowId` 对应remote identity被重命名或删除。-> 启动恢复失败时保留空current Workflow并引导Change，不猜相似identity。
- [Risk] workflow revision变化后mapping指向错误input。-> persistence key包含revision；Refresh/load发现revision变化后mapping失效并要求重新选择。
- [Risk] auto mapping把“唯一但不安全”的input当target。-> 只有类型、writable、locator与adapter能力全部明确时才算unambiguous；否则zero或ambiguous。
- [Risk] `#` node内custom widget破坏renderer或runtime value。-> strict primitive allowlist；unsupported/complex widget隐藏并保留原值。
- [Risk] metadata lookup失败掩盖本可提前发现的no-output错误。-> unknown defer native authority，并在Diagnostics标记preflight unavailable；不把unknown误判成invalid。
- [Risk] session-only Form overrides在reload后丢失。-> 明确由ComfyUI保存workflow defaults；插件V1不承担workflow state persistence。
- [Risk] UI隐藏format/source后支持排障变难。-> user surface保持product vocabulary；developer Diagnostics提供bounded internal code且不持久化。
- [Risk] Settings与首页职责分离增加一次navigation。-> 首页保留高频Send与current Workflow identity；低频Change/mapping/parameters放Configuration Surface。
- [Trade-off] V1不提供Import/Save/Reset/Advanced。-> 避免复制ComfyUI workflow editor与形成第二个配置authority。

## Migration Plan

1. 冻结旧Change剩余manual tasks并记录新Change为唯一ComfyUI authority；保留shared Task/Asset/transport safety owners。
2. 建立singleton `baseUrl` normalization与strict persistence allowlist；删除connection/profile repository与legacy persisted fields。
3. 建立remote identity discovery与Picker state，迁移`selectedWorkflowId`恢复；删除imported workflow repository与permanent settings tree。
4. 建立internal workflow parser/driver与revision identity；确保format/source不进入UI、persistence或Task history。
5. 建立conditional Input Mapping、revision-scoped explicit ambiguous mappings与session-only Form override store。
6. 建立`#`-only safe primitive parameter projection；删除image/mask/video/complex editors与Form Save/Reset flows。
7. 重建ComfyUI Workflow Configuration Surface与scoped Diagnostics；current Workflow只保留Change/Refresh/Open in ComfyUI。
8. 将唯一execution入口收束到首页Generation Workspace ViewModel；删除Settings中的Run/Queue与duplicate result controls。
9. 替换Imagen contract admission/mutation/output filtering；实现known false fast-fail、unknown native defer、broad image collection与zero-image completion。
10. 收紧Bridge allowlist，删除Import/contract payload并保留internal reset/dispose cleanup；运行deterministic gates、owner-local Chrome smoke与UXP manual smoke。

Rollback在cutover完成前按capability slice恢复上一通过gate的实现；不得同时注册legacy与new ComfyUI repositories/backends。Provider与shared Task/Job architecture不回滚。

## Open Questions

无。V1已锁定single Connection、Settings Workflow Configuration Surface、Picker子页、ComfyUI-owned JSON、strict persistence allowlist、session-only Form overrides、internal format handling、known/unknown output preflight与`#`-only safe parameters。
