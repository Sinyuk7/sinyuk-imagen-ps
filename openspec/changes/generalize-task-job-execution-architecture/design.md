## Context

仓库当前依赖方向为 `apps/app -> packages/application -> packages/core-engine + packages/providers`。`core-engine` 的 `Job`、store、events 与 runner 已提供可复用 execution kernel，但 Workflow step、dispatch types、日志字段和 runtime assembly 仍以 Provider 命名；Application Session 又直接解释 `profileId`、Provider readiness、per-profile lane 与 billing follow-up。结果是新增 backend 必须复制 Session/Task/History 链路，或者绕过现有 Job kernel。

`TaskRecord` 当前位于 `core-engine`，但其 prompt、attachments、outputs、placement 与 display facts 属于用户可见 product history。它还包含 `providerInput`、`providerAssetKind`、`profileId/providerId/modelId` 等 Provider-specific 字段。此 ownership 与 `core-engine` 只负责 execution kernel 的模块角色冲突。

本 Change 是 behavior-preserving architecture migration。它只用现有 Provider 流程证明 extension seams 完整，不加入 ComfyUI 或任何新 backend。

## Goals / Non-Goals

**Goals:**

- 保持一个 backend-neutral `Job` lifecycle 与一个 backend-neutral execution dispatch path。
- 让 Application 通过统一 `GenerationBackend` seam 拥有 admission、queue policy、Task correlation 与 terminal projection。
- 让 durable `TaskRecord` 成为 Application-owned product history contract，并保持 Task 不解释底层 backend driver。
- 让现有 Provider 通过薄 bridge 接入新 contract，且全部可观察行为与 `main` 基线一致。
- 形成 CHANGE-02 可直接实现新 backend、无需再修改公共 Job/Task/Session contract 的稳定扩展点。

**Non-Goals:**

- 不添加 ComfyUI connection、workflow、driver、Bridge、Canvas 或 upload 行为。
- 不重写任何 Provider config、request builder、response parser、model catalog、billing 或 failover policy。
- 不改变 UI 信息架构、queue UX、retry UX、History、Preview、Download 或 Photoshop Placement。
- 不恢复 queued work，不引入 durable queue，也不增加 running-task remote cancellation。
- 不为尚无执行语义的 `transform` / `io` step 预留框架。

## Decisions

### 1. Core 只保留一个 execution vocabulary

`ProviderRef`、`ProviderDispatchAdapter`、`ProviderDispatcher` 与 `ProviderDispatchContext` 替换为：

```ts
interface ExecutionRef {
  readonly adapter: string;
  readonly params: Record<string, unknown>;
}

interface ExecutionContext {
  readonly logger?: Logger;
  readonly signal?: AbortSignal;
}

interface ExecutionAdapter {
  readonly adapter: string;
  dispatch(params: Record<string, unknown>, context?: ExecutionContext): Promise<unknown>;
}

interface ExecutionDispatcher {
  dispatch(ref: ExecutionRef, context?: ExecutionContext): Promise<unknown>;
}
```

Core 只验证 adapter identity、serializable params、immutability 与 lifecycle transition。它不读取 profile、model、workflow source、HTTP、remote ID 或 backend result shape。

备选方案是保留 `ProviderDispatcher` 并新增平行 `ExecutionDispatcher`。拒绝该方案，因为 runner 将永久保留 backend branch，新 backend 仍无法证明走同一 Job kernel。

### 2. Workflow 只保留当前真实可执行的 `execution` step

`StepKind` 收敛为 `execution`，adapter identity 成为 step 的显式静态字段，不再从 `resolvedInput.provider` 或 step name 猜测：

```ts
interface ExecutionStep {
  readonly name: string;
  readonly kind: 'execution';
  readonly adapter: string;
  readonly input?: Record<string, unknown>;
  readonly outputKey?: string;
}
```

