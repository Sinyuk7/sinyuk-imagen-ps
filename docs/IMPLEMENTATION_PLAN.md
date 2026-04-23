# 实施计划 — Sinyuk Imagen PS

## 文档状态

- Status: Canonical
- Last Updated: 2026-04-23
- Scope: `bootstrap-ai-image-system-foundation`
- Related Docs: [BOUNDARIES.md](./BOUNDARIES.md), [DESIGN.md](./DESIGN.md), [TOKEN.md](./TOKEN.md), [UI_MAIN_PAGE.md](./UI_MAIN_PAGE.md)

本文件是当前 change 的唯一实施计划。范围、阶段、验收标准、非目标，都以本文件为准。

## 当前计划结论

当前 change 的重点不是 UI，也不是 Photoshop host 动作。

当前优先验证的是下面这条业务链路：

`surface -> thin facade -> runtime -> provider -> adapter`

这里的 `surface` 在当前阶段优先指 `CLI`，不是 `UXP UI`。

这意味着：

- 当前先写业务核心，再接 CLI，再接 UI。
- 当前先建立可复用的命令入口，再接具体 surface。
- Photoshop 仍然是第一目标 host，但不要求在本 change 内先完成 UI。
- UI 未来可以同进程直接调用 shared facade，不需要通过外部 CLI 进程绕行。

## 当前仓库真实状态

### 已完成

- monorepo、`pnpm workspace`、`turbo` 基础结构已建立。
- 包边界已存在：`packages/core-engine`、`packages/providers`、`packages/workflows`、`apps/ps-uxp`、`apps/web`。
- `core-engine` 已实现第一批共享契约：
  - `Job` / `Workflow` / `Provider` / `Asset` / `Error` 类型
  - `createJobError()` 及 failure taxonomy
  - `assertSerializable()` 与 `deepFreeze()` 等边界守卫
- `apps/web` 与 `apps/ps-uxp` 当前仍是占位壳，不属于当前交付物。

### 未完成

- typed runtime facade
- engine store
- event bus
- workflow runner
- provider registry / dispatch
- mock provider
- first real provider
- provider settings persistence
- thin application facade
- CLI surface
- runtime / facade / provider 集成测试

### 已验证

- 2026-04-23 本地执行 `pnpm build` 通过。
- 2026-04-23 本地执行 `pnpm test` 失败；原因是当前各 package 尚无测试文件，`vitest run` 以 `No test files found` 退出。

## 当前产品判断

### 当前最值得验证的对象

当前最值得验证的不是 Photoshop 深度动作，也不是 UI 完整闭环。

当前最值得验证的是：

1. runtime 边界是否稳定
2. provider 语义是否能完整封装在 provider 层
3. settings / config / submit / retry 这类用例是否能通过 shared facade 统一暴露
4. CLI 能否作为第一个 surface 验证整条业务链路

### 为什么不是先做 UI

- UI 会快速把注意力拉进布局、状态呈现、宿主细节和交互 polish。
- Photoshop host action 会把项目过早拖进更重的适配细节。
- 当前最核心的不确定性不在视觉层，而在共享业务链路是否成立。

### Photoshop-first 的当前含义

Photoshop-first 指的是：

- 将来第一个正式用户界面优先面向 Photoshop
- host adapter 优先考虑 Photoshop 约束
- UI 文档优先围绕 Photoshop 场景设计

它不意味着：

- runtime 围着 Photoshop 实现
- provider 语义向 Photoshop 回流
- 当前 change 必须先把 UXP UI 做完

## 架构基线

| 层 | 负责什么 | 不负责什么 |
|---|---|---|
| `packages/core-engine` | job lifecycle、workflow orchestration、provider dispatch、event emission、runtime facade | UI、CLI 命令、Photoshop API、文件系统、provider 参数语义 |
| `packages/providers` | provider schema、默认参数、capabilities、invoke、输入输出转换 | UI、engine state、surface-specific 返回格式 |
| `packages/workflows` | declarative workflow spec、step ordering、binding 数据 | 可执行逻辑、surface 编排、host side effects |
| `adapters` | settings storage、secret storage、asset IO、host capability bridge | 业务决策、provider 语义、surface 结构 |
| `thin facade` | 面向 surface 的稳定命令入口、依赖组装、统一返回结构 | runtime 状态机、provider 参数语义、直接 IO |
| `CLI` | 命令解析、参数输入输出、面向开发和自动化的入口 | 业务核心、provider 内部语义、runtime 内部状态 |
| `apps/ps-uxp` | 未来 Photoshop UI 与 host integration | 当前 change 的成功标准、runtime orchestration、provider semantics |
| `apps/web` | 可选开发 harness | 当前 change 的成功标准、正式产品方向 |

## 薄 Facade 约束

当前计划明确引入 shared thin facade，但这层必须保持极薄。

### 必须承担的职责

- 暴露稳定用例入口
- 组装 runtime、provider registry、settings adapter
- 输出统一成功 / 失败结构
- 收敛不同 surface 都会重复写的命令级编排

### 禁止承担的职责

- 不拥有自己的状态机
- 不复制 runtime lifecycle
- 不解释 provider 参数语义
- 不直接做网络或文件 IO
- 不长出 UI 专属 view model
- 不把 CLI 交互格式反向污染 runtime

### 当前预期命令面

- `listProviders`
- `describeProvider`
- `getProviderConfig`
- `saveProviderConfig`
- `submitJob`
- `getJob`
- `retryJob`

## Surface 策略

### 当前阶段

- 首个 surface 选 `CLI`
- CLI 用来验证 facade 是否足够稳定
- 不要求 UI 在本阶段接入

