## Context

当前连接路径由 `SettingsPage` 的 `comfyAddressDraft` 调用 `useComfyUiManagement.saveBaseUrl()`，再进入 `createComfyUiManagementService().saveBaseUrl()`。Application 对候选 URL 调用 `ports.probe()` 后，只要 Promise resolved 就执行 `ComfyUiStateRepository.save()`；但 execution host 的 `testConnection()` 返回的是包含 `api`、`frontend`、`bridge` 的 evidence，Bridge 不可用或不兼容并不必然 reject。结果是 `saveBaseUrl()` 丢弃 evidence，把部分失败当作连接成功，失败时又统一折叠为 `ComfyUI server is unavailable.`。

更关键的地址一致性缺口位于 Bridge composition。Chrome 与 Photoshop UXP 都把 Bridge Resolver 的 `server.load()` 直接绑定到 `ComfyUiStateRepository.load()`；`resolve('discovery')` 因此不使用本次 UI 提交的 draft target，而会重新读取旧 persisted target。HTTP probe 可以访问 B，WebView/iframe、`postMessage` 与 `event.origin` validation 却仍基于 A。`http://localhost:8188`、`http://127.0.0.1:8188`、不同 scheme 或 port 均为不同 origin，不能互换。

UI 当前只有一个 local draft、`baseUrl`、`busy` 与通用 `error`。`mutate()` 成功后调用 `reload()`，`SettingsPage` 又通过 effect 把新到达的 `baseUrl` 无条件复制回输入框。该结构没有区分 draft、committed、active 与 provisional ownership，也没有 connection-attempt identity；旧异步结果可以覆盖用户的新 draft。现有 Resolver 有 session-level abort/dispose，但没有 attempt-owned provisional generation。

约束如下：

- `packages/application` 继续拥有 singleton ComfyUI state、connection transaction、workflow runtime invalidation 与 persistence ordering。
- `packages/execution-backends/comfyui` 继续拥有 API/Bridge bounded contract validation，不拥有 Application state、DOM、UXP 或 persistence。
- `apps/app` 继续拥有 Chrome iframe、UXP WebView、host persistence、shared React UI 与 i18n。
- Durable `PersistedComfyUiState` allowlist 保持 `baseUrl`、`selectedWorkflowId` 与 `ambiguousMappingsByRevision`，不增加 migration。
- Production diagnostics 继续遵守 `docs/ENGINEERING_CONTEXT.md` 的 redaction contract。
- UXP `network.domains` 与 `webview.domains` 是独立权限；WebView 会启动多个进程，stale provisional resource 必须主动回收。

## Goals / Non-Goals

**Goals:**

- 让一次连接操作从 canonical draft target 到 API、Bridge、persistence 与 active promotion 始终使用同一 immutable target。
- 让旧 active connection 在新 target 完成全部 validation 与 durable commit 前持续可用。
- 为 manual connect、startup recovery、reload 与未来内部调用建立单一 latest-wins coordinator。
- 让 abort、supersession、timeout、failure、promotion 与 host teardown 都有明确 resource owner 和 idempotent disposal。
- 将 API、WebView、Bridge 与 persistence failure 映射为准确的 structured result 和 UI copy。
- 用一个 address input、一个 action button 和一个 persistent status region 覆盖 validation、loading、success、retry 与 switching。
- 通过 deterministic harness 证明 target consistency、commit fencing、late-result suppression 与 disposal，再执行 Chrome 和 Photoshop UXP live gates。

**Non-Goals:**

- 不改变 Provider Profile endpoint、active Profile 或 Model Config 语义。
- 不改变 ComfyUI workflow JSON、Bridge protocol command、Queue submission、Task/Job 或 output contract。
- 不为地址编辑增加自动连接，也不增加独立 `Test`、`Save`、`Cancel` 或 status-icon button。
- 不移除 ComfyUI 页面中属于 workflow runtime 的 Refresh 或 Open in ComfyUI actions；单动作限制只属于 connection control。
- 不把 `localhost`、`127.0.0.1` 或其他表面等价 host 合并为同一 origin。
- 不持久化 attempt、Bridge session、connection evidence、phase 或 error。
- 不放宽 production log redaction，也不通过记录 raw URL 来证明一致性。
- 不在本变更重新定义 `selectedWorkflowId` 或 revision-scoped mapping 跨 server 的 durable policy。

## Decisions

### 1. Application 使用独立 connection coordinator

以 `connect(draftBaseUrl, ownerSignal?)` 取代 `saveBaseUrl()`。`connect` 表达完整行为，不再伪装成单纯 persistence setter。Management service 暴露可订阅 snapshot，并由一个 coordinator 统一仲裁所有 attempt：

