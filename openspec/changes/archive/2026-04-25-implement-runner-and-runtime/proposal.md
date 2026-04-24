## Why

所有基础部件（store、events、registry、dispatch）均已就位，但 engine 仍缺少核心执行链路。runner 负责把 workflow spec 的顺序 step 翻译为可执行调用，runtime 负责把这些部件组装成统一入口。没有 runner 和 runtime，上层 surface 无法真正提交并执行 workflow。

## What Changes

- 新增 `src/runner.ts`：实现 `provider` step 的顺序执行，包括 input binding 与 output handoff
- 新增 `src/runtime.ts`：实现 `createRuntime()`，组装 store、events、registry、dispatch、runner
- 更新 `src/index.ts`：追加 `runner.ts` 与 `runtime.ts` 的公开导出
- `transform` / `io` step 仍视为保留值，不引入执行逻辑

## Capabilities

### New Capabilities
- `workflow-runner`: 顺序执行 workflow step，支持 input binding 与 output handoff
- `runtime-assembly`: 把 store、events、registry、dispatch、runner 组装为统一 `createRuntime()` 入口

### Modified Capabilities
- （无现有 spec 需要修改）

## Impact

- `packages/core-engine`：新增 `src/runner.ts`、`src/runtime.ts`，更新 `src/index.ts`
- 公开 API：新增 `runWorkflow`、`createRuntime` 导出
- 依赖：依赖已完成的 store、events、registry、dispatch 模块，不引入新外部依赖