### 后续阶段

- UXP UI 直接同进程调用 shared facade
- MCP / skill 未来也复用这层 facade
- 不把“UI 调外部 CLI 进程”作为正式架构

### 这条决策的含义

- 统一的是命令契约，不是统一到“所有入口都必须走外部进程”
- 共享的是用例入口，不是把 UI 强行改造成 shell wrapper

## 当前明确不做

- 不做 Photoshop writeback、layer insertion、mask、selection-aware edits
- 不做 cross-provider 参数统一
- 不做 DAG / visual workflow editor
- 不做 job cancel / abandon
- 不做 durable job history
- 不做多任务队列、历史裁剪策略、后台恢复
- 不做 `apps/web` 正式产品化
- 不把 UXP 主界面纳入当前 change gate

## 分阶段计划

### Phase 0 — Foundation Audit

目标：确认现有基础层可以承载新的交付方向

交付内容：

- 校对共享契约与当前计划一致
- 清理文档里的 UI-first / web-first 语义污染
- 明确 facade / CLI / UI 的职责边界

退出标准：

- 文档范围与当前真实目标一致
- 当前 change 的 gate 不再依赖 UI 交付

### Phase 1 — Runtime Core

目标：让 shared runtime 真正“能跑起来”

交付内容：

- `packages/core-engine/src/store.ts`
- `packages/core-engine/src/events.ts`
- `packages/core-engine/src/registry.ts`
- `packages/core-engine/src/runner.ts`
- `packages/core-engine/src/runtime.ts`
- `submitJob` / `getJob` / `subscribe` 等最小 runtime facade

退出标准：

- 可以提交一个最小 `JobRequest`
- engine 能完成 `created -> running -> completed|failed`
- provider dispatch 不向 engine 泄漏 provider 语义

### Phase 2 — Provider Baseline

目标：证明 runtime contract 对真实 provider 可用

交付内容：

- provider registry
- `mock provider`
- 一个真实 provider 集成
- 最小 workflow spec
- provider config schema 与 defaults 模型

退出标准：

- mock provider 跑通 end-to-end
- 一个真实 provider 能跑完整 happy path
- provider 差异不污染 engine

### Phase 3 — Thin Facade

目标：给多个 surface 提供统一命令入口

交付内容：

- shared facade 模块
- provider config 相关命令
- job submit / query / retry 命令
- 统一错误结构与结果结构

退出标准：

- facade 可以独立驱动 runtime 和 provider
- facade 不复制 runtime 状态机
- facade API 足够供 CLI 使用

### Phase 4 — CLI Surface

目标：用 CLI 验证整条业务链路

交付内容：

- `provider list`
- `provider describe`
- `provider config get`
- `provider config save`
- `job submit`
- `job get`
- `job retry`

退出标准：

- 可以通过 CLI 完成 provider 配置、任务提交、状态查询、失败重试
- 不需要 UI 也能证明主业务链路成立

### Phase 5 — Verification And Hardening

目标：把“可跑”变成“可维护”

交付内容：

- core-engine unit tests
- provider contract tests
- runtime integration tests
- facade contract tests
- CLI smoke tests
- build / test / lint 的 CI 基线

退出标准：

- 关键共享边界有自动化测试
- facade 命令面稳定
- 文档与代码状态重新对齐

### Deferred — UXP UI

这不是当前 change 的 gate，但保留为下一阶段方向。

后续交付内容预计包括：

- UXP 主页面
- settings page
- provider config local persistence adapter 的 UI 接入
- asset adapter 的 UI 接入

后续约束：

- UI 直接复用 shared facade
- UI 不直接调用 provider 内部逻辑
- UI 不通过外部 CLI 进程通信

## 当前正式验收标准

以下全部满足，才算当前 change 完成：

1. engine 能执行最小 job lifecycle。
2. mock provider 与一个真实 provider 都能通过 shared runtime 跑通。
3. provider 配置可以通过 adapter 持久化，并通过 facade 暴露。
4. facade 能统一暴露 provider 与 job 相关命令。
5. CLI 能完成 provider 配置、任务提交、状态查询和失败重试。
6. 共享层边界没有 host API 泄漏，也没有 UI 语义倒灌到 runtime。

## 当前测试方向

### `core-engine`

- failure taxonomy
- `assertSerializable`
- `deepFreeze`
- lifecycle state transitions
- workflow binding resolution

### `providers`

- schema validation
- mock provider invoke contract
- real provider boundary transform

### `thin facade`

- provider config command contract
- submit / get / retry command contract
- unified error shape

### `CLI`

- provider config flow smoke
- submit happy path
- invalid config / provider error display

### 暂不进入正式测试门槛

- UXP 页面交互
- Photoshop writeback
- cancel / abandon
- queued jobs / eviction
- durable history recovery
- web route-level product flows

## 待决但不阻塞当前实现的问题

- 第一个真实 provider 选哪一个
- settings / secret storage 的具体 adapter 方案
- facade 放在哪个 package 或目录最合适
- CLI 目录采用 `apps/cli` 还是 `packages/cli` 的形式

默认处理原则：

- 能不阻塞 runtime 主链路的，先不要放进当前 gate
- 能由 facade 收敛的 surface 差异，不要拉回 runtime
- 能由 adapter 吞掉的 IO 差异，不要拉回 facade

## 文档维护规则

- 当前 change 的范围、阶段、验收标准，只看本文件
- `DESIGN.md`、`TOKEN.md`、`UI_MAIN_PAGE.md` 仍然有效，但属于后续 UI 阶段参考，不属于当前 gate
- 每完成一个 phase，都要同步更新本文件中的“当前仓库真实状态”和“退出标准”
