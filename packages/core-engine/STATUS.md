# core-engine 状态

- 状态：部分实现已存在，但接口与职责仍处于早期收敛阶段
- 更新时间：2026-04-23

## 当前已确认存在

- `src/types/*`
- `src/errors.ts`
- `src/invariants.ts`
- `src/store.ts`
- `src/events.ts`
- `src/registry.ts`
- `src/dispatch.ts`
- `src/runner.ts`
- `src/runtime.ts`
- `src/index.ts`

## 当前已知偏差

- 旧 `AGENTS.md` 仍把 `store.ts`、`runner.ts`、`dispatch.ts` 等写成“待创建”，但这些文件已经存在
- 根级 `MEMORY.md` 与 `docs/IMPLEMENTATION_PLAN.md` 仍把部分 runtime 能力描述为下一步工作，和当前代码状态不完全同步
- 共享类型里仍暴露 `transform`、`io` 相关 step 空间，但当前 runner 只实际执行 `provider` step
- 这表示“文件已出现”不等于“能力已被文档确认稳定”，后续判断仍以本地 `SPEC.md` 为准

## 当前仍未稳定

- 与 `providers`、`workflows` 的真实集成程度
- future facade / CLI 的装配边界
- 测试覆盖是否足以支撑接口稳定

## 测试文档处理

- 暂不创建 `TESTING.md`
- 原因：当前没有稳定、可重复、值得长期维护的测试流程文档

## 后续文档重点

- 一旦 runtime 与 facade 的命令面稳定，再考虑拆分独立 contract 文档
- 只有出现稳定测试实践后，再新增 `TESTING.md`