Runner 仍负责 binding resolution、ordered steps、logger/AbortSignal propagation、immutable output handoff 与 Job terminal transition。

备选方案是保留 `provider | transform | io | execution`。拒绝该方案，因为 `transform/io` 当前没有运行语义，保留它们只扩大未实现 contract。

### 3. Job 保持 opaque execution attempt

`Job` 的 `id/status/input/output/error/timestamps/originJobId/retryAttempt` 语义不变。Job input/output 可包含 backend-owned serializable data，但 Core 不解释。Application correlation 不得依赖 adapter 解析 `__clientTaskId`、`__clientRoundId` 等字段；Task/Job link 由 Application sidecar 与 durable Task reference 持有。

Core error vocabulary 新增 `execution` category。分类边界固定为：unknown adapter、非法 `ExecutionRef` 与非 serializable caller input 属于 `validation`；Workflow lookup/binding/step shape 属于 `workflow`；adapter 抛出的非结构化异常与违反 output contract 的结果属于 `execution`；adapter 抛出的结构化 `JobError` 保留原 category；Provider bridge 自身的 invoke failure 继续使用 `provider`。Core Dispatcher 不再以 `provider` 作为通用 fallback。

Core 在 Job submit、每次 dispatch handoff、`afterStepResult` 之后以及 terminal output 写入 JobStore 之前验证 serializability 与 secret-free boundary。非法 terminal output 必须使当前 Job 失败，且不得把 partial output 写入 terminal snapshot。

Job、Task 与 `AdmittedGeneration` 只能保存 secret refs，不得保存 resolved credential values。每个 `ExecutionAdapter` 按 stable adapter id 注册一次，且不得持有 resolved-secret state。它在 dispatch 时通过 composition-injected narrow resolver，使用 params 中的 non-secret lookup ref 解析本次 config/credential；resolved values 只存在于调用栈，且不得进入 params clone、output、error details 或 logs。Provider 现有 `profileId -> SecretStorageAdapter -> resolved config`语义保持不变。

Core 不拥有 automatic backend retry。Provider transport 内部 retry/failover 属同一个 Job；Application 发起的新 execution attempt 才创建新 Job。

### 4. Task 属于 Application，且可关联顺序执行的多个 Jobs

Task 表示一次用户意图，Job 表示一次执行尝试：

```text
Task 1 -> 0..N Jobs
Task 同时最多一个 active Job
```

初次 Generate 创建新 Task 与新 Job。现有用户 Retry 保留同一 Task 并创建新 Job；Regenerate 创建新 Task 与新 Job。该区分保持现有 UI 行为，同时允许 backend policy 禁止某些 ambiguous execution 的 Retry。

完整 Task domain contract 移至 `packages/application`，包括 `TaskRecord`、`TaskStatus`、`TaskAttachment`、`TaskOutput`、`TaskPlacement`、`TaskExecutionSummary`、resource resolution types、evidence sanitizers、validator、TaskStore contract 与 task-history commands。`core-engine` 不再导出或依赖 Task types。`StoredAssetRef`、Job types 与 generic errors 保留在 `core-engine`。

Task contract 使用新的 `schemaVersion: 2`。这是 current-state schema break：decoder 只接受 v2；v1 返回 `unknown-schema`；不添加 migration、dual-write、legacy alias 或长期 compatibility branch。实施必须原子迁移 Task producers、Chrome/UXP persistence adapters、History/Preview/Download/Placement consumers与tests，不能在中间状态保留两套字段。

Task execution display facts 改为 bounded generic identity：

```ts
interface TaskExecutionSummary {
  readonly backend: { readonly id: string; readonly label: string };
  readonly connection?: { readonly id: string; readonly label: string };
  readonly target?: { readonly id: string; readonly label: string };
}
```

Provider profile/model 与未来 backend connection/target 只投影到这些 generic slots。Task、History UI 和 persistence adapter 不按 backend id 分支。

