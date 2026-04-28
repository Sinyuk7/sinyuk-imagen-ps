## Context

monorepo 三个共享包（`core-engine`、`providers`、`workflows`）的契约层已稳固（OI-1~OI-4 全部修复、providers 公开契约决策完成、默认 workflow v1 与 runtime 装配位置已拍板）。`app/docs/CODE_CONVENTIONS.md` 要求 UI 通过 `shared/commands` 桥接 runtime，但该桥接层尚未实现。

当前依赖装配方向已确立：`ui → commands → runtime → packages/*`，`createRuntime(options?)` 签名为 core-engine 稳定面，装配位置归各 surface 的 shared/ 层。

## Goals / Non-Goals

**Goals:**

1. 在 `app/src/shared/` 建立 runtime 单例 + commands 模块，作为 UI ↔ runtime 的唯一合规通路
2. 首版三命令（`submitJob` / `getJob` / `subscribeJobEvents`）闭环 generate 主路径
3. 复用 `JobError` taxonomy，不引入新错误类型
4. 三命令签名达到 v1 stable，后续二期可在不破坏 v1 的前提下追加

**Non-Goals:**

- 不新建 `packages/shared-commands` 共享包（A1 决策：仅 app 内部模块）
- 不实现 `provider.list / describe / config.*`、`job.retry / cancel`
- 不引入 CLI surface、不做 UI 页面接线

## Decisions

### D1: 包位置 — `app/src/shared/commands/` 而非 `packages/shared-commands/`

**选择**: app 内部模块

**理由**: 当前仅 1 个 surface（app），提升为共享包属于过早抽象。`app/docs/CODE_CONVENTIONS.md` 已有"shared 层薄桥接"约束，直接落在 shared/ 下与既有约束天然吻合。如未来出现第二个 surface（CLI），再按需提取。

**替代方案**: `packages/shared-commands/` — 多一个包的维护成本，且强制 surface-agnostic 会让 UXP 特化诉求更曲折。

### D2: 命令范围 — 仅三命令（B1）

**选择**: `submitJob` + `getJob` + `subscribeJobEvents`

**理由**: 闭环 generate 主路径的最小集。`provider.*` 依赖 UI 尚不存在的 provider 选择器；`job.retry` 依赖 core-engine 尚不支持的 retry 语义；`provider.config.*` 牵出 storage adapter 新边界。

**替代方案**: 5 命令（加 `provider.list/describe`）或 7 命令（全量），首个 change 过重。

### D3: 错误模型 — 复用 `JobError`，不造 `CommandError`

**选择**: `CommandResult<T> = { ok: true, value: T } | { ok: false, error: JobError }`

**理由**: core-engine 已有完善的 `JobError`（含 `category: 'workflow' | 'validation' | 'provider' | 'runtime'`），bridge 层、runner 层都按此 taxonomy 抛错。引入 `CommandError` 会造成双层错误模型，调用方需要区分两种错误结构。

**替代方案**: 独立 `CommandError` 包装 — 增加复杂度，无实质收益。

### D4: Runtime 单例 — 懒初始化 + 测试重置

**选择**: `shared/runtime.ts` 中 `let instance: Runtime | null = null` + `getRuntime()` 懒初始化 + `_resetForTesting()`

**理由**: 懒初始化避免 app 启动时无条件创建 runtime（首次 `submitJob` 时才触发）；`_resetForTesting()` 以下划线前缀约定仅测试用，解决单例在测试间污染问题。

**替代方案**: 依赖注入 — commands 签名需增加 `runtime` 参数，污染公开面。

### D5: `submitJob` 返回 `Promise<CommandResult>` 而非直接抛错

**选择**: Result 包装

**理由**: 让同步错误（workflow 不存在、binding 缺失）与异步错误（provider invoke 失败）走同一 Result 通路，调用方在 `then` 链中统一处理 `ok/error`，无需 try/catch。

**替代方案**: 直接 `Promise<Job>` + throw — UI 层需要 try/catch，错误处理分散。

### D5b: `getJob` 直接返回 `Job | undefined`，不走 Result 包装

**选择**: 直接返回

**理由**: `getJob` 是纯同步查询（`runtime.store.getJob`），不存在异步错误场景。用 `CommandResult` 包装会导致 `ok: false` 分支永远不可达，成为死代码。保持与 `job-store` spec 中 `getJob` 签名一致。

**替代方案**: `CommandResult<Job | undefined>` — 统一 commands 公开面，但引入无意义的 `ok: false` 分支。

### D6: `subscribeJobEvents` 无 Result 包装，内部使用 `onAny`

**选择**: 直接返回 `Unsubscribe`，内部调用 `runtime.events.onAny(handler)`

**理由**: 事件订阅是纯内存操作，不会失败；`onAny` 是 `lifecycle-events` spec 定义的全量事件订阅 API，handler 接收所有事件类型（`created` / `running` / `completed` / `failed`），由调用方按 `event.type` 过滤。

**Fallback**: 若 mitt 版本不支持通配符 `'*'` 订阅，则在 `shared/runtime.ts` 的 `getRuntime()` 中手动注册所有已知事件类型到统一 handler，对外暴露 `onAny` 语义。

### D7: v1 稳定性策略 — 签名冻结 + 新文件追加

**选择**: 三命令 + 三类型签名冻结在 v1，二期以新文件 + barrel 追加导出

**理由**: 保证二期命令（`provider.list` / `describe` 等）不破坏首版调用方。

## Risks / Trade-offs

- **`JobInput` 过于宽松** → SPEC 中 `SubmitJobInput` 的 JSDoc 注明各 workflow 必需字段；后续可在 commands 内按 workflow name 做 schema 校验
- **runtime 单例污染测试** → `_resetForTesting()` + 每个 test suite 的 `beforeEach`
- **`runtime.events.onAny` API 形态** → D6 已决策使用 `onAny`；若 mitt 不支持通配符，fallback 为手动注册所有事件类型
- **providers bridge 在 app 层的接法** → 实现时按 `createMockProvider → createDispatchBridge → adapter` 链路填充 `adapters` 数组；`getRuntime()` 中硬编码 mock provider adapter（v1 仅 mock），后续 provider 选择器 change 再改为动态注入
- **二期命令破坏 v1** → D7 "新文件追加"策略
