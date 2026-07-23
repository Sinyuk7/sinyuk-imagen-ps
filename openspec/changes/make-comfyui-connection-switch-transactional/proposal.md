## Why

当前 ComfyUI 连接切换没有形成一个以 draft URL 为不可变输入的完整事务：HTTP probe 使用新地址，而 Frontend Bridge Resolver 会在同一操作中重新读取旧 persisted state，导致 API、WebView 与 message origin validation 可能针对不同地址，并把 Bridge failure 误报为 `ComfyUI server is unavailable.`。同时，UI 未区分 draft、committed、active 与 provisional attempt，缺少 supersession ownership，旧异步结果可能覆盖用户的新输入或污染真实连接状态。

## What Changes

- **BREAKING**：以显式 connection-switch transaction 取代 `saveBaseUrl()` 语义。每次操作冻结 canonical target、`attemptId`、phase 与 `AbortSignal`，验证成功后才提交 durable state 并激活新连接。
- **BREAKING**：Frontend Bridge Resolver 不再读取 persistence；调用方必须把本次 immutable connection target 显式传入 resolver，并以同一 target 派生 WebView source、message target origin 与 event origin validation。
- 区分 UI-only draft、durable committed connection、runtime active connection 与 attempt-owned provisional Bridge。新 attempt 未完成时保留旧 active connection；失败、取消或 superseded 时只回收 provisional resources。
- 输入内容偏离当前 attempt target 时立即把旧 attempt 标记为 `SUPERSEDED`，中断 API/handshake 等待并 dispose provisional WebView；不自动连接新 draft，也不把 `ABORTED` 或 `SUPERSEDED` 显示为错误。
- 建立 phase-aware connection evidence 与错误分类，至少区分 URL validation、API reachability/response、WebView load、Bridge handshake/contract、persistence、abort 与 supersession；禁止再把所有失败折叠为 server unavailable。
- 将 ComfyUI Settings connection UI 收敛为一个 address input、一个 action button 和一块预留高度的持续状态文字，不增加独立 Test、Save、Cancel 或状态图标按钮。
- 按 `Invalid -> Connect disabled`、`Ready -> Connect`、`Connecting -> spinner + Connecting... disabled`、`Connected -> Reconnect`、`Failed -> Retry` 投影按钮；连接期间输入框保持可编辑，`Enter` 仅在当前动作可执行时触发。
- 输入错误使用 field validation；网络、WebView、Bridge 与 persistence failure 不把合法输入框染红，而通过准确、可修复的 negative help text 表达。draft 与 active 不同时持续显示真实 active URL；切换失败时明确旧连接仍可用。
- 增加 deterministic harness，证明 probe、WebView、message origin 与可选 WebSocket transport 均来自同一 immutable target，并覆盖 A -> B supersession、旧 active 保留、late completion suppression、provisional disposal 与 host teardown。
- 保持 production diagnostics 的现有 redaction contract：不记录 raw endpoint、origin、WebView URL、workflow identity 或 payload；使用 trace/span、phase、reason、result 与 harness assertions 定位一致性问题。

## Capabilities

### New Capabilities

- `comfyui-connection-switching`: 定义 ComfyUI connection-switch transaction、draft/committed/active/provisional ownership、并发与 disposal、phase-aware errors、单输入框/单动作按钮 UI，以及 Chrome/Photoshop UXP 验收契约。

### Modified Capabilities

无。

## Impact

- `packages/application`：ComfyUI management command、state projection、attempt ownership、commit ordering 与 error contract。
- `packages/execution-backends/comfyui`：management probe evidence、explicit-target Bridge Resolver port 与 phase-specific failure mapping。
- `apps/app`：Chrome/UXP resolver composition、provisional session lifecycle、UXP WebView message origin handling、persistence adapter、controller 与 Settings UI。
- Tests/harnesses：Application concurrency harness、execution management contract、Chrome/UXP Bridge lifecycle contracts、Settings interaction/ARIA/visual coverage，以及 real Photoshop UXP manual gate。
- `docs/ENGINEERING_CONTEXT.md` 与 `docs/TESTING.md`：实现完成后写回稳定的 transaction ownership、redacted diagnostics 与分层验证规则。
- Durable ComfyUI file schema 保持 `baseUrl`、`selectedWorkflowId` 与 revision-scoped mappings，不新增迁移或外部依赖。
