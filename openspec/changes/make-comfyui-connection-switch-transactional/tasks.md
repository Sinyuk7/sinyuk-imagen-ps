## 1. Harness 与 public contracts

- [x] 1.1 在 `packages/application/src/comfyui` 定义 `ComfyUiConnectionTarget`、connection snapshot、attempt phase、structured result/error、target-bound generation/factory 与 coordinator host ports；复用 execution Resolver interface，并为所有 cross-package export 添加简洁中文 JSDoc。
- [x] 1.2 用 focused unit tests 固定 target canonicalization：只接受显式 `http://` / `https://`、保留 reverse-proxy path、拒绝 credentials/query/fragment，并证明 `localhost` 与 `127.0.0.1` 不共享 origin。
- [x] 1.3 扩展 `createComfyUiTestHarness()`，提供 deferred API probe、recording Bridge generation factory、fake clock、deferred compare-and-save、transition recorder 与 idempotent dispose spy。
- [x] 1.4 先写 Application failing contracts，覆盖 active C 下连接 A、A -> B edit supersession、不自动连接 B、late A completion suppression、failure 保留 C、success promotion 与 equivalent canonical draft。
- [x] 1.5 先写 host persistence failing contracts，覆盖 abort-before-linearization、compare conflict、write failure、commit success 与 restart staging cleanup；断言 primary `PersistedComfyUiState` allowlist 不变。

## 2. Execution connection validation

- [x] 2.1 在 `@imagen-ps/execution-backend-comfyui` 扩展 `ComfyUiFrontendBridgeResolver.resolve()` 的 `AbortSignal` 与 phase-specific Bridge error contract，并为 cross-package export 添加中文 JSDoc；不得反向依赖 Application target/coordinator type。
- [x] 2.2 重构 management host，把 `/system_stats` API validation 与 Frontend Bridge load/handshake/contract validation 拆成显式 phase；API failure SHALL 在创建 Bridge generation 前短路。
- [x] 2.3 为 `/system_stats` 增加 bounded status、body-size、JSON 与最小 schema validation，并分别返回 `API_UNREACHABLE` 与 `API_INVALID_RESPONSE`。
- [x] 2.4 保留 load event、ready timeout、handshake timeout、identity/protocol/capability mismatch 的区别，映射为 `WEBVIEW_LOAD_FAILED`、`BRIDGE_HANDSHAKE_TIMEOUT` 与 `BRIDGE_CONTRACT_MISMATCH`，不再把 resolved evidence 当成功。
- [x] 2.5 更新 execution management/runtime contracts，证明 probe、Bridge validation 与 workflow discovery 都使用调用方提供的 target，且 abort 不发送后续 request。
- [x] 2.6 运行 `pnpm --filter @imagen-ps/execution-backend-comfyui build` 与 `pnpm --filter @imagen-ps/execution-backend-comfyui test`。

## 3. Application connection transaction

- [x] 3.1 以 `connect(draftBaseUrl, ownerSignal?)` 取代 `saveBaseUrl()`，删除 bare-address candidate probing，并让 manual connect、startup recovery 与内部调用进入同一 coordinator。
- [x] 3.2 实现单调 `attemptId`、current-owner checks、phase publication、`AbortController`、`SUPERSEDED` / `ABORTED` control-flow result 与 target-scoped `lastFailure`。
- [x] 3.3 实现 prepare -> API -> provisional Bridge -> handshake/contract -> durable commit -> active promotion 的固定顺序；所有 await 边界都抑制 stale result。
- [x] 3.4 增加 active-routing Resolver proxy；新 attempt validation 期间保留 active C，promotion 后只把新 resolve 路由 B，并让旧 generation bounded retire 后 dispose。
- [x] 3.5 在 successful promotion 时使旧 catalog、current workflow runtime、cache 与 pending refresh result 失效；后续 discovery 只使用 active target，不重新读取 persistence。
- [x] 3.6 让 failure、timeout、abort、supersession、Settings owner unmount 与 host dispose 分别执行正确的 provisional/active cleanup，并证明重复 `dispose()` 无副作用。
- [x] 3.7 更新 Application runtime contracts，覆盖每个 public error code、persistence failure、startup/manual overlap、unmount/host teardown 与 post-commit draft edit linearization。
- [x] 3.8 运行 `pnpm --filter @imagen-ps/application build` 与 `pnpm --filter @imagen-ps/application test`。

## 4. Atomic host persistence

