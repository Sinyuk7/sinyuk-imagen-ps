## ADDED Requirements

### Requirement: Job kernel 必须保持 backend-neutral
`core-engine` MUST只拥有 serializable Job facts、lifecycle transition、store、events、Workflow runner 与 opaque execution dispatch。Core MUST NOT导入或分支处理 profile、model、Provider request、ComfyUI、HTTP、Canvas、remote prompt ID 或 backend result shape。

#### Scenario: 不同 backend 使用同一 Job lifecycle
- **WHEN**两个 registered adapters 接收不同 shape 的 opaque params
- **THEN**Core MUST以相同的 `created -> running -> completed|failed` lifecycle 执行，且 MUST不读取 params 的 backend-specific fields

### Requirement: Execution dispatch 必须使用单一通用 contract
Core MUST定义 `ExecutionRef`、`ExecutionContext`、`ExecutionAdapter` 与 `ExecutionDispatcher`。Dispatcher MUST按 bounded adapter identity 路由、隔离 caller-owned params、传播 logger/AbortSignal，并拒绝 unknown adapter。

#### Scenario: Registered adapter dispatch
- **WHEN**runner dispatch 一个合法 `ExecutionRef`
- **THEN**matching `ExecutionAdapter` MUST恰好调用一次并收到 immutable params 与同一 cancellation/logging context

#### Scenario: Unknown adapter
- **WHEN**`ExecutionRef.adapter` 未注册
- **THEN**Dispatcher MUST在任何 backend side effect 前返回 bounded validation error

#### Scenario: Adapter 尝试取得 Application state
- **WHEN**实现一个 registered `ExecutionAdapter`
- **THEN**其 public contract MUST只提供 opaque params与ExecutionContext，MUST不提供TaskStore、Session、profile repository、UI或host ports

### Requirement: Execution errors 必须保留 structured 分类
Core MUST继续使用 structured `JobError`，并保留现有 classification semantics；`execution` MUST表示 adapter/runner/internal execution fault，`validation` MUST表示 unknown adapter、非法 contract、non-serializable caller input 或其它 caller/input 违规，`provider` 等既有分类 MUST仍可用于桥接层映射。Core MUST NOT把所有故障折叠成单一字符串错误。

#### Scenario: Unknown adapter
- **WHEN**`ExecutionRef.adapter` 未注册
- **THEN**Dispatcher MUST在任何 backend side effect 前返回 `validation` 分类的 bounded error

#### Scenario: Adapter 抛出非 structured 错误
- **WHEN**registered adapter 或 runner 抛出非 `JobError` 的异常
- **THEN**Core MUST将其收敛为 `execution` 分类的 bounded `JobError`

### Requirement: Workflow step 必须显式声明 execution adapter
Executable Workflow step MUST使用 `kind: 'execution'` 与显式 static adapter identity。Runner MUST NOT从 input 字段或 step name 猜测 adapter；没有执行语义的 reserved step kinds MUST从 public executable contract 删除。

#### Scenario: Step input 包含误导字段
- **WHEN**execution step params 包含 `provider`、`backend` 或其他类似字段
- **THEN**Runner MUST仍使用 step 声明的 adapter identity，且 MUST把 params 当作 opaque data

### Requirement: Runner 必须保留有序 handoff 与 immutable output
Runner MUST按 Workflow 顺序解析 bindings、执行 steps、把每个 adapter result 发布到明确 output key，并拒绝 backend 修改 caller input或先前 step output。

#### Scenario: 多 step output handoff
- **WHEN**后续 execution step 引用前一 step 的 output
- **THEN**Runner MUST传入 resolved immutable value，并在全部 steps 成功后完成 Job

### Requirement: Core 不得拥有 backend replay policy
Core MUST NOT因 timeout、network error、unknown result 或 adapter identity 自动 replay execution。Adapter 内部明确安全的 transport retry MAY发生在同一 Job 内；新的 execution attempt MUST由 Application 显式创建新 Job。

#### Scenario: Adapter 返回 unknown execution state
- **WHEN**adapter 报告无法确认远端是否已执行
- **THEN**Core MUST终止当前 Job且 MUST不再次调用 adapter

### Requirement: Job与dispatch params不得持久化resolved secrets
Job input/output、ExecutionRef params、errors与logs MUST不包含API keys、passwords、authorization values或resolved credentials。它们 MAY保存bounded secret refs；ExecutionAdapter MAY通过composition-injected resolver在dispatch期间解析secret ref，但 MUST不把value写回Job或Task。

#### Scenario: Terminal output 含有 secret 或非 serializable value
- **WHEN**adapter result 在进入 Job store 前包含 resolved secret、function、symbol、循环引用或其它非 serializable payload
- **THEN**Core MUST在标记 Job completed 前失败当前 Job，并返回 bounded `execution` error，且 MUST不把未验证 payload 持久化为 final output

#### Scenario: 终态写入前的验证顺序
- **WHEN**runner 处理 terminal adapter result
- **THEN**Core MUST先完成 serializability/secret boundary validation，再把 final output 写入 Job store，并仅在写入成功后完成 terminal transition

#### Scenario: Adapter需要credential
- **WHEN**backend execution需要一个已保存secret
- **THEN**adapter MUST在dispatch期间通过injected resolver取得value，并且terminal Job snapshot MUST只保留non-secret reference或sanitized facts

#### Scenario: Abort 发生在 execution 中
- **WHEN**AbortSignal 在 dispatch 前、dispatch 中或 terminal handoff 前被触发
- **THEN**Core MUST终止当前 Job、MUST不重试，并且 MUST不把 partial result 写入 final output
