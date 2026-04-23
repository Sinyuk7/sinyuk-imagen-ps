# PRD.md — Core Engine 模块设计

## 文档状态

* **Status:** Proposed
* **Last Updated:** 2026-04-23
* **Scope:** `packages/core-engine`
* **Related Docs:** `docs/IMPLEMENTATION_PLAN.md`, `packages/providers/PRD.md`, `packages/workflows/PRD.md`

---

## 1. 背景

`core-engine` 是当前 change 的共享运行时核心。

当前优先验证链路是：

`surface -> shared commands -> runtime -> provider -> adapter`

因此，`core-engine` 当前最重要的任务不是“做更多功能”，而是证明：

1. job lifecycle 可以稳定运行
2. workflow orchestration 可以保持 declarative
3. provider dispatch 不会把 provider 语义带回 engine
4. host / UI / adapter 差异不会污染 runtime

---

## 2. 模块目标

`packages/core-engine` 当前阶段必须完成：

1. 定义共享 runtime contract
2. 管理最小 job lifecycle
3. 提供 workflow runner
4. 通过抽象 dispatcher 调用 provider
5. 提供 event emission 与 job store
6. 输出统一错误结构
7. 保持 host-agnostic

---

## 3. 非目标

当前阶段不做：

* UI state
* CLI command parsing
* Photoshop / UXP API
* file system access
* network calls
* provider config persistence
* provider 参数解释
* durable job history
* cancel / abandon
* queue / scheduler / background recovery

---

## 4. 核心原则

### 4.1 Engine 只拥有运行时，不拥有 provider 语义

Engine 可以：

* 调用 provider
* 校验 workflow shape
* 驱动 lifecycle
* 记录状态

Engine 不可以：

* 理解 `model` / `size` / `quality` / `background`
* 拼装外部 HTTP 请求
* 解析外部 API 响应字段

### 4.2 Engine 必须保持 host-agnostic

禁止直接接触：

* DOM / Browser API
* UXP / Photoshop API
* Node FS
* host-specific globals

所有 IO 必须经由 adapter 或 provider 边界完成。

### 4.3 Workflow 是 declarative，Engine 是 executable

`workflows` 只描述步骤。
`core-engine` 负责执行顺序、绑定解析、状态流转、错误落盘。

---

## 5. 运行时职责

### 5.1 Shared Contracts

负责共享类型：

* `Job`
* `Workflow`
* `Provider`
* `Asset`
* `Error`

### 5.2 Job Lifecycle

当前最小状态机：

* `created`
* `running`
* `completed`
* `failed`

当前不引入：

* `queued`
* `cancelled`
* `paused`

### 5.3 Workflow Runner

负责：

* 按顺序执行 step
* 解析 input binding
* 维护 step output handoff
* 返回 terminal result

不负责：

* provider 参数解释
* host side effects
* 文件读写

### 5.4 Provider Dispatch Boundary

Engine 只依赖抽象 dispatcher，例如：

* `providerId`
* `validated input`
* `ProviderResult`

Engine 不应直接依赖 `packages/providers` 的内部实现细节。

### 5.5 Event Bus And Store

必须提供：

* in-memory job store
* lifecycle event emission
* `submitJob`
* `getJob`
* `retryJob`
* `subscribe`

Store 是 source of truth。
Event 只是通知，不是状态本身。

---

## 6. 数据与边界约束

### 6.1 Serializable

所有跨包结果必须满足 serializable 要求。
禁止使用 `JSON.stringify` 作为边界校验。

### 6.2 Immutable

Workflow step handoff 必须视为不可变值。
需要使用显式冻结或等价保护手段。

### 6.3 Explicit Failure

所有失败必须落到 `JobError` taxonomy。
禁止 silent fallback。

---

## 7. 目录目标

当前目标目录：

```txt
src/
├── types/
├── errors.ts
├── invariants.ts
├── store.ts
├── events.ts
├── registry.ts
├── dispatch.ts
├── runner.ts
├── runtime.ts
└── index.ts
```

要求：

* 文件职责单一
* engine 内不混入 provider-specific helper
* 类型、状态、执行链路分开

---

## 8. 与其他模块的关系

### 对 `providers`

* 只消费 provider contract
* 不反向拥有 provider config 语义

### 对 `workflows`

* 执行 workflow spec
* 不把执行逻辑写回 workflow 包

### 对 surface / facade

* 提供稳定 runtime API
* 不关心 CLI / UI 的输入输出样式

---

## 9. 测试重点

必须覆盖：

* error taxonomy
* invariant guards
* lifecycle transition
* workflow binding resolution
* provider dispatch happy path
* provider failure path
* retry command contract

---

## 10. 验收标准

以下全部满足才算当前阶段完成：

1. engine 能执行最小 job lifecycle
2. workflow runner 能按顺序执行 builtin workflow
3. provider dispatch 不泄漏 provider 参数语义
4. store 与 event bus 都可被 facade/CLI 复用
5. 所有 runtime failure 都能映射到统一错误结构
6. `core-engine` 未引入 DOM / UXP / FS / network 依赖