`TaskRecord.latestJobId` 保存当前最新Job reference；历史attempts继续由Job history的`originJobId/retryAttempt`链表达。`TaskAttachment.providerInput`重命名为`executionInput`。删除`TaskOutput.source.providerAssetKind`与整个Provider-shaped source identity；resource authority继续是`TaskOutput.asset.ref: StoredAssetRef`。确需保留的非身份provenance只能进入bounded generic evidence，且不得重复保存bytes、URL credentials或native path。

### 5. Application 使用一个 `GenerationBackend` seam

Application composition 注册 backend policy；Session 不直接读取 profile 或其他 backend config。完整 bounded contract 为：

```ts
interface JobExecutionRequest {
  readonly workflow: string;
  readonly input: Readonly<Record<string, unknown>>;
}

interface GenerationCommand {
  readonly taskId: string;
  readonly backendId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

interface ExecutionLane {
  readonly key: string;
  readonly maxConcurrency: number;
}

type ReadinessDecision =
  | { readonly status: 'ready' }
  | { readonly status: 'wait'; readonly reason: JobError }
  | { readonly status: 'reject'; readonly error: JobError };

interface GenerationRetryPolicy {
  readonly allowed: boolean;
  readonly reason?: string;
}

interface AdmittedGeneration {
  readonly taskId: string;
  readonly backendId: string;
  readonly execution: JobExecutionRequest;
  readonly runningTask: TaskRecord;
  readonly lane?: ExecutionLane;
  readonly retry: GenerationRetryPolicy;
}

interface TerminalProjectionInput {
  readonly admitted: AdmittedGeneration;
  readonly job: Job;
  readonly runningTask: TaskRecord;
}

interface RetryGenerationInput {
  readonly task: TaskRecord;
  readonly latestJob: Job;
}

interface TerminalFollowUpInput {
  readonly admitted: AdmittedGeneration;
  readonly job: Job;
  readonly task: TaskRecord;
}

interface GenerationBackend {
  readonly id: string;
  admit(command: GenerationCommand): Promise<AdmittedGeneration>;
  checkReadiness(submission: AdmittedGeneration): Promise<ReadinessDecision>;
  projectTerminal(input: TerminalProjectionInput): Promise<TaskRecord>;
  retry?(input: RetryGenerationInput): Promise<AdmittedGeneration>;
  afterTerminal?(input: TerminalFollowUpInput): Promise<void>;
}
```

以上`GenerationCommand`、`JobExecutionRequest`、lane/readiness/retry/terminal inputs全部是bounded value objects，不是额外ports或service owners。不得把它们拆成平行policy services；`GenerationBackend`仍是admission、readiness、retry、projection与follow-up的唯一Application policy owner。

`GenerationCommand` 只提供通用routing/correlation envelope；matching backend独占解释`payload`。Command与`AdmittedGeneration`必须deep-immutable、serializable、secret-free，且command/backend/admitted的taskId与backendId必须一致。`runningTask`必须是同一`taskId`的v2 running snapshot，且admission时尚无`latestJobId`；Session创建Job后复制该snapshot并写入`latestJobId`。`execution.input`对Session保持opaque，Core runner按named Workflow的static `step.adapter`构造`ExecutionRef`，因此adapter identity在workflow与params之间只有一个authority。

`ExecutionLane.key` 是非空 opaque string，`maxConcurrency` 是正整数。Session 始终应用 global cap `5`，再应用 admitted lane cap；无 lane 时只受 global cap。Provider backend 返回 per-profile lane cap `2`；后续 backend 可声明更小的 bounded cap，无需修改 Session。

Readiness 只在 submission 已出队、Job 尚未创建、running Task 尚未写入时检查。`ready` 继续；`wait` 保持 session-only queued、跳过本轮 drain，并在下一次 scheduler wake-up重检；`reject` 移除 queued submission并产生 bounded admission failure，且不创建 Job、running Task或remote side effect。公开 queue status 继续使用现有 vocabulary，不新增 user-facing `blocked` Task state。

