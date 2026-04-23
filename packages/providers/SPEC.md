# providers 规范

- 状态：当前阶段规范
- 依据：根级 `AGENTS.md`、`docs/IMPLEMENTATION_PLAN.md`、本模块 `AGENTS.md`、`PRD.md`

## 模块目的

隔离 provider-specific 语义，避免 `core-engine` 直接理解外部 API 的参数、错误和返回格式。

## 稳定边界

- provider 负责 config / request 校验、请求构造、外部调用、响应归一化、错误映射
- runtime 不拥有 provider 参数语义
- provider 不拥有 job lifecycle、store 或 facade 命令面
- 当前阶段只围绕 `mock provider` 与 `openai-compatible` baseline 写规范

## 当前阶段应包含的内容

- provider descriptor / capabilities
- config validation
- request validation
- invoke result normalization
- provider registry 的 `list` / `get`
- transport 层的有限 retry 与 error mapping

## 当前阶段不包含的内容

- Gemini native、xAI native、ComfyUI、async polling family
- auto-discovery、plugin loading
- settings persistence、secret storage
- UI-facing provider 文档或 model matrix

## 当前公开面

包级入口已经存在，但当前源码导出仍为空。现阶段应把“预期公开面”和“实际公开面”分开看：

- 预期公开面：provider descriptor、config validation、request validation、invoke、registry `list / get`
- 实际公开面：`src/index.ts` 目前仍是占位

## 暂定信息

- 第一个真实 provider 的具体实例
- `openai-compatible` 是否长期维持为唯一 family
- 更细的 transport / diagnostics shape
- future facade 的放置位置

## 当前刻意省略

- `CONTRACTS.md`：本阶段 contract 仍集中在本文件中
- `TESTING.md`：测试体系还未稳定
- `RUNBOOK.md`：模块尚无独立运行面
- `examples/`：当前 prose 已足够指导，不需要示例先行