```ts
interface ComfyUiConnectionSnapshot {
  readonly committedTarget?: ComfyUiConnectionTarget;
  readonly activeConnection?: ComfyUiActiveConnection;
  readonly provisionalAttempt?: ComfyUiConnectionAttemptSnapshot;
  readonly lastFailure?: ComfyUiConnectionFailure;
}

interface ComfyUiConnectionCoordinator {
  getSnapshot(): ComfyUiConnectionSnapshot;
  subscribe(listener: () => void): () => void;
  connect(draftBaseUrl: string, ownerSignal?: AbortSignal): Promise<ComfyUiConnectionResult>;
  supersedeCurrentAttempt(nextDraftBaseUrl: string): void;
  dispose(): void;
}
```

`draftBaseUrl` 仍是 UI-only raw text；coordinator 不持久化它。`committedTarget` 来自 repository，`activeConnection` 指向当前 runtime generation，`provisionalAttempt` 带有 `attemptId`、immutable target、phase、`AbortController` 与 provisional generation。`attemptId` 单调递增，所有 await 前后都执行 current-owner check。

Startup recovery 使用同一 coordinator 和 committed target，但不重复 persistence；manual attempt 可以 supersede startup attempt，反之亦然。Generic `mutate() -> reload()` 不再包裹 connect，因为 reload 不是 transaction correctness 的组成部分。

替代方案：继续在 React hook 内维护 `busy` 和 sequence。拒绝原因：无法仲裁 startup、manual、host teardown 与非 UI 调用，也无法拥有 Bridge generation 与 commit。

### 2. Canonical target 只创建一次并显式传递

连接输入必须显式包含 `http://` 或 `https://`。Normalization 保留 reverse-proxy path、移除无意义 trailing slash，并拒绝 credentials、query、fragment、control characters 与缺失 host。Bare-address HTTPS/HTTP candidate fallback 被移除，因为它在同一次用户动作中隐式改变 scheme 与 origin。

```ts
interface ComfyUiConnectionTarget {
  readonly baseUrl: string;
  readonly origin: string;
  readonly probeUrl: string;
  readonly frontendBaseUrl: string;
  readonly websocketUrl: string;
  readonly requestTimeoutMs: number;
  readonly observationTimeoutMs: number;
}
```

一个 pure helper 从 canonical `baseUrl` 派生全部 transport value。HTTP route joining 与 WebView source 必须保留 reverse-proxy path；message `targetOrigin` 只使用 exact `URL.origin`；WebSocket 使用同一 scheme/host/port/path policy。未启用 WebSocket 的 phase 仍可在 harness 中验证派生值，不要求 connection validation 打开 socket。

替代方案：只把 `baseUrl` 传给 HTTP probe，其他层继续各自解析或读取 state。拒绝原因：会重新制造本次 RCA 的 split-brain target。

### 3. Resolver 改为 target-bound disposable generation

移除 `SharedResolverOptions.server` 与 `ComfyUiServerReader`。Host adapter 提供 generation factory；target 在 generation 创建时冻结，之后 `resolve()` 只接收 workflow identity 与 `AbortSignal`。以下 generation/factory 属于 `packages/application` host port，并复用 execution package 的 `ComfyUiFrontendBridgeResolver` / `ComfyUiFrontendBridgePort`；execution package SHALL NOT 反向依赖 Application type：

```ts
interface ComfyUiFrontendBridgeGeneration extends ComfyUiFrontendBridgeResolver {
  readonly target: ComfyUiConnectionTarget;
  resolve(workflowId: string, signal?: AbortSignal): Promise<ComfyUiFrontendBridgePort | undefined>;
  retire(): void;
  dispose(): void;
}

interface ComfyUiFrontendBridgeGenerationFactory {
  create(target: ComfyUiConnectionTarget): ComfyUiFrontendBridgeGeneration;
}
```

API validation 成功后，attempt 创建一个 provisional generation，并通过该 generation 的 `resolve('discovery', signal)` 完成 WebView/iframe load、handshake 与 required capability validation。Generation 内的所有 session key、source、expected origin、timeout 和 URL 均来自 frozen target，不访问 repository。

Runtime 使用一个 active-routing Resolver proxy。Promotion 原子替换 proxy 指向的新 generation；新 resolve 立即路由新 target。旧 generation 无 pending exchange 时立即 dispose；存在已开始的 exchange 时进入 bounded retire，只允许既有 exchange 收敛，不接受新 resolve，随后 dispose。Provisional failure、abort 或 supersession 不 drain，立即 dispose。

