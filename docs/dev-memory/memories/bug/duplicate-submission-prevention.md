# 付费生成任务防重复提交 Harness 与 Retry 重复扣费修复

Date: 2026-06-26

## Problem / context

用户的一次生成 / retry / regenerate 最终会穿透到真实 Provider HTTP 请求并可能产生
费用。修复前代码在 UI 之下没有任何 in-flight 门禁：

- `useConversation.submit`/`retry`（`apps/app/src/shared/ui/hooks/use-conversation.ts`）
  无同步守卫；error-retry 与 regenerate 按钮在 `conversation.running` 时也未被禁用。
  同 tick 双击或在途期间重复点击会创建多个 Job 并并发穿透到 Provider。
- `session.submitJob`/`retryJob`（`packages/application/src/session/session.ts`）是纯透传，
  `commands.retryJob`/`submitJob` 每次调用都经 `runtime.runWorkflow` → `store.submitJob`
  mint 全新 Job id。
- 传输层 `withRetry`（`packages/providers/src/transport/image-endpoint/retry.ts`）默认对
  429/502/503/504 + `network_error` 各重试 3 次，**无 idempotency key**；`network_error`/
  502/504 在服务端已处理但响应丢失时会重发 → 重复扣费。
- `__clientRoundId` 被写入 job input 但从未被任何 dedup 逻辑读取（对 dedup 是死数据）。
- `{ ok: true, value: failedJob }` 模式意味着调用方必须看 `job.status` 而非 `result.ok`。

## Root cause

1. session/commands 层无 in-flight registry，每次 retry/submit 都 mint 新 Job。
2. 传输层 `withRetry` 对模糊失败（`network_error`/502/504）自动重试且无 idempotency key。
3. UI 按钮在 running 时未禁用，无同步 ref 门禁封住 React 状态更新前的同 tick 窗口。

## Fix / outcome

### 权威边界（三层）

1. **主边界 = session 层 in-flight registry**（`packages/application/src/session/session.ts`）。
   UXP/Chrome 双宿主共享的唯一交互入口（均经 `useImagenSession` → `createImagenSession`），
   位于 `packages/application`（满足「application 或更低」）。
   - `inFlightRetry`：按 failed-job 的 `jobId`（即 originJobId）去重。同一次 retry 在途期间
     所有重复调用复用同一 promise → 只创建一个新 Job、一次 dispatch、一次付费请求。
   - `inFlightSubmit`：按 `__clientRoundId` 去重；不同 roundId 的 submit 不串行化。
   - 锁释放由 promise 的 `.finally` 覆盖 success / `{ok:true,value:failedJob}` / `{ok:false,error}`
     / 抛异常全部路径。`{ok:true,value:failedJob}` 不会被误判成功（snapshot 来自 `job.status`）。
   - `dispose()` 清空两个 map。
2. **次边界 = UI 同步 ref 门禁**（`use-conversation.ts`，`useRef` 同步）。
   - `submitInFlightRef`：交互宿主单 in-flight contract，封住 send/regenerate 同 tick 双击窗口。
   - `retryInFlightRef`：按 roundId 封住同一 round 的 regenerate / error-retry 同 tick burst。
   - `main-page.tsx`：error-retry + regenerate 按钮在 `conversation.running` 时 `disabled`
     （与 send 一致），作为显式交互 contract。UI 仅作交互反馈，非唯一权威。