- [x] 4.1 扩展 `ComfyUiStateRepository` 为所有 ComfyUI durable mutation提供 single write lane 与 `compareAndSave(expected, next, signal)`，返回 `committed | conflict | aborted`。
- [x] 4.2 在 in-memory repository 实现 deterministic compare-and-save，并验证 abort/conflict 不改变 authoritative snapshot。
- [x] 4.3 在 Chrome repository 使用可 abort 的 IndexedDB readwrite transaction 完成 compare + put；补 transaction abort、conflict、error 与 success contract tests。
- [x] 4.4 在 UXP repository 使用同目录 staging file 与 guarded overwrite move/rename；补 abort cleanup、startup cleanup、replace failure 与 primary-file preservation contract tests。
- [x] 4.5 将 repository conflict/write error 映射为 bounded `PERSISTENCE_FAILED` reason；禁止 save-then-rollback，禁止改变 `comfyui-state.json` value schema。

## 5. Chrome 与 UXP Bridge lifecycle

- [x] 5.1 把 `comfyui-frontend-bridge-resolver.ts` 重构为 target-bound generation，删除 `ComfyUiServerReader`、`SharedResolverOptions.server` 与所有 `state.load()` dependency。
- [x] 5.2 从同一 target 派生 `probeUrl`、保留 proxy path 的 `webViewSrc`、exact `messageTargetOrigin` 与 `websocketUrl`；用 recording harness 逐值断言一致性。
- [x] 5.3 更新 Chrome iframe transport，保持 parent app origin 作为 Bridge identity，同时严格验证 exact connection `event.origin`、iframe source 与 Bridge identity。
- [x] 5.4 更新 UXP WebView seam 为 `postMessage(message, targetOrigin)`，严格验证 exact connection `event.origin`、WebView source 与 Bridge identity，并覆盖 `loadstart` / `loadstop` / `loaderror`。
- [x] 5.5 在 Chrome 与 UXP composition 创建 generation factory 和 active-routing proxy，删除 repository-backed `server.load()` wiring；host dispose SHALL abort coordinator 并清理所有 generations/listeners/timers/DOM。
- [x] 5.6 增加 manifest contract test，分别验证 `requiredPermissions.network.domains`、`requiredPermissions.webview.allow/domains` 与 `enableMessageBridge`；保留当前权限范围，不以 API success 代替 WebView gate。
- [x] 5.7 更新 Bridge diagnostics tests：只允许 trace/span、`transport`、`phase`、bounded `reason`、`result`，并证明 raw endpoint/origin/WebView/WebSocket URL、identity 与 payload 未进入 production records。
- [x] 5.8 运行 `pnpm --filter @imagen-ps/app test:chrome`、`pnpm --filter @imagen-ps/app test:uxp`、`pnpm --filter @imagen-ps/app build:chrome` 与 `pnpm --filter @imagen-ps/app build:uxp`。

## 6. Shared Settings connection UI

- [x] 6.1 重构 `useComfyUiManagement`：只订阅 public connection snapshot、拥有 raw `draftBaseUrl` / dirty revision，移除 connect 的 generic `mutate() -> reload()` 与 unconditional committed-to-draft sync；UI SHALL NOT 直接读取或修改 transaction internals。
- [x] 6.2 实现并 unit test pure `deriveComfyUiConnectionUiState()` 的完整优先级：Invalid、Ready、Connecting、Connected、Failed，以及 draft != active、failure + old active、startup committed but inactive；projection SHALL 不执行 probe、commit 或 disposal side effect。
- [x] 6.3 将 connection control 保持为一个 `TextField`、一个 action `Button` 和一个 persistent status/help region；不得增加 `Test`、`Save`、`Cancel` 或 status-icon button，也不得移除独立的 Refresh/Open actions。
- [x] 6.4 使用现有 shared spinner/Icon + motion seam 显示 `Connecting...`，接入 `Connect` / `Reconnect` / `Retry` labels 与 API/Bridge/persistence phase copy；全部 copy 进入 `apps/app` i18n messages。
- [x] 6.5 让 input 在 connecting 时保持可编辑；canonical target 改变时立即 supersede provisional attempt、保留 active 与新 draft、清除旧 target failure，且不自动连接新 draft。
- [x] 6.6 实现 `Enter` 等价当前 enabled action，并在 click/keyboard handler 内添加 UXP-safe explicit guard；invalid/connecting event SHALL 不创建 attempt。
- [x] 6.7 将 URL validation 绑定到 field invalid/`aria-describedby`；runtime failure 只进入 negative persistent status；status 使用合适 live-region semantics，toast 不作为唯一反馈。
- [x] 6.8 更新 connection CSS：input/button 高度一致、button fixed bounded width、row 使用 `minmax(0, 1fr)`、status 预留一至两行并安全 clamp long URL；验证完整 accessible value、`300x420` 无 overflow，以及 `360x600` / `420x680` 无 layout shift/overlap。
- [x] 6.9 扩展 `comfyui-settings-ui.test.tsx` 与 shared harness，覆盖状态矩阵、A -> B edit、late completion、Retry/Reconnect、Enter、explicit disabled、ARIA、i18n 和 header runtime actions preservation。
- [x] 6.10 运行 `pnpm --filter @imagen-ps/app test:ui` 与 `pnpm --filter @imagen-ps/app test:visual`，只在 review 后更新 accepted baseline。

