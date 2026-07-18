## ADDED Requirements

### Requirement: Provider contract 必须保持不变
CHANGE-01 MUST保留 `Provider.describe/validateConfig/validateRequest/invoke`、Provider registry、canonical requests、request builders、response parsers、diagnostics、billing 与 transport policy。Provider implementations MUST不感知 TaskStore、Session、UI 或 host IO。

#### Scenario: Provider 经通用 adapter 执行
- **WHEN**Application dispatch 与重构前相同的 validated Provider request/config
- **THEN**Provider implementation MUST收到等价参数并返回等价 `ProviderInvokeResult`

### Requirement: Provider bridge 必须薄适配 ExecutionAdapter
Provider bridge MUST只负责按admitted implementation id从injected registry取得exact Provider、request extraction/validation、logger/AbortSignal propagation、`Provider.invoke()`调用与bounded `JobError` mapping。它 MUST不拥有implementation selection policy、profile state、queue、retry UX、billing或Task projection。

Provider bridge MUST在dispatch-time通过injected narrow resolver和non-secret profile ref取得当前resolved config；resolved secret values MUST NOT进入Job、Task、Session persistence、output、error或logs。Adapter与resolver只消费admission已选择的implementation/profile refs，MUST不重新执行profile、implementation、model或output selection policy。Adapter不得缓存resolved config，也不负责admission或terminal projection。

#### Scenario: Provider validation error
- **WHEN**`Provider.validateRequest()` 返回显式 validation error
- **THEN**bridge MUST保留 error category并在任何 Provider invoke side effect 前失败

### Requirement: Provider Application behavior 必须严格等价
Application-owned Provider `GenerationBackend` MUST保留现有profile enabled check、implementation selection、model/output resolution、prepared image inputs、canonical request mapping、per-profile lane cap `2`、terminal projection、billing follow-up与retry reconstruction。它 MUST只把non-secret implementation/profile refs、canonical request与prepared `StoredAssetRef`写入admitted execution input。`packages/providers` MUST不吸收这些Application职责，重构 MUST不改变user-visible behavior。

#### Scenario: Text-to-image parity
- **WHEN**用户使用相同 profile、model、prompt 与 output settings提交 text-to-image
- **THEN**admitted canonical request的operation/model/output/prompt mapping、wire request、queue behavior、result assets、Task history与UI result MUST与`main`基线等价

#### Scenario: Image-edit parity
- **WHEN**用户使用相同 attachments、prepared input refs、prompt 与 output settings提交 image-edit
- **THEN**admitted canonical request MUST保留相同ordered `StoredAssetRef` inputs，dispatch-time materialization后Provider MUST收到相同ordered images/mask，且Preview/Download/Photoshop Placement MUST与`main`基线等价

#### Scenario: Backend / adapter 切分
- **WHEN**Application 通过 `GenerationBackend` 决定 admission、lane 与 terminal projection
- **THEN**`ExecutionAdapter` MUST 仅执行 dispatch-time provider call，且 provider package MUST 不读取 TaskStore、Session 或 UI state

### Requirement: Queue 与 retry 行为必须保持等价
Global/per-profile concurrency、FIFO eligibility、same-tick dedupe、queued removal、reload drop、failed Job Retry 与 Regenerate semantics MUST保持现有可观察行为。

#### Scenario: 同 profile 并发提交
- **WHEN**同一 profile 有超过 lane cap 的 queued submissions
- **THEN**Session MUST维持既有执行上限与 FIFO eligibility，且 MUST不丢失或重复 dispatch

#### Scenario: Failed Task Retry
- **WHEN**用户 Retry 一个允许重试的 Provider Task
- **THEN**Application MUST创建新 Job、保留 Task identity并继续既有 History/UI行为

### Requirement: Provider terminal follow-up 必须保持等价
Exact task cost、balance refresh、provider transport retry/failover evidence 与 errors MUST保持原 owner和原触发时机。Generic Session/Core MUST不吸收这些语义。

Provider profile secret refs MUST继续在dispatch时通过existing SecretStorageAdapter解析；resolved Provider config MUST不进入Job、Task或Session persistence。

#### Scenario: Provider Job terminal
- **WHEN**Provider Job completed或failed
- **THEN**Application MUST按现有条件执行 billing follow-up一次，且 failure MUST不篡改原 Job/Task result

### Requirement: CHANGE-01 必须通过完整 parity gate
完成 CHANGE-01 前 MUST通过 core contract、Provider/Application focused suites、app deterministic UI/host suites、policy checks 与 `pnpm validate`。Real provider、ComfyUI 与 Photoshop manual smoke MUST不成为该重构的默认 gate。

#### Scenario: 后续 backend spike
- **WHEN**一个 non-Provider fake backend 只实现既定 Application/Core seams
- **THEN**它 MUST能够完成 admit -> queue -> Job -> terminal Task projection，且实现过程 MUST不修改公共 Job、Task、Session 或 Dispatcher contract
