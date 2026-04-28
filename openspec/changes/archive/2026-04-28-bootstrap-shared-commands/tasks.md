## 1. 基础设施搭建

- [x] 1.1 确认 provider adapters 链路：验证 `createMockProvider → createDispatchBridge → adapter` 可用，确认 `adapters` 数组填充方式（v1 硬编码 mock provider adapter）
- [x] 1.2 创建 `app/src/shared/runtime.ts` — Runtime 单例（`getRuntime()` 懒初始化 + `_resetForTesting()`），注入 `builtinWorkflows` 与 mock provider adapter
- [x] 1.3 创建 `app/src/shared/commands/types.ts` — 公开类型：`CommandResult<T>`、`SubmitJobInput`（`workflow` union 约束 `'provider-generate' | 'provider-edit'`）、`JobEventHandler`

## 2. 命令实现

- [x] 2.1 实现 `app/src/shared/commands/submit-job.ts` — `submitJob(input: SubmitJobInput): Promise<CommandResult<Job>>`，内部调用 `runtime.runWorkflow`，try/catch 映射为 `{ ok: false, error: JobError }`
- [x] 2.2 实现 `app/src/shared/commands/get-job.ts` — `getJob(jobId: string): Job | undefined`，调用 `runtime.store.getJob`，直接返回结果（不走 Result 包装）
- [x] 2.3 实现 `app/src/shared/commands/subscribe-job-events.ts` — `subscribeJobEvents(handler: JobEventHandler): Unsubscribe`，调用 `runtime.events.onAny(handler)`（全量事件订阅）
- [x] 2.4 创建 `app/src/shared/commands/index.ts` — barrel 导出三命令 + 三类型，审查公开面与 spec 对齐

## 3. 内部辅助

- [x] 3.1 实现 `toJobError(error: unknown): JobError` 内部辅助函数（`submit-job.ts` 内部或独立 `_utils.ts`），将非 `JobError` 异常收敛为 `category: 'runtime'`

## 4. 单元测试

- [x] 4.1 `submitJob` happy path 测试：通过 mock provider 执行 `provider-generate` workflow，验证返回 `{ ok: true, value: Job }`
- [x] 4.2 `submitJob` error path 测试：binding 缺失返回 `{ ok: false, error: { category: 'workflow' } }` — 实际行为：`runWorkflow` 不抛异常，返回 `job.status === 'failed'`
- [x] 4.3 `submitJob` error path 测试：provider 失败返回 `{ ok: false, error: { category: 'provider' } }` — 实际行为：unknown provider 返回 `job.status === 'failed'` 且 `job.error.category === 'provider'`
- [x] 4.4 `getJob` 测试：已存在 jobId 返回 Job，不存在返回 undefined
- [x] 4.5 `subscribeJobEvents` 测试：接收 `created` + `running` + `completed` 事件；取消订阅后不再接收
- [x] 4.6 `subscribeJobEvents` error isolation 测试：注册两个 handler（一个抛异常），验证另一个仍正常接收事件

## 5. 公开面与边界验证

- [x] 5.1 类型审查：`commands/index.ts` 的 `.d.ts` 签名与 spec 中定义 byte-level 对齐 — 验证通过
- [x] 5.2 `grep -rn 'createRuntime\|mockProvider' app/src/ui/` 验证零匹配 — 验证通过（UI 层不直接引用 runtime）
- [x] 5.3 审查 `commands/index.ts` 导出清单不含 `runtime` / `getRuntime` / `store` / `dispatcher` — 验证通过（仅导出三命令 + 三类型）
