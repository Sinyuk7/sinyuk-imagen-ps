# core-engine

`core-engine` 是共享 runtime 层。它负责 job lifecycle、workflow 执行、provider dispatch 边界和运行时状态管理，同时保持 host-agnostic。

## 先读哪里

- `SPEC.md`：当前阶段的本地规范
- `STATUS.md`：现状、偏差与不确定项
- `AGENTS.md`：模块级短规则
- `PRD.md`：设计输入，范围比现状更大

## 本模块负责什么

- 共享 runtime 类型与错误模型
- serializable / immutable 边界守卫
- in-memory job store 与 event bus
- workflow registry、runner、runtime 入口
- provider dispatch 的最小抽象边界

## 本模块不负责什么

- provider 参数语义与外部 API 映射
- UI、CLI、Photoshop host 逻辑
- 文件系统、网络或宿主 IO
- provider 配置持久化

## 当前文档集

- `README.md`：模块摘要
- `SPEC.md`：稳定意图与边界
- `STATUS.md`：实现状态与文档/代码偏差
- `AGENTS.md`：本地实现规则

当前不单独创建 `CONTRACTS.md` 或 `TESTING.md`。原因是跨模块 contract 仍由 `SPEC.md` 承载，测试实践也还未稳定到值得独立维护。