3. **传输层边界 = 能力感知 retry policy**（`packages/providers/src/transport/image-endpoint/`）。
   - `ProviderDescriptor.transport`（`contract/provider.ts`，可选字段）：`idempotency` +
     `retryPolicy`，显式表达 provider 能力，避免隐式假设。
   - `retry.ts`：新增 `classifyPaidRetry` 与 `RetryOptions.retryability`（`'broad'`|`'paid'`）。
     `broad`（默认，向后兼容，用于 discovery）保留旧行为；`paid` 为付费生成保守策略：
     无 idempotency 时只重试 429/503（可证明未被服务端处理），502/504/`network_error`/
     `timeout` 不自动重试。`idempotencySupported` 为真时恢复对 502/504/`network_error` 的重试
     （`timeout` 仍不重试）。
   - `paid-retry.ts`：`resolvePaidRetryConfig` / `buildIdempotencyKey`（djb2 哈希，从规范化
     request 字段派生稳定 key）/ `resolveIdempotencyHeader`。
   - `image-endpoint` 与 `chat-image` provider 的付费 `invoke` 改为传 `defaultPaidRetryPolicy`
     + `{ retryability:'paid', idempotencySupported }`，并在支持时附 `Idempotency-Key` header。
     `httpRequest` 签名不变（已带 `policy` 参数），新增可选 `opts`。`discoverModels`（非付费）
     保持 `broad` 默认。

### 四层（+history）计数模型

| 层 | 计数对象 | 计数器位置 |
|---|---|---|
| L1 用户意图 | 进入 `submit`/`retry` 的调用数 | useConversation 测试 spy |
| L2 新建 Job | `store.submitJob` mint 出的不同 Job id | command fake / store |
| L3 `provider.invoke` | 进入 `provider.invoke` 的次数 | counting provider |
| L4 HTTP attempt | 真实 outbound `fetch`（在 `provider.invoke` 之下，跨 `withRetry`） | counting fake transport |
| L5 history 终态 | `JobHistoryStore.put`（终态）次数 | push-array store |

L3/L4 必须分离：`withRetry` 夹在 `provider.invoke` 与 `fetchOnce` 之间，只有 L4 能看到
重试驱动的重复付费请求。

### retry / regenerate / submit 并发与去重 contract

- **retry**（按 `jobId` 复用 promise）：同一 failed Job 在途期间重复触发 → 1 新 Job、1 dispatch、
  1 付费请求。锁在 settle 后释放；新的明确 retry 意图正常执行。
- **regenerate**（ok round 的 retry 走 `submit` 路径）：按 `__clientRoundId` 去重；同 tick burst
  由 UI ref 门禁封住。每次有效独立操作仍可创建新 Job。
- **submit**：按 `__clientRoundId` 去重；不同 roundId 不串行化。同 tick 双击由 `submitInFlightRef`
  封住。未设 `__clientRoundId` 的非 UI/CLI 调用跳过去重（付费主边界是 retry registry）。
- **交互宿主单 in-flight contract**：UXP/Chrome 中 error-retry/regenerate/send 按钮在任一 round
  running 时禁用。session 层不串行化无关的 programmatic 调用。

### transport retry 安全边界

- 429（rate-limited）/ 503（service-unavailable）：可重试（服务端明确未处理）。
- 502 / 504 / `network_error`：无 idempotency 时不重试（服务端可能已处理、响应丢失 → 重复扣费）。
- `timeout`：永不重试。
- idempotency 支持时：发送稳定 `Idempotency-Key` header，502/504/`network_error` 恢复重试。
- 逻辑任务重试（retryJob）与传输层自动重试分开计数、分开决策。

## Harness 使用方式

- `packages/application/src/session/session.test.ts` 内联 `createDeferredCommands()`：deferred +
  counting `ImagenSessionCommands`，按调用序号 mint 不同 Job id 使「新建 Job 数」可观测。
- `packages/application/src/duplicate-submission.test.ts`：端到端真实 command → runtime → provider
  路径，用 `createCountingProvider`（deferred/失败可控）+ `_setRuntimeInstanceForTesting`
  （`packages/application/src/runtime.ts`，注入带 counting provider 的 runtime）观测 L2/L3。
- `packages/providers/tests/counting-transport.ts`：可编程 counting `fetch` fake，统计 L4 outbound
  HTTP attempt。
- `packages/providers/tests/retry.test.ts` / `paid-retry.test.ts`：`withRetry` paid 模式与
  `classifyPaidRetry` / `buildIdempotencyKey` / `httpRequest` idempotency-key 透传。

## Validation

