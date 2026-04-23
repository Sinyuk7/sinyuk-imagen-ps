# 实施计划 — Sinyuk Imagen PS

## 文档状态

- Status: Canonical
- Last Updated: 2026-04-23
- Scope: `bootstrap-ai-image-system-foundation`
- Design Inputs: [DESIGN.md](./DESIGN.md), [TOKEN.md](./TOKEN.md)

本文件是项目内的正式实施计划，用来取代散落在外部工具目录里的 restore / review 文档。后续范围、阶段、验收标准、延期项，都以这份文档为准。

## 文档审计

| 来源 | 角色 | 当前判断 | 处理方式 |
|---|---|---|---|
| `main-autoplan-restore-20260422-195131.md` | 主恢复计划 | 有效，但把仓库现状写成“尚未开始” | 作为主要输入，重写为当前版 |
| `claude-competent-faraday-188539-autoplan-restore-20260422-200045.md` | 产品方向 / wedge 分析 | 有效，尤其是 Photoshop-first + settings-first 判断 | 吸收进本计划的产品方向 |
| `claude-dreamy-cerf-cbdb25-autoplan-restore-20260423-103338.md` | 早期 PRD 草稿 | 部分过时，仍可参考架构语义 | 只保留宿主无关、Provider owned semantics 等结论 |
| `shenyeke01-claude-competent-faraday-188539-eng-review-test-plan-20260422-201747.md` | 测试草案 | 明显超前，假设了 cancel、队列、历史裁剪和已存在的 web 路由 | 不作为当前正式测试计划 |
| `prototype-brief.md` | 探索性原型文档 | 已不再需要，且会与正式计划竞争 | 已删除，不再作为项目入口 |
| [DESIGN.md](./DESIGN.md) | 视觉与交互基准 | 仍然有效，但需和 V1 lifecycle 决策对齐 | 已做最小校正 |
| [TOKEN.md](./TOKEN.md) | 实现级 token | 有效 | 继续保留为实现来源 |

## 当前仓库真实状态

### 已完成

- monorepo、`pnpm workspace`、`turbo` 基础结构已经建立。
- 包边界已经落下：`packages/core-engine`、`packages/providers`、`packages/workflows`、`apps/ps-uxp`、`apps/web`。
- `core-engine` 已实现第一批共享契约：
  - `Job` / `Workflow` / `Provider` / `Asset` / `Error` 类型
  - `createJobError()` 及 failure taxonomy
  - `assertSerializable()` 与 `deepFreeze()` 等边界守卫
- `apps/web` 与 `apps/ps-uxp` 当前仍是占位壳，不是可用产品界面。

### 未完成

- typed runtime facade
- engine store
- event bus
- workflow runner
- provider registry / dispatch
- mock provider
- first real provider
- provider settings persistence
- UXP 主面板与 settings 页面
- 共享 runtime 的集成测试与 host smoke tests

### 已验证

- 2026-04-23 本地执行 `pnpm build` 通过。
- 2026-04-23 本地执行 `pnpm test` 失败；失败原因不是逻辑回归，而是当前各 package 尚无测试文件，`vitest run` 直接以 `No test files found` 退出。

## 产品方向

### V1 目标

做一个 Photoshop-first 的图像生成工作台，而不是一个先做 web 产品、再迁回 Photoshop 的系统。

用户在 `v1` 需要稳定完成这条闭环：

`配置 provider -> 选择 provider/model -> 上传图片 -> 输入 prompt -> 提交任务 -> 看到状态 -> 拿到结果`

### V1 必须成立的事

- Photoshop UXP 是唯一必需的用户-facing host。
- settings page 是主流程的一部分，不是后补项。
- runtime 必须保持 host-agnostic。
- provider 参数语义必须完全由 provider 自己拥有。
- 执行模型保持 deterministic + sequential。

### 明确不做

- 不做 cross-provider 参数统一。
- 不做 DAG / visual workflow editor。
- 不做 job cancel / abandon。
- 不做 durable job history。
- 不做多任务队列、历史裁剪策略、后台恢复。
- 不把 `apps/web` 当作 v1 的正式产品面。

## 架构基线

| 层 | 负责什么 | 不负责什么 |
|---|---|---|
| `packages/core-engine` | job lifecycle、workflow orchestration、provider dispatch、event emission、runtime facade | UI、Photoshop API、文件系统、provider 参数语义 |
| `packages/providers` | provider schema、默认参数、capabilities、invoke、输入输出转换 | UI、engine state、宿主能力 |
| `packages/workflows` | declarative workflow spec、step ordering、binding 数据 | 可执行逻辑、host side effects |
| `adapters` | asset IO、settings storage、host capability bridge | 业务决策、provider 语义、UI 结构 |
| `apps/ps-uxp` | Photoshop panel、task stream、composer、settings page、UXP host integration | engine orchestration、provider semantics |
| `apps/web` | developer harness / debug surface | v1 正式产品承诺、独立业务方向 |

### 边界规则

- Engine 不接触 DOM、Browser API、UXP API、FS、network。
- Workflow 只存 declarative spec，不包含 embedded business logic。
- 所有 IO 都通过 adapter。
- Provider 可以解释参数，但 engine 不能。
- Host 只能消费 runtime facade，不能绕过它自己拼装 orchestration。