Session 只负责 FIFO、global/lane concurrency、dedupe、remove、dispatch、Task write ordering 与 event publication。`__clientRoundId` 等 UI dedupe metadata 只存在于 Application queue admission boundary，不进入 Job input 或 adapter params。

Provider backend 继续拥有 profile lookup/enabled check、model/config resolution、per-profile lane、Provider retry reconstruction、billing follow-up 与 Provider result projection。它们不得进入 generic Session。

Provider `GenerationBackend.admit()`完成profile enabled check、provider implementation selection、model/output resolution、prepared asset refs与canonical request construction，产出`{ workflow, input }`，其中input只含non-secret profile/implementation refs、canonical request与prepared `StoredAssetRef`。Provider `ExecutionAdapter`只按已admit的implementation id执行exact registry lookup，并通过injected resolver取得该profile的当前resolved config；resolver与adapter均不得重新选择profile、implementation、model或output。随后adapter只负责`validateRequest()`、`invoke()`、logger/AbortSignal propagation与bounded error mapping。

`GenerationBackend` 与 `ExecutionAdapter` 是两个不同层次、不可互相替代的 ports：

```text
GenerationBackend (Application policy)
  admit command -> AdmittedGeneration + JobExecutionRequest
  readiness/lane/retry/terminal projection/follow-up
  MUST NOT执行remote transport

ExecutionAdapter (Core dispatch target)
  dispatch opaque params -> opaque result
  MAY通过composition-injected ports解析config/secret refs与host-neutral resources
  MUST NOT读取Task/Session/UI state或持久化resolved secrets
```

唯一调用链为：

```text
GenerationBackend.admit
-> Session queue
-> GenerationBackend.checkReadiness
-> generic executeJob creates Job
-> bind TaskJobCorrelation
-> persist running Task with latestJobId
-> run named Workflow
-> core ExecutionDispatcher
-> ExecutionAdapter
-> Job terminal
-> GenerationBackend.projectTerminal
-> persist terminal Task
-> GenerationBackend.afterTerminal
```

Application Session 持有唯一 `TaskJobCorrelation` sidecar。active entry 至少包含 `taskId/jobId/backendId/admitted`；`jobId` 是 terminal event路由 authority，Task durable `latestJobId` 是历史展示 authority。bind 必须发生在remote side effect前；重复 terminal event只能由 atomic terminal guard处理一次；terminal write与follow-up完成后释放active entry。Core、adapter与backend-specific params均不得解析 correlation metadata。

Terminal 顺序固定为：Job terminal -> `projectTerminal()` -> terminal Task persist -> `afterTerminal()`。若 projector 或 output materialization失败，Session基于 admitted running snapshot写入generic bounded failed Task，禁止永久running。`afterTerminal()`只在terminal Task成功persist后调用一次并受控等待；其异常仅记录sanitized log，不回滚、不覆盖Job/Task、也不向用户主结果抛出。

现有 `submit-job` 的 Provider dispatch injection、billing 与 terminal Task projection MUST拆回 Provider `GenerationBackend`；generic execute command 只创建/运行 Job。Application 只能通过 correlation entry中的 backend id找到同一个 registered `GenerationBackend`完成 terminal projection与follow-up，因此不存在第二套 owner。

备选方案是让 Session 接受一组零散 callback。拒绝该方案，因为 callback 组合没有稳定 owner，新 backend 很容易遗漏 readiness、terminal projection 或 follow-up。

### 6. Provider 本体与 wire semantics 不变

`packages/providers` 的 `Provider.validateConfig()`、`validateRequest()`、`invoke()`、`ProviderInvokeResult`、registry 与 transports 保持不变。Provider execution bridge 收敛为一个 stable `ExecutionAdapter` registration，继续传播 logger/AbortSignal并映射显式 `JobError`；resolved config不得被捕获到长期adapter state。