替代方案：保留一个全局 Resolver，并在每次 `resolve(target, workflowId)` 中切换内部 map。拒绝原因：target、session cache 与 disposal owner 仍耦合，容易误删 active C 或复用 stale session。

### 4. Transaction 采用 prepare, durable commit, promote 顺序

一次 manual switch 的 phase 顺序固定为：

```text
validate URL
  -> probe API
  -> create provisional generation
  -> load Frontend Bridge
  -> handshake and validate contract
  -> compare-and-save durable state
  -> promote generation as active
  -> invalidate old runtime and start active-target discovery
```

API probe 在创建 WebView 前执行，避免不可达 server 消耗 UXP WebView process。`/system_stats` 必须满足 bounded status、body size、JSON 与最小 schema contract；仅 HTTP 200 不足以证明 Bridge 成功。Bridge handshake 必须验证 protocol、identity、limits 与 required `workflowDiscovery` capability。

在 durable commit 前，旧 active C、catalog 与 current workflow 继续可用。Commit 成功后，coordinator 在同一 Promise continuation 内同步更新 committed snapshot、切换 active-routing pointer、清除旧 server 的 catalog/current runtime/cache，并发布 success；之后才 retire 旧 generation。新的 discovery 属于 active-target refresh，不重新读取 target，也不决定已经完成的 connection transaction 是否成功。

若 API、Bridge 或 persistence 失败，provisional generation 被 dispose，旧 committed/active 不变。若 promotion 后旧 generation disposal 失败，只写 bounded diagnostic，不回滚已经成功的 target。

替代方案：先写 `baseUrl`，再让 reload 创建 Bridge。拒绝原因：Bridge failure 会留下不可用的 committed target，并暂时销毁真实 active state。

### 5. Durable commit 使用 compare-and-save 与明确线性化点

`ComfyUiStateRepository` 增加 attempt-aware 的 compare-and-save 能力，所有 ComfyUI durable mutation 继续通过 Application 的单一 write lane 串行化：

```ts
type ComfyUiStateCommitResult = 'committed' | 'conflict' | 'aborted';

compareAndSave(
  expected: PersistedComfyUiState | undefined,
  next: PersistedComfyUiState,
  signal?: AbortSignal,
): Promise<ComfyUiStateCommitResult>;
```

Coordinator 在进入 write lane、开始 staged write 和 authoritative replace 前都检查 `attemptId` 与 `AbortSignal`。Chrome adapter 使用可 abort 的 IndexedDB readwrite transaction 完成 compare + put。UXP adapter 先写同目录 staging file，再次检查 owner 后用 overwrite move/rename 替换 `comfyui-state.json`；abort、conflict、startup recovery 与 error path 清理 staging file。Primary record 的 schema 和 value allowlist 不变。

Authoritative transaction complete 或 file replace 是 durable linearization point。该点之前发生的 draft edit 可 supersede attempt，且不会留下 authoritative A；该点之后发生的 draft edit 逻辑上晚于 A 的成功，UI 将保留新 draft B，同时 committed/active 已是 A。Repository Promise resolution 的 continuation 必须先完成 active promotion，浏览器或 UXP 才能处理下一次 user event。

替代方案：普通 `save()` 后检查 attempt，并在 stale 时写回旧 snapshot。拒绝原因：存在 stale state crash window，也会覆盖同时发生的合法 durable mutation。

### 6. Error contract 按 phase 保留语义

Execution management host 返回 discriminated result，而不是把 Bridge evidence 藏在 resolved object 中。Application 只接受 API 与 Bridge required contract 均成功的 result：

```ts
type ComfyUiConnectionErrorCode =
  | 'API_UNREACHABLE'
  | 'API_INVALID_RESPONSE'
  | 'WEBVIEW_LOAD_FAILED'
  | 'BRIDGE_HANDSHAKE_TIMEOUT'
  | 'BRIDGE_CONTRACT_MISMATCH'
  | 'PERSISTENCE_FAILED'
  | 'SUPERSEDED'
  | 'ABORTED';
```

Resolver 内部 error 必须携带 bounded phase/reason，使 load event error、ready timeout、handshake timeout 与 handshake validation failure 可被稳定区分。Unknown host error 按当前 phase 映射到对应 public code，并只保留 sanitized cause；不把所有 catch 转成 server unavailable。`SUPERSEDED` 与 `ABORTED` 是 control-flow result，UI 不发布 negative state 或 toast。

