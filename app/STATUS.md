# app 状态

- 状态：目录已收敛为单应用入口，但实现仍是占位
- 更新时间：2026-04-23

## 当前已确认存在

- `package.json`
- `AGENTS.md`
- `README.md`
- `SPEC.md`
- `STATUS.md`
- `src/index.tsx`
- `src/ui/app-shell.tsx`
- `src/host/create-plugin-host-shell.ts`
- `src/shared/plugin-app-model.ts`

## 当前已知偏差

- 旧文档和旧记忆仍可能保留 `ps-uxp` 或多应用口径
- 当前最小骨架 `ui / host / shared` 已经展开，但仍只是占位层，不代表复杂应用分层已经稳定

## 当前仍未稳定

- host / adapter / shared bridge 的最终边界
- 何时进入真正的 UI / writeback 实现阶段

## 测试文档处理

- 暂不创建 `TESTING.md`
- 原因：当前没有稳定、可重复、可长期维护的应用层测试流程
