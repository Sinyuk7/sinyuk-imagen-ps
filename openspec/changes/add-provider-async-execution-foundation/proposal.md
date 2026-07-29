## Why

当前 Provider 调用只能以一个长时间 `invoke()` Promise 表示。拥有异步结果查询协议的服务无法复用统一的提交、等待、取消与轮询安全边界；没有查询协议的同步 Provider 也不应被迫暴露空实现。

先建立 protocol-neutral 的 Provider async execution foundation，后续 GRSAI 或其他原生 async API 才能以小型 adapter 接入，并避免把远端状态机泄漏到 Application、Core Job 或 UI。

## What Changes

- 新增可选 `ProviderAsyncLifecycle` contract：Provider 一次提交后可返回 completed result 或 pending opaque remote reference，并可轮询该 reference 至终态。
- 新增 Application-composed async execution manager，统一管理提交后轮询的 timer、本地取消、单任务串行查询、hard budget 与安全错误归一化；providers 仅定义 protocol-neutral lifecycle 与 executor port。
- 保留现有同步 `Provider.invoke()` 路径；未声明 async lifecycle 的 Provider 保持原有行为，不需要迁移。
- 明确 paid submission 不会因模糊结果或轮询失败自动重新提交；查询重试只针对同一个 remote reference。
- 用 fake async Provider、fake clock 与 fake transport 建立 deterministic contract coverage；本 change 不实现 GRSAI live transport、UI 新状态、余额账本或 UXP 重开恢复。
- 更新 Provider architecture/testing 与跨包工程文档，约束 shared lifecycle 与 Provider-local wire protocol 的边界。

## Capabilities

### New Capabilities
- `provider-async-execution`: Provider 异步提交/查询合同、全局执行管理、同步 fallback、取消、预算与重放安全。

### Modified Capabilities

无。

## Impact

- `packages/providers`：Provider contract、dispatch bridge、builtins fake 与 contract tests。
- `packages/application`：async execution manager、runtime composition 与 deterministic manager tests。
- `packages/core-engine`：向 execution context 传递稳定 `jobId`，不改变 Job 生命周期或 dispatch promise 边界。
- `packages/providers/ARCHITECTURE.md`、`packages/providers/TESTING.md`、`packages/providers/AGENTS.md`、`docs/ENGINEERING_CONTEXT.md`：记录长期 ownership 与测试规则。
