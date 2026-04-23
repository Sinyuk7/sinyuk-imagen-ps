## Why

当前 `packages/core-engine` 模块的 `src/` 目录几乎为空，无入口文件，模块既无法被 import 也无法通过 `tsc` 编译。必须先建立最小可编译骨架与入口文件，后续的类型定义、状态基础设施、runner 等变更才能在此基础上叠加。

## What Changes

- 创建 `src/index.ts`：最小桩导出，使模块可被外部 import 并通过 TypeScript 编译。
- 修正 `package.json` clean 脚本：将 `rm -rf dist` 替换为跨平台兼容命令，确保在 win32 环境可执行。
- **Non-goals**：不引入任何运行时逻辑、类型定义、测试、文档修正（STATUS.md 的偏差已在本版本外预先修正）。

## Capabilities

### New Capabilities

> 本次变更为纯基础设施 bootstrap，不引入新的 spec-level capability。

### Modified Capabilities

> 无现有 spec 需要修改。

## Impact

- `packages/core-engine/src/index.ts`（新建）
- `packages/core-engine/package.json`（clean 脚本修正）
- 使 `packages/core-engine` 成为可编译、可 import 的合法 npm 包模块