替代方案：保留字符串 error 并由 UI substring match。拒绝原因：不稳定、不可穷举，也无法可靠测试 phase mapping。

### 7. UI 由 pure state projection 驱动

`useComfyUiManagement` 订阅 connection snapshot，并拥有 raw `draftBaseUrl` 与 `draftRevision`。Persisted state 只在 draft 尚未 dirty 的首次 hydration 中初始化输入；任何异步 completion 都不得无条件写 draft。`onDraftChange` 先更新 raw value，再在 canonical target 不同或无效时调用 `supersedeCurrentAttempt()`，并清除仅属于旧 target 的 `lastFailure` projection。

UI 使用 pure `deriveComfyUiConnectionUiState()`，优先级固定为 current attempt、invalid draft、current-draft failure、same-as-active、ready-to-connect：

| Derived state | Button | Disabled | Status |
| --- | --- | --- | --- |
| Invalid | `Connect` | yes | 修复性 URL validation；若有 active，第二行保留真实 active target |
| Ready, no matching active | `Connect` | no | 有 active 时显示 `Currently connected to {active}. Connect to switch.` |
| Connecting | spinner + `Connecting...` | yes | `Checking server`、`Loading Frontend Bridge`、`Validating Bridge` 或 `Saving connection` |
| Connected, same target | `Reconnect` | no | `Connected to {active}.` |
| Failed, same draft target | `Retry` | no | 准确 failure；有 active 时同时显示 `Still connected to {active}.` |

Connection control 只渲染一个 `TextField`、一个 `Button` 和一个稳定的 status/help region。Button 使用可容纳最长 locale label 的固定 inline size，input 与 button 高度一致；status region 保留一至两行高度。Long URL 使用 safe word break 与 two-line clamp/ellipsis，完整 canonical value 通过 accessible text 或 non-button tooltip 保留，不产生 horizontal overflow。Input 在 connecting 时保持可编辑。`Enter` 只在 derived action enabled 时触发相同 handler；handler 本身再次检查 enabled/attempt state，不能只依赖 UXP native `disabled`。

所有 action、validation、phase 与 result copy 进入 `apps/app` i18n messages。Status region 以稳定 `aria-describedby` 关联 input，并根据严重度使用合适的 live-region semantics；spinner 有 accessible label，但文字仍是主要 loading evidence。Runtime failure 不标记合法 URL field invalid。Toast 只能补充，不能替代 persistent status。

替代方案：连接成功后显示 disabled `Connected` button。拒绝原因：`Connected` 是状态而非动作，也会移除用户重建 WebView/handshake 的明确入口。

### 8. A 到 B 的并发语义固定为 edit-cancels, explicit-connect

假设 committed/active 为 C，用户启动 attempt A 后编辑为 B：

1. raw draft 立即变为 B。
2. 若 B 与 A canonical target 不同，A 变为 `SUPERSEDED`。
3. A 的 API/Bridge/persistence pending wait 被 abort，A provisional generation 被 dispose。
4. active C 不变，draft B 不被旧 completion 覆盖。
5. UI 根据 B 立即恢复 `Connect` 或 invalid state。
6. 系统不自动连接 B；只有用户再次激活 action 才创建 attempt B。

如果 raw text 变化但 canonical target 仍相同，attempt MAY 继续；completion 仍不回写 raw draft。Programmatic connect 或 startup recovery 也进入同一 coordinator，不能绕过 `attemptId` ownership。

替代方案：连接期间禁用 input 或把 action 改为 `Cancel`。拒绝原因：阻止用户修正 target，增加额外状态与误触路径，也没有解决 late completion ownership。

### 9. Chrome 与 UXP transport 使用 exact origin 和独立权限 gate

Chrome 保留 parent app HTTP origin 作为 Bridge identity origin；UXP 保留 plugin id 作为 Bridge identity origin。两端均以 connection target 的 exact origin 验证 remote event origin 与 expected source。

UXP WebView seam 改为 `postMessage(message, targetOrigin)`，不再省略 `targetOrigin`。`event.origin`、`event.source` 与 Bridge identity 必须全部匹配才允许完成 handshake/exchange。Manifest contract test 分别检查 `requiredPermissions.network.domains`、`requiredPermissions.webview.allow/domains` 与 `enableMessageBridge`；API permission 成功不代表 WebView permission 成功。当前 manifest 的 `domains: "all"` 可以保留，本变更不扩大权限。

替代方案：把 `localhost` 与 `127.0.0.1` 视为开发环境等价项，或使用 `*` target origin。拒绝原因：两者破坏 Web origin boundary，并可能接受错误 WebView 的 late message。

