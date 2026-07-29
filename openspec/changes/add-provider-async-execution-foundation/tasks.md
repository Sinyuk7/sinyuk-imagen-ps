## 1. Async Provider contract

- [x] 1.1 在 `packages/providers` 定义 `ProviderAsyncLifecycle`、canonical submit/poll outcome、opaque remote reference、poll directive 与 injected `ProviderAsyncExecutionExecutor` port。
- [x] 1.2 更新 `ProviderDescriptor.invokeMode` 合同与 builtin descriptor tests，保证 async lifecycle/descriptor 一致，现有 sync Provider 无迁移。
- [x] 1.3 改造 provider execution bridge：保留 validation/config/materialization，sync Provider 只调用 `invoke()`，async Provider 调用注入 executor。
- [x] 1.4 扩展 provider contract/bridge tests，覆盖 sync fallback、async lifecycle 选择、一次 validation/materialization 与不泄漏 remote reference。

## 2. Runtime execution manager

- [x] 2.1 为 Core execution context 增加稳定 `jobId`，由 runner 传入 provider dispatch；保持 Job status 与 output contract 不变。
- [x] 2.2 在 `packages/application` 实现 host-neutral `ProviderAsyncExecutionManager`，以 `jobId` 管理 submit-once、pending poll、hard budget、delay clamp、AbortSignal 与 finally cleanup。
- [x] 2.3 在 Application runtime composition 创建 manager 并注入 provider bridge；测试 reset/dispose 不保留 in-flight state。
- [x] 2.4 用 fake lifecycle、fake clock/sleeper 编写 deterministic tests，覆盖 pending-to-success、terminal failure、query retry、budget exhaustion、abort、同 job 去重、cleanup 与零重复 submit。

## 3. Documentation and verification

- [x] 3.1 更新 `packages/providers/ARCHITECTURE.md`、`packages/providers/TESTING.md`、`packages/providers/AGENTS.md` 与 `docs/ENGINEERING_CONTEXT.md`，明确 Application manager / Provider protocol ownership、无查询 Provider fallback 与重放安全。
- [ ] 3.2 运行 affected provider/application/core-engine tests、`pnpm check:policy`、`pnpm validate`；不主动运行 Photoshop/UXP UI 验收。