- `pnpm --filter @imagen-ps/application test`（24 passed）
- `pnpm --filter @imagen-ps/providers test`（48 passed）
- `pnpm --filter @imagen-ps/app test`（88 passed，需先 `build:uxp` 产出 dist）
- `pnpm --filter @imagen-ps/app test:chrome-e2e`（17 scenarios passed，含 11 regenerate / 12 error-retry）
- `pnpm --filter @imagen-ps/cli test`（24 passed，含 retry 跨进程 contract）
- `pnpm check:policy`（passed）
- 修复前 red 证明：stash `session.ts` 后 `5 concurrent retries` 用例 `expected 5 to be 1`（5 次命令调用）。

关键修复后断言：5 次并发 retry → `invokeCount===2`（1 submit + 1 retry）、5 次拿到同一新 Job id、
history 2 条（1 failed + 1 completed）、retry 记录 `originJobId`+`retryAttempt:1`。

## Regression risk

- `packages/providers/tests/retry.test.ts` 既有 `network_error` 用例保留在 `broad` 模式（向后兼容，
  未改语义）。付费保守行为仅在新 `paid` 模式下生效。
- 传输层默认对付费请求更保守（模糊失败不重试）——可能把先前被掩盖的瞬时失败暴露为用户可见错误；
  对付费操作可接受。Provider 可通过 `transport.retryPolicy` 覆盖。
- session registry 按内存中的 jobId/roundId 去重；不会误并不同 job 的 retry（已由「不同 roundId
  不串行化」用例覆盖）。
- 应用 `tsc --noEmit` 构建（`apps/app`）在本次工作的基线（WIP commit e726218）上已因
  `spectrum-controls.tsx` 缺失 `@swc-uxp-wrappers/*` 类型声明而失败——此为基线既有问题，与本次
  变更无关；本次新增/修改文件无新增类型错误。vite `build:uxp`/`build:chrome` 可独立成功。

## 残余风险（如实记录，未实现为已完成）

- 无内置 provider 声明 `transport.idempotency:'supported'`，故 `Idempotency-Key` 通道当前无真实
  消费者，仅有传输层单测覆盖（`paid-retry.test.ts`）。image-endpoint/chat-image 默认按
  `unsupported` 处理（保守不重试模糊失败）。
- idempotency key 当前从规范化 request 字段（operation/prompt/imageCount/providerOptions）派生，
  `invoke` args 不携带 job origin；相同 prompt 的独立请求存在 key 碰撞风险。干净的长期方案是
  扩展 `ProviderInvokeArgs` 携带 `requestId`（本 slice 不做）。
- 跨进程 / 跨重载去重不在内存 session registry 覆盖范围：浏览器 reload 后 in-flight
  状态丢失。交互宿主单 in-flight + 按钮禁用部分缓解，但 reload 期间重复提交仍是残余风险。
  (The former `apps/cli` surface was removed, so CLI cross-process behavior is
  no longer in scope.)
- 502/504 是否「可证明未处理」存在判断空间；本 slice 保守判为模糊、无 idempotency 时不重试。
  若某 provider 能证明其 502/504 恒为预处理，可声明 `transport.retryPolicy` 重新启用。

## Relevant files

- `packages/application/src/session/session.ts`（in-flight registry 主修复）
- `packages/application/src/runtime.ts`（`_setRuntimeInstanceForTesting`）
- `apps/app/src/shared/ui/hooks/use-conversation.ts`（ref 门禁）
- `apps/app/src/shared/ui/pages/main-page.tsx`（按钮 disabled）
- `packages/providers/src/contract/provider.ts`（`transport?` 字段）
- `packages/providers/src/transport/image-endpoint/retry.ts`（classify + paid policy）
- `packages/providers/src/transport/image-endpoint/paid-retry.ts`（新增）
- `packages/providers/src/transport/image-endpoint/http.ts`（opts 透传）
- `packages/providers/src/providers/image-endpoint/provider.ts` + `chat-image/provider.ts`
- 测试：`session.test.ts`、`duplicate-submission.test.ts`、`use-conversation.test.tsx`、
  `retry.test.ts`、`paid-retry.test.ts`、`counting-transport.ts`
