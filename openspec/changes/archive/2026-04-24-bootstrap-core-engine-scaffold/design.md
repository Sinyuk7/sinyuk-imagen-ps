## Context

`packages/core-engine` 当前 `src/` 目录下仅存在空目录 `types/`，`src/index.ts` 尚未创建。模块既无入口文件，也缺少导出的 TypeScript 符号，导致外部包无法 import，且 `tsc` 编译可能因无输入而失败。`package.json` 中的 `clean` 脚本仍使用 `rm -rf dist`，在 win32 平台无法直接执行。

## Goals / Non-Goals

**Goals:**
- 创建 `src/index.ts`，提供最小桩导出，使模块可被 import 并通过 `tsc` 编译。
- 修正 `package.json` 的 `clean` 脚本，确保在 win32 平台可执行。

**Non-Goals:**
- 不引入任何运行时逻辑、类型定义、测试或文档修正。
- 不预设后续变更中 runner、store、event bus 等部件的接口形状。

## Decisions

- **最小桩导出而非空文件**：`src/index.ts` 至少导出一个占位常量/对象（如 `export const CORE_ENGINE_VERSION = '0.0.0'`），确保 TypeScript 编译器将其视为合法模块输入，而非空文件导致编译失败。
- **clean 脚本使用跨平台命令**：将 `rm -rf dist` 替换为 `rimraf dist`。`rimraf` 已在 monorepo root 的 devDependencies 中可用，且为 pnpm workspace 常见做法。

## Risks / Trade-offs

- **[Risk]** 桩导出在后续变更（如 `define-core-shared-types`）中会被完全替换，存在临时文件被误用的可能。
  - **Mitigation**：桩导出使用显式的占位命名（如 `__PLACEHOLDER__` 前缀），并在 STATUS.md 中标记为暂定；后续变更直接覆盖 `src/index.ts` 内容。
