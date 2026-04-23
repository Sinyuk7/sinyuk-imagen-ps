## 1. Bootstrap Module Entry

- [x] 1.1 在 `packages/core-engine/src/index.ts` 创建最小桩导出，确保模块可被 import 且 `tsc` 编译通过。
- [x] 1.2 验证 `packages/core-engine` 可通过 `tsc --noEmit` 编译（无类型错误、无输入文件缺失）。

## 2. Fix Cross-Platform Build Script

- [x] 2.1 将 `packages/core-engine/package.json` 中的 `clean` 脚本由 `rm -rf dist` 修正为跨平台兼容命令（如 `rimraf dist`）。
- [x] 2.2 在 win32 环境下执行 `pnpm run clean`，确认 `dist/` 目录被正确清除且无报错。
