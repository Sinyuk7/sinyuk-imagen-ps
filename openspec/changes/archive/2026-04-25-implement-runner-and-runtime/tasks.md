## 1. Runner Core

- [x] 1.1 创建 `src/runner.ts`，定义 `runWorkflow` 函数签名与依赖接口
- [x] 1.2 实现 workflow 查找（通过 `WorkflowRegistry.get`），未命中时抛出 `JobError`（`category: 'workflow'`）
- [x] 1.3 实现 `provider` step 的顺序执行循环，非法 `kind` 时抛出 `JobError`（`category: 'workflow'`）
- [x] 1.4 实现 input binding 解析：将 `${outputKey}` 替换为前序 step 的实际输出值
- [x] 1.5 实现 output handoff：step 结果按 `outputKey`（或默认 `name`）发布到上下文
- [x] 1.6 集成 `JobStoreController`：在 step 循环前后调用 `markRunning` / `markCompleted` / `markFailed`
- [x] 1.7 集成 `ProviderDispatcher`：对每个 `provider` step 构造 `ProviderRef` 并调用 `dispatch`
- [x] 1.8 所有输出经 `assertImmutable` 保护，确保下游不可变

## 2. Runtime Assembly

- [x] 2.1 创建 `src/runtime.ts`，定义 `createRuntime` 函数与返回类型
- [x] 2.2 实现 `createRuntime({ store, events, registry, dispatcher })` 组装逻辑
- [x] 2.3 在 `createRuntime` 内部桥接 `events.emit` 到 runner 的执行流程
- [x] 2.4 `runWorkflow` 方法实现：submitJob → emit created → runner → emit completed/failed → return job
- [x] 2.5 支持通过 `initialWorkflows` 和 `adapters` 参数初始化 registry 与 dispatcher

## 3. Public Surface

- [x] 3.1 更新 `src/index.ts`，追加 `./runner.js` 与 `./runtime.js` 的 re-export
- [x] 3.2 确认 `runWorkflow` 与 `createRuntime` 出现在公开导出中

## 4. Tests

- [x] 4.1 创建 `src/runner.test.ts`：覆盖顺序执行、input binding、output handoff、非法 kind、provider 失败
- [x] 4.2 创建 `src/runtime.test.ts`：覆盖 createRuntime 组装、runWorkflow 成功路径、workflow 未注册、事件发射
- [x] 4.3 运行 `pnpm test`（或 `vitest run`）确保全部通过

## 5. Verification

- [x] 5.1 确认 `packages/core-engine` 编译无错误
- [x] 5.2 确认 `src/index.ts` 导出与 `SPEC.md` 目标公开面一致
- [x] 5.3 更新 `STATUS.md` 中 `implement-runner-and-runtime` 状态为 completed