## 7. Chrome functional acceptance

- [x] 7.1 扩展 mock Chrome E2E Settings scenario，使用 deferred fake target 证明 A -> B supersession、旧 active 保留、B explicit Connect、phase copy、no horizontal scroll 与 provisional iframe disposal。
- [x] 7.2 使用 `IMAGEN_COMFYUI_LIVE_BASE_URL=http://127.0.0.1:8188` 运行 opt-in live Chrome scenario，证明 `/system_stats`、Frontend Bridge handshake、workflow discovery 与 persistent Connected/Reconnect UI；记录 live gate 与 deterministic race proof 的边界。
- [x] 7.3 在 live Chrome 中执行 reconnect 与一次无效/不可达 target failure，确认准确 failure copy、合法 field 不染红、旧 active 仍可用，且 DOM 中不存在 stale provisional iframe。
- [x] 7.4 运行完整 `pnpm --filter @imagen-ps/app test:chrome-e2e`；若 `.test.env` 缺少 live workflow path，则分别报告 mock gate 与 live gate，不把未运行的 live scenario 记为通过。

## 8. Photoshop UXP real-host acceptance

- [ ] 8.1 运行 production UXP build，并用 UDT/Photoshop 加载当前 plugin；确认 manifest 的 network 与 WebView permissions 均生效。
- [ ] 8.2 在真实 panel 连接 `http://127.0.0.1:8188`，验证 `Checking server` -> `Loading Frontend Bridge` -> `Validating Bridge` -> `Saving connection` -> Connected/Reconnect 的可见状态与实际 workflow discovery。
- [ ] 8.3 在真实 UXP 执行 A -> B edit-cancels flow，确认 input 可编辑、A provisional WebView 被回收、旧 active 保留、B 不自动连接、late A event 不覆盖 draft 或显示 error。
- [ ] 8.4 验证 UXP outgoing message 使用 exact `targetOrigin`，`localhost` 与 `127.0.0.1` 不共享 session；触发 WebView load/handshake failure 时不得显示 `ComfyUI server is unavailable.`。
- [ ] 8.5 通过 `node scripts/uxp-debug/uxp-debug.mjs` 或等价 structured probe 检查 WebView/listener/timer teardown、connection control rect、status lines 与 console summary；一次性日志/截图不得写入 maintained docs。

## 9. Canonical writeback 与最终 gate

- [x] 9.1 更新 `docs/ENGINEERING_CONTEXT.md`，记录 immutable target、draft/committed/active/provisional ownership、active generation routing、exact origin 与 redacted diagnostics。
- [x] 9.2 更新 `docs/TESTING.md`，记录 connection harness、compare-and-save linearization、Chrome mock/live 与真实 Photoshop UXP 证据边界。
- [x] 9.3 运行 `pnpm check:policy`、`pnpm validate` 与 `git diff --check`，修复所有本变更引入的 failure；不得覆盖用户现有无关修改。
- [x] 9.4 运行 `openspec validate make-comfyui-connection-switch-transactional --type change --strict --json`，并逐项核对 proposal、design、spec 与 tasks。
- [x] 9.5 在 clean tree 执行 `pnpm release:verify`；`--allow-dirty` 只可作为 build rehearsal，不得记为 release readiness。
- [ ] 9.6 汇总 deterministic Application/execution/adapter/UI proof、Chrome live proof 与真实 Photoshop UXP proof；只有全部 required gate 完成后才标记 change complete。
