## 1. 重构 shared planner contract

- [x] 1.1 重写 `apps/app/src/shared/image/resize.ts` 中的 `resolveProviderInputPlan()`，改为 `no-upscale` 的整数 `fit-inside` hard ceiling 逻辑。
- [x] 1.2 收缩 `ProviderInputPlan` 类型，只保留 `kind`、`sourceSize`、`targetSize` 与 provenance-only `aspectRatioError`，删除旧的 bucket / multiple / scale / resize-state 字段。
- [x] 1.3 补充 shared planner unit tests，锁定 `64x64 -> 64x64`、`10000x6000 -> 2048x1229`、`4096x4095 -> 2048x2048`、`4096x1537 -> 2048x769`，并断言 hard ceiling 与 no-upscale invariants。

## 2. 更新 provider-input 消费路径

- [x] 2.1 更新 `apps/app/src/adapters/uxp/photoshop-host-bridge.ts` 的 capture / layer / local file 路径，改用新的 `sourceSize` / `targetSize` contract，并移除对旧 planner 布尔字段的依赖。
- [x] 2.2 在 Photoshop host 适配层对 `imaging.getPixels()` 与 `imaging.getSelection()` 的实际返回尺寸增加 fail-closed 校验与 diagnostics 记录。
- [x] 2.3 更新 `apps/app/src/adapters/chrome/chrome-host-port.ts` 的 local file gate，改为先判定 source geometry 是否满足 policy，再决定 passthrough、normalize 或 reject。

## 3. 重写 placement geometry 判定

- [x] 3.1 在 placement 相关 domain / host write 路径中移除“planner 误差 + provider 输出误差共用固定 ratio tolerance”的判断。
- [x] 3.2 实现新的 placement 判定顺序：`expectedOutputSize` 精确匹配优先，`allowedOutputSizes` / semantic identity 次之，未知或集合外输出一律 `document-only`。
- [x] 3.3 更新 `exact-frame` 写回前的 geometry guard，使 planner 量化 provenance 不再被解释为 provider 输出 tolerance budget。

## 4. 收敛 tests 与文档

- [x] 4.1 更新 `apps/app/tests/adapters/uxp/photoshop-host-bridge.read.contract.test.ts`、`provider-input-placement.contract.test.ts`、`photoshop-host-bridge.write.contract.test.ts`，覆盖小图不再 upscale、host boundary verify、`exact-frame` / `document-only` fallback 新语义。
- [x] 4.2 更新任何仍依赖旧 planner 字段或 “bucket target / exact source ratio” 语义的测试、fake 与 helper。
- [x] 4.3 将稳定结论写回 `docs/ENGINEERING_CONTEXT.md` 或对应 module 文档，明确 shared planner、Photoshop host verify 与 placement geometry 的新 contract。