Application 的 Provider `GenerationBackend` 负责把 profile/model command 映射为 admitted execution，并把 opaque Provider result 转换为既有 Task outputs。Provider package 不依赖 Application、host IO 或 TaskStore。

### 7. 行为等价是完成条件，不是附加测试

实施前把现有 Provider 核心流程收敛为少量 characterization scenarios。重构后相同 fixtures 必须证明：request mapping、asset resolution、queue order/concurrency/dedupe、retry、billing、terminal history、preview/download/place 与 error projection 均保持一致。

CHANGE-02 若需要修改 `Job`、`ExecutionAdapter`、`GenerationBackend`、Session queue 或 Task lifecycle contract，CHANGE-01 必须视为未完成并重新打开。

## Risks / Trade-offs

- [Risk] 大范围类型移动可能制造机械 churn。→ 先固定 public contracts，再按 core、Provider bridge、Application、app composition 顺序迁移，禁止顺带重构 Provider internals。
- [Risk] 泛化 Session 时遗漏 Provider readiness、billing 或 retry side effect。→ 由 Provider `GenerationBackend` 明确拥有 `checkReadiness/retry/afterTerminal/projectTerminal`，并使用现有行为 fixtures 做 parity gate。
- [Risk] Task schema 重命名破坏 History resource resolution。→ `StoredAssetRef` 保持 authority，先迁移 projection，再迁移 UI imports；通过 Preview/Download/Placement scenarios 验证。
- [Risk] Task v2 原子迁移会使本地旧v1开发数据不可读。→ 按current-state规则fail closed，不建立legacy分支；测试明确验证v1被隔离。
- [Risk] 通用 interface 演变为包含所有 backend 可选字段的巨大 union。→ Core params/output 保持 opaque，Application generic seam 只允许 lifecycle/correlation/queue fields。
- [Trade-off] CHANGE-01 没有新增用户功能。→ 它建立独立、可验证的 extension seam，避免 CHANGE-02 再次复制执行体系。

## Migration Plan

1. 添加 backend-neutral core contract characterization tests，冻结 Job transition、dispatch isolation、binding handoff 与 AbortSignal/logger propagation。
2. 将 core dispatch types、Workflow step、runner/runtime 与 builtin Provider workflows迁移到 `execution` vocabulary。
3. 更新 `packages/providers` bridge 与 Application runtime composition；Provider implementations 保持不动。
4. 将完整 Task domain contract/helpers/store ownership原子迁移至Application v2，同时迁移所有app consumers并删除core Task exports；v1明确fail closed。
5. 建立 Provider `GenerationBackend`、dispatch-time resolver、TaskJobCorrelation与generic Session orchestration，把profile admission、lane/readiness、terminal projection、retry与billing从generic Session分离。
6. 迁移 `apps/app` imports/composition，保持 UI 与 host adapter behavior不变。
7. 运行 focused package tests、Provider/Application scenarios、Chrome/UXP deterministic suites 与 `pnpm validate`。
8. 在 CHANGE-02 开始前，用一个 non-Provider fake backend证明无需修改公共contract即可完成 admit -> queue -> Job -> terminal Task projection。

Rollback 为整体回退 CHANGE-01；不得保留双 Dispatcher、双 Session path 或兼容 alias 作为长期状态。

## Open Questions

本Change已锁定：Task v2不迁移v1；unknown adapter为`validation`而通用adapter failure为`execution`；adapter只做dispatch-time credential resolution；lane携带自身cap并同时受global cap `5`；Task Retry保持同一Task/new Job，Regenerate使用新Task/new Job；queued-only work继续session-only且reload/dispose时丢弃。

ComfyUI contract nodes、receipt/reload recovery、Bridge credential owner、Canvas lease与live gates不属于本Change，必须在 `add-comfyui-generation-backend` 自身refinement中决定。