### 10. Exact target evidence 留在 harness，production log 保持 redacted

新增 recording fakes 捕获 `probeUrl`、`webViewSrc`、`messageTargetOrigin`、`websocketUrl`、attempt transitions、commit calls 与 dispose calls。Exact URL 断言只存在于 deterministic test memory，不进入 production logger。

Production spans 延续 `comfyui.bridge.*` namespace，并增加 connection transaction phase/result；attributes 仅允许 `transport`、`phase`、bounded `reason` 与 `result`。Trace/span linkage 用于串联 probe、Bridge、commit 与 promotion，但不记录 endpoint、origin、workflow/request identity 或 payload。

替代方案：把四个 URL 全部写入 debug log。拒绝原因：违反现有 redaction contract，并把可由 deterministic harness 证明的事实泄露到长期日志。

## Risks / Trade-offs

- [新增 generation 与 coordinator lifecycle 增加实现复杂度] -> 先建立 `createTestHarness()`、fake clock、deferred probe/commit 与 recording Bridge factory，再接真实 host adapter。
- [UXP staged replace 行为与 Chrome IndexedDB transaction 不完全相同] -> 为两端定义同一 `compareAndSave` contract，分别做 abort-before-linearization、conflict、failure、startup cleanup contract test。
- [连接切换发生在已有 Bridge exchange 或 generation execution 中] -> 新操作在 promotion 后只路由新 generation；旧 active generation bounded retire 既有 exchange，超时后强制 dispose。
- [显式 scheme 会拒绝过去可自动补全的 bare address] -> field validation 明确要求 `http://` 或 `https://`，避免 hidden origin selection；本项目无 legacy user/data migration 约束。
- [最长 locale label 导致 300px 面板拥挤] -> button 使用固定但 bounded size，input 使用 `minmax(0, 1fr)`，在 `300x420` stress 与 `360x600`、`420x680` acceptance viewport 验证无 overflow。
- [Connection error 与 workflow refresh error 同时出现] -> connection control 只显示 connection-scoped failure；workflow diagnostics 继续由原 section owner 显示，不互相覆盖。
- [Manifest 当前允许 all domains] -> runtime 仍执行 exact origin validation；permission narrowing 属于独立 security change，不在本变更顺带处理。
- [Old active disposal 本身失败] -> promotion 不回滚；记录 bounded failure，并由 host dispose 再次执行 idempotent cleanup。

## Migration Plan

1. 在 Application 与 execution package 增加 target、phase、result、generation 和 compare-and-save contracts，并先用 deterministic harness 固定 A -> B、late completion、commit fencing 与 disposal。
2. 拆分 execution management host 的 API 与 Bridge validation，移除“resolved evidence 等于成功”的语义，保留 bounded response/handshake validation。
3. 把 Chrome iframe 与 UXP WebView Resolver 改为 target-bound generation factory，删除 composition 中的 repository-backed `server.load()`，补 exact `targetOrigin` 与 origin/source tests。
4. 在 in-memory、Chrome IndexedDB 与 UXP file repository 实现 compare-and-save；UXP staging file 不改变 primary `comfyui-state.json` value schema。
5. 在 Application management service 引入 connection coordinator、active-routing Resolver 与 runtime invalidation；让 startup recovery、manual connect 与 host dispose 共用 ownership model。
6. 重构 `useComfyUiManagement` 与 Settings connection control，移除 unconditional draft sync 和 generic connect reload，增加 pure UI projection、i18n、ARIA、Enter 与 stable layout coverage。
7. 运行 package contracts、shared UI tests、visual/Chrome harness、manifest/build gates，再在真实 Photoshop UXP 验证 `127.0.0.1` connection、A -> B supersession、WebView handshake 与 teardown。
8. 实现完成后把稳定 ownership、diagnostics 与 harness 规则写回 `docs/ENGINEERING_CONTEXT.md` 和 `docs/TESTING.md`；不写入执行日志或一次性调查记录。

Rollback 通过回退代码与 contracts 完成；primary durable schema 未变化，无数据 rollback。Host startup SHALL 清理未完成的 UXP staging file。若新 connection 未 commit，旧 committed/active 保持可用；若已越过 durable linearization point，startup 从新 committed target 重建 active generation。

## Open Questions

无。实现不得在 apply 阶段重新打开已确定的 UI shape、A -> B semantics、origin boundary 或 persistence ordering；发现 host API 无法满足 staged replace 时，应停止该 slice 并以新证据重新设计 commit port，而不是退回 save-then-rollback。
