# providers 状态

- 状态：文档意图清楚，代码仍接近占位
- 更新时间：2026-04-23

## 当前已确认存在

- `package.json`
- `PRD.md`
- `AGENTS.md`
- `src/index.ts`

## 当前已知偏差

- 文档多次提到 contract、registry、mock provider、`openai-compatible` provider、transport helper，但源码目前只有 `src/index.ts`
- `package.json` 已暴露包根入口，`src/index.ts` 当前却没有任何实际导出
- `PRD.md` 中提到的依赖与版本基线尚未体现在当前 `package.json`

## 当前仍未稳定

- 首个真实 provider 的选择
- 真实公开 contract 的字段与 shape
- transport retry 与 diagnostics 的最终边界
- 与 future facade / adapter 的装配方式

## 测试文档处理

- 暂不创建 `TESTING.md`
- 原因：当前没有稳定、可重复的 provider 测试实践

## 当前刻意省略

- `GEMINI_NATIVE.md`
- `XAI_NATIVE.md`
- `COMFYUI.md`
- `AUTO_DISCOVERY.md`
- `MODEL_MATRIX.md`

这些内容都超出当前阶段，写出来只会放大规划噪音。