## V1 锁定决策

### Host 策略

- `apps/ps-uxp` 是唯一 required host。
- `apps/web` 保留，但只作为开发 harness 和调试镜像，不进入当前成功标准。

### 生命周期策略

- 合法状态只有 `created -> running -> completed | failed`。
- `cancellation_error` 只保留 taxonomy 位置，不进入 V1 行为。
- job history 只保存在内存里，reload 后丢失是预期行为。

### 输入与结果策略

- 第一阶段只要求单个主图输入。
- 结果的 V1 最小要求是在 task stream 中可见并可重试。
- Photoshop writeback、layer insertion、mask、selection-aware edits 都延后到后续阶段。

### Settings 策略

- settings 必须在 UXP 本地持久化。
- 第一步只做 host-local persistence，不做云同步。
- provider 配置结构共享，存储实现由 host adapter 决定。

## 分阶段计划

### Phase 0 — Shared Contract Foundation

当前状态：已完成

交付内容：

- workspace / package scaffolding
- shared types
- failure taxonomy
- invariant guards
- placeholder host apps

退出标准：

- 所有 package 可 build
- 共享契约可被下游 package import

### Phase 1 — Runtime Core

目标：让 shared runtime 真正“能跑起来”

交付内容：

- `packages/core-engine/src/store.ts`
- `packages/core-engine/src/events.ts`
- `packages/core-engine/src/registry.ts`
- `packages/core-engine/src/runner.ts`
- `packages/core-engine/src/runtime.ts`
- `submitJob` / `getJob` / `subscribe` / registry access 等最小 facade

退出标准：

- 可以提交一个最小 `JobRequest`
- engine 能完成 `created -> running -> completed|failed`
- host 只通过 facade 消费状态和事件

### Phase 2 — Provider And Workflow Baseline

目标：证明 runtime contract 对真实 provider 是可用的

交付内容：

- provider registry
- `mock provider`
- 一个真实 provider 集成
- 最小 workflow spec
- provider config schema 与 defaults 模型

退出标准：

- mock provider 跑通 end-to-end
- provider 切换不会污染 engine 层
- 一个真实 provider 能跑完整 happy path

### Phase 3 — UXP Host And Settings Flow

目标：做出 Photoshop-first 的最小可用产品壳

交付内容：

- UXP task stream shell
- composer：image attach、prompt、provider/model select、submit
- settings home + provider detail page
- provider config local persistence adapter
- asset adapter：本地文件输入优先，active layer/readback 留到后续

退出标准：

- 用户能在 UXP 里配置至少一个 provider
- 配置变化能立刻影响聊天页提交
- 用户能看到运行状态、成功结果、失败结果

### Phase 4 — Verification And Hardening

目标：把“可跑”变成“可维护”

交付内容：

- core-engine unit tests
- provider contract tests
- runtime integration tests
- UXP 手动 smoke checklist
- build / test / lint 的 CI 基线

退出标准：

- 关键共享边界有自动化测试
- UXP 最小闭环有稳定手动验证脚本
- 文档与代码状态重新对齐

## 当前正式验收标准

以下全部满足，才算当前 change 完成：

1. 用户能在 Photoshop UXP 插件里打开主面板。
2. 用户能在 settings 中配置至少一个 provider，并在下次打开插件后仍然可用。
3. 用户能上传单张主图并输入 prompt。
4. 用户能在当前任务里切换 provider / model。
5. 用户能提交任务，并看到结构化的状态变化。
6. 用户能在 task stream 中看到结果或结构化错误。
7. 所有共享层边界都没有 host API 泄漏。

## 修正后的测试方向

当前测试应围绕以下内容，而不是围绕超前功能：

- `core-engine`:
  - failure taxonomy
  - `assertSerializable`
  - `deepFreeze`
  - lifecycle state transitions
  - workflow binding resolution
- `providers`:
  - schema validation
  - mock provider invoke contract
  - real provider boundary transform
- `apps/ps-uxp`:
  - settings persistence smoke
  - job submit happy path
  - invalid config / provider error display

以下内容暂时不进入正式测试门槛：

- cancel / abandon
- queued jobs / eviction
- durable history recovery
- web route-level product flows

## 待决但不阻塞当前实现的问题

- 第一家真实 provider 选哪一个作为集成目标
- UXP 本地 secret 存储采用哪种具体实现
- 结果图的 Photoshop 写回是否在本 change 末尾作为 stretch goal 尝试

默认处理原则：

- 能不阻塞 runtime 主链路的，先不要放进当前 change gate。
- 能由 host adapter 吞掉差异的，不要反向拉回 engine。

## 文档维护规则

- 外部 restore / review 文档继续保留，但不再作为 repo 内 source of truth。
- 当 `DESIGN.md`、`TOKEN.md` 与实现计划冲突时：
  - 产品范围与阶段以本文件为准
  - 视觉语言与 token 以 `DESIGN.md` / `TOKEN.md` 为准
- 每次完成一个 phase，都要同步更新本文件中的 “当前仓库真实状态” 和 “退出标准”。
