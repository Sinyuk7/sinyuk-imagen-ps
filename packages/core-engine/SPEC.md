# core-engine 规范

- 状态：当前阶段规范
- 依据：根级 `AGENTS.md`、`docs/IMPLEMENTATION_PLAN.md`

## 模块目的

提供共享 runtime，使上层 surface 能以统一方式提交 job、查询状态、重试失败，并把 provider 调用与 workflow 执行保持在 host-agnostic 边界内。

## 稳定边界

- engine 只依赖抽象边界，不直接理解 provider 参数语义
- engine 不直接触碰 DOM、UXP、文件系统、网络或宿主 API
- workflow 是 declarative 输入，engine 负责执行顺序与状态流转
- job store 是状态真相，event bus 只做通知
- 失败必须以显式错误模型暴露，不允许 silent fallback
- workflow input binding（`${key}` 完全匹配字符串）由 runner 在解析时即时校验：
  - key 命中 context 时按原始类型替换；
  - key 未命中时立即抛出 `JobError`（`category: 'workflow'`），不延后到 provider 校验阶段；
  - 字符串中"部分包含" `${...}` 子串属于字面量保留，不参与解析也不报错（允许 provider 自身模板穿透）。
- dispatch 边界对 provider result 的 immutability / serializability 承诺不覆盖 `ArrayBuffer.isView`（typed array、DataView）的 buffer 内容；调用方如需保护原始 buffer，应在 provider 内部完成拷贝。
- `assertSerializable` 对对象属性中的 `undefined` 按 `JSON.stringify` 语义忽略，对顶层值与数组元素中的 `undefined` 仍视为非法。
- **Runtime 装配位置**（关闭原"暂定信息"决策）：`createRuntime(options?) => Runtime`
  签名为稳定面；core-engine 不引入额外的 facade 抽象。任何 surface（app、CLI、
  host bridge）都应由各自的 shared/ 层持有**唯一** `Runtime` 实例（参见
  `app/docs/CODE_CONVENTIONS.md`：UI 不得直接 `createRuntime`），并通过 commands /
  share_command 暴露给上层；如出现多 surface，再在 core-engine 之上独立抽 facade，
  不修改本签名。
- **默认 workflow 的稳定形态**（关闭原"暂定信息"决策）：`@imagen-ps/workflows` 的
  `providerGenerateWorkflow` / `providerEditWorkflow` 的 v1 input contract 与
  output key 已视为稳定面。扩展字段（`output.count` / `maskAsset` /
  `providerOptions` 等）必须通过新版本 workflow 引入，不破坏 v1 字段。runner 与
  registry 的初始化方式无需为此调整；engine 仍只承担"按声明执行"，workflow
  shape 决策权归 `@imagen-ps/workflows`。

## 当前阶段应包含的能力

- 共享类型：job、workflow、provider、asset、runtime、error
- 边界守卫：serializable、immutable
- lifecycle：`created`、`running`、`completed`、`failed`
- 运行时部件：store、events、registry、dispatch、runner、runtime
- workflow 执行当前只确认 `provider` step 的执行路径

## 当前阶段不包含的能力

- UI state 或 CLI 参数解析
- provider config 持久化
- cancel、queue、durable history、background recovery
- provider-specific transform 或 host writeback

## 当前公开面

实际公开面集中在 `src/index.ts`，所有目标接口已实现并通过测试。

- 类型导出：`Job`、`JobStatus`、`JobInput`、`JobOutput`、`JobStore`、`Workflow`、`Step`、`StepKind`、`ProviderRef`、`ProviderDispatchAdapter`、`ProviderDispatcher`、`Asset`、`AssetType`、`JobEvent`、`JobEventType`、`JobEventBus`、`Unsubscribe`、`ErrorCategory`、`JobError`、`Runtime`、`RuntimeOptions`、`RunnerDeps`
- 函数导出：`createJobEventBus`、`createJobStore`、`createWorkflowRegistry`、`createProviderDispatcher`、`dispatchProvider`、`executeWorkflow`、`runWorkflow`、`createRuntime`

当前实际导出除目标接口外，还额外暴露了 `executeWorkflow` 与 `RunnerDeps`、`Runtime`、`RuntimeOptions` 类型，为手动装配场景提供灵活性。如后续需要收敛公开面，应另起 change 处理。

## 暂定信息

- exact facade command shape（计划由 share_command PRD/SPEC/TASK 收敛）
- 更细的测试矩阵和自动化策略（已显式延后到 share_command 落地后的加固阶段）
- `StepKind` 中的 `transform`、`io` 目前只应视为保留值，不能视为已支持能力
- 与 `providers`、`workflows` 的真实集成程度尚未验证（同上，归入加固阶段）

## 当前刻意省略

- `CONTRACTS.md`：本阶段 contract 仍集中写在本文件中
- `TESTING.md`：当前测试实践尚未稳定
- `RUNBOOK.md`：本模块没有独立运行面
