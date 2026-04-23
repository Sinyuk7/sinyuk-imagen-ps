# workflows 状态

- 状态：文档意图清楚，代码仍接近占位
- 更新时间：2026-04-23

## 当前已确认存在

- `package.json`
- `PRD.md`
- `AGENTS.md`
- `src/index.ts`

## 当前已知偏差

- 文档要求导出最小 builtin workflow specs，但 `src/index.ts` 当前没有任何导出
- 文档建议存在 `builtins/` 与 builtin 文件，源码目前只有单个入口文件
- 文档列出了 workflow 相关测试重点，仓库内目前没有对应测试文件

## 当前仍未稳定

- 最小 builtin workflow 应该覆盖几个场景
- step 字段的最终 shape
- 是否需要在本包中长期保留额外类型空间

## 测试文档处理

- 暂不创建 `TESTING.md`
- 原因：当前没有稳定、可重复的 workflow 测试实践

## 当前刻意省略

- `DESIGN.md`
- `TOKEN.md`
- `UI_MAIN_PAGE.md`
- `RUNBOOK.md`
- `examples/`

这些都不是 `workflows` 层当前需要承担的文档。

