# workflows 规范

- 状态：当前阶段规范
- 依据：根级 `AGENTS.md`、`docs/IMPLEMENTATION_PLAN.md`、本模块 `AGENTS.md`、`PRD.md`

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

包根入口已经存在，但当前源码导出仍为空。对本模块应保持两个认识：

- 文档确认的目标：导出最小 builtin workflow specs
- 当前代码现实：`src/index.ts` 仍是占位，尚未提供 builtin exports

## 暂定信息

- 最终 builtin workflow 的数量与命名
- `provider-generate`、`provider-edit` 等文件名是否会保留
- step shape 的最终字段细节

## 当前刻意省略

- `DAG.md`
- `VISUAL_EDITOR.md`
- `HOST_WRITEBACK.md`
- `CLI_COMMANDS.md`
- `FACADE_COMMANDS.md`
- `TESTING.md`

这些内容要么超出当前范围，要么属于别层。

