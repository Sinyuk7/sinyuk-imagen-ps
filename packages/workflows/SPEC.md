# workflows 规范

- 状态：当前阶段规范
- 依据：`src/builtins/`、`tests/`、本模块 `AGENTS.md`、`README.md`、`STATUS.md`、`PRD.md`

> 模块定位、builtin workflow 命名约定与职责边界的完整定义见 `PRD.md`。  
> 本文件聚焦于技术 shape 约束与当前阶段的公开面描述。

## 模块目的

提供最小 declarative workflow shape，让共享执行链路可以在不混入业务逻辑的前提下被 runtime 消费。

## 稳定边界

- workflow 是 pure data，不是执行器
- workflow 只表达 step 顺序、绑定关系和输出交接
- `workflows` 不承载 provider transport、host IO 或 runtime state
- 当前阶段只关注最小 builtin workflow，不做强编排系统

## 当前阶段应包含的内容

- builtin workflow specs
- step id、step kind、input binding、output key
- 可被 `core-engine` 直接消费的 workflow shape

## 当前阶段不包含的内容

- DAG、branch、loop、visual editor
- host writeback workflow
- inline transform logic
- runtime persistence 或 queue 语义

## 当前公开面

`src/index.ts` 已从 `src/builtins/` 导出最小 builtin workflow 集合：

- `providerGenerateWorkflow`（`provider-generate`）
- `providerEditWorkflow`（`provider-edit`）
- `builtinWorkflows`（只读集合，包含上述两项）

这些导出满足 `core-engine` 的 `Workflow` 类型约束，并已被 `createRuntime()` 与 `createWorkflowRegistry()` 直接消费。

当前稳定 contract：

- `providerGenerateWorkflow` 绑定 `provider` 与 `prompt`，并固定 `request.operation = generate`
- `providerEditWorkflow` 绑定 `provider`、`prompt` 与 `inputAssets`，并固定 `request.operation = edit`
- 两个 builtin workflow 的稳定 `outputKey` 都是 `image`

## 暂定信息

- 最终 builtin workflow 的数量与命名（当前仅两个）
- `maskAsset`、`output`、`providerOptions` 等字段是否提升为稳定 contract（当前为 tentative，未承诺 binding 或输出语义）
- step shape 的最终字段细节

## 当前刻意省略

- `DAG.md`
- `VISUAL_EDITOR.md`
- `HOST_WRITEBACK.md`
- `CLI_COMMANDS.md`
- `FACADE_COMMANDS.md`
- `TESTING.md`

这些内容要么超出当前范围，要么属于别层。
