# core-engine 规范

- 状态：当前阶段规范
- 依据：根级 `AGENTS.md`、`docs/IMPLEMENTATION_PLAN.md`、本模块 `PRD.md`

## 模块目的

提供共享 runtime，使上层 surface 能以统一方式提交 job、查询状态、重试失败，并把 provider 调用与 workflow 执行保持在 host-agnostic 边界内。

## 稳定边界

- engine 只依赖抽象边界，不直接理解 provider 参数语义
- engine 不直接触碰 DOM、UXP、文件系统、网络或宿主 API
- workflow 是 declarative 输入，engine 负责执行顺序与状态流转
- job store 是状态真相，event bus 只做通知
- 失败必须以显式错误模型暴露，不允许 silent fallback

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

文档与代码共同确认的公开入口集中在 `src/index.ts`：

- 类型导出：runtime、workflow、provider、job、asset、error 相关类型
- 函数导出：`createJobEventBus`、`createJobStore`、`createWorkflowRegistry`、`dispatchProvider`、`runWorkflow`、`createRuntime`

这些名字已经存在，但仍属于早期接口；后续若调整，应先更新 `STATUS.md`。

## 暂定信息

- exact facade command shape
- 默认 workflow 的长期形态
- runtime 与 future facade / CLI 的最终装配位置
- 更细的测试矩阵和自动化策略
- `StepKind` 中的 `transform`、`io` 目前只应视为保留值，不能视为已支持能力

## 当前刻意省略

- `CONTRACTS.md`：本阶段 contract 仍集中写在本文件中
- `TESTING.md`：当前测试实践尚未稳定
- `RUNBOOK.md`：本模块没有独立运行面
