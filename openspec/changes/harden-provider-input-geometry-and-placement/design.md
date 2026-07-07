## Context

当前共享 `resolveProviderInputPlan()` 位于 `apps/app/src/shared/image/resize.ts`，被 Photoshop `Capture` / `Layer` / local file、Chrome local file 等多条路径复用。它仍以“整数尺寸下保持 exact ratio”为优先目标，导致 `maxSide` 在 reducible ratio 下只被当作 bucket，在 coprime ratio 下甚至会退化为原尺寸 passthrough。与此同时，`exact-frame` placement 仍通过单一 ratio guard 同时判断 planner 整数量化误差与 provider 输出失配，混淆了 source geometry、planned target geometry 与 actual output geometry 三个不同阶段。

repo 当前 provider contract 已经把输出 geometry 作为独立能力表达：`image-endpoint` / `chat-image` / `gemini-generate-content` 都可以从 output selection 构造 `size`、`aspect_ratio`、`imageSize` 等字段。因此，本次不需要再依赖“先把输入图放大到 bucket，再间接影响 provider 输出”的隐式策略。

## Goals / Non-Goals

**Goals:**

- 将共享 provider input planner 固化为 `no-upscale`、`fit-inside`、hard `maxSide` ceiling 的几何 contract。
- 把 planner 结果压缩为确定的 `targetSize` 事实与 provenance-only `aspectRatioError`，移除旧的 bucket / multiple / scale 语义。
- 在 Photoshop host boundary 信任官方 `targetSize` contract，但对实际返回尺寸做 fail-closed 验证保险。
- 将 placement 判定改为基于 request/output contract 的离散 geometry 验证：`expectedOutputSize` 精确匹配优先，`allowedOutputSizes` / semantic identity 次之，未知 geometry 一律 `document-only`。
- 让 local file / capture / layer 是否 passthrough 或 normalize 的判断只依赖 source geometry 是否满足 policy。

**Non-Goals:**

- 不重写 preview pipeline、PNG encoder 或 transport byte estimator。
- 不引入通用 `allowUpscale` 开关，也不预先为所有 provider 暴露 minimum-input-size override。
- 不把 planner 的 `aspectRatioError` 重新解释为 provider 输出 tolerance budget。
- 不在本次变更中重做 provider catalog，只消费现有 output selection / geometry contract。

## Decisions

### 1. Shared planner 改为 hard-ceiling `fit-inside`，默认永不 upscale

共享 planner 只负责 `source pixels -> integer targetSize`。当 source long side 小于等于 `maxSide` 时，直接 passthrough；当 source 超过 `maxSide` 时，固定 long side 到 `maxSide`，对 short side 做最近整数取整，并保证 `targetWidth`、`targetHeight` 都不超过 source 与 `maxSide`。

保留 `aspectRatioError`，但仅作 provenance：

- 日志 / 调试
- regression 分析
- 判断是否发生整数尺寸量化

它不再参与任何消费方 tolerance 计算。进入 provider 输出阶段后，消费方只看 planner 产生的确定 `targetSize` 与 provider contract 产生的确定 geometry 事实。

选择理由：

- 共享 planner 的职责是几何归一化，不是近似搜索“最像 bucket 的 exact ratio 整数解”。
- `no-upscale` 能直接消除 `64x64 -> 2048x2048` 这类历史放大行为，避免在 host read、RGBA 内存与 stored-deflate `PNG` 上制造额外成本。
- 删除单一 `scale` 可避免 `scaleX !== scaleY` 时继续误导消费方。

备选方案：

- 继续修补 gcd + exact-ratio candidate 算法：不能从根本上保证 hard ceiling，也会继续把 ratio preservation 放在错误优先级。
- 暴露通用 `allowUpscale`：会让旧行为通过不同调用点重新回流，破坏共享 planner 的单一几何边界。

### 2. Photoshop host 信任 `targetSize` contract，但在边界后 fail-closed 验证

`imaging.getPixels()` 与 `imaging.getSelection()` 继续使用 planner 产出的精确 `targetSize`。host 适配层在拿到 `PhotoshopImageData` 后验证其实际宽高与请求的 `targetSize` 一致；若不一致，则立即 fail closed 并记录 requested vs actual telemetry。

该验证的语义是：

- 信任官方 `targetSize` contract；
- 把边界校验当作宿主适配层保险；
- 不将其表述成已知 Photoshop bug workaround。

选择理由：

- Adobe 官方文档明确把 `targetSize` 定义为 returned image scaling contract，并对 downscale + pyramid cache 给出性能说明。
- 适配层边界校验可以防止 host/runtime 变化、错误 source bounds 解释或未来回归 silently 污染后续 geometry contract。

备选方案：

- 完全不校验：实现更简单，但一旦边界事实漂移，后续 PNG encode、selection alpha 对齐、placement 判定都会在错误 geometry 上继续运行。
- 预先怀疑 host contract 并添加补偿逻辑：会把保险误写成 workaround，扩大本次范围。

### 3. Local file geometry 决策改为“先看 source 是否已满足 policy”

Chrome 与 UXP local file 路径不再依赖 `plan.wasDownscaled` / `plan.wasResized` 这类派生布尔值。正确顺序是：

1. 读取 source dimensions
2. 判断 source geometry 是否已在 policy 内
3. 若在 policy 内，允许 passthrough
4. 若不在 policy 内，则：
   - runtime 支持 normalize：resize 到 `plan.targetSize`
   - runtime 不支持 normalize：明确 reject

选择理由：

- 共享 planner 的输出是派生事实，不能反过来充当 source policy 判定真值。
- 该顺序能避免 planner contract 调整后，local file gate 继续沿用旧布尔字段导致放行超限文件。

备选方案：

- 继续复用旧 `wasDownscaled`：实现变动小，但会把旧 contract 残留继续传到新的 planner 语义上。

### 4. Placement 改为 output geometry contract 匹配，不再使用全局 ratio tolerance

placement 判定拆成三层事实：

1. `sourceFrame`：capture-time 几何
2. `inputPlan.targetSize`：planner 明确产生的 quantized input geometry
3. `expectedOutputSize` / `allowedOutputSizes` / semantic identity：provider request contract 明确产生的 output geometry expectation

规则如下：

- 若 provider contract 能给出 `expectedOutputSize`，则 `actualOutputSize` 必须精确匹配；匹配则 `exact-frame`，不匹配则 `document-only`。
- 若 provider contract 只能给出 `allowedOutputSizes` 或离散 geometry identity，则 `actualOutputSize` 必须属于允许集合，且与当前 request 的 semantic identity 一致；否则 `document-only`。
- 若 provider output geometry 未知、不可验证，或返回值落在集合外，则保守 `document-only`。
- planner 的 `aspectRatioError` 不参与 placement tolerance 预算；它已经沉淀为 `inputPlan.targetSize` 这个确定事实。

选择理由：

- `exact-frame` 真正需要的是“输出几何仍可安全映射回 capture frame”，而不是“输出比例与 source frame 再次通过固定阈值接近”。
- 单一 `0.0005` 无法同时覆盖 planner 量化、provider discrete size alignment 与 provider semantic mismatch。

备选方案：

- 保留全局 ratio guard：会继续把三个坐标空间压成一次比较，无法区分正常量化与真实 provider 漂移。
- 把 planner `aspectRatioError` 直接加到 provider tolerance 上：会把 provenance 误当成可消费预算，放大错误输出的可接受范围。

### 5. Provider-specific upscale 只能是 future strategy，不属于 shared planner

若未来某个 provider 被官方文档或真实测试证明存在 minimum input size requirement，本仓库可以在 provider request strategy 增加独立 preprocess，但前提必须是：

- 有明确 provider-scoped 证据；
- 不修改 shared planner 默认语义；
- 不让其他消费路径重新获得通用 `allowUpscale` 开关。

选择理由：

- shared planner 是 repo-wide geometry boundary；provider-specific exception 应只存在于 strategy layer。

## Risks / Trade-offs

- [小图不再被放大，部分 provider 默认输出可能随输入变小] → 通过现有 output selection / provider request builder 显式请求输出 geometry，不再依赖输入 inflation。
- [更多 unknown output geometry 会降级 `document-only`] → 保守策略优先；后续若 provider contract 补强，可单独扩充 `expectedOutputSize` / `allowedOutputSizes`。
- [host boundary fail-closed 可能暴露以前被吞掉的 geometry 漂移] → 记录 requested vs actual telemetry，并把失败局限在 host adapter boundary。
- [删除旧 planner 字段会带来广泛测试/调用点变更] → 一次性替换为 `kind + sourceSize + targetSize + aspectRatioError`，避免双轨 contract 长期并存。

## Migration Plan

1. 先替换 shared planner contract 与 invariants，更新对应 unit tests。
2. 再更新 Photoshop host 与 Chrome local file 消费路径，移除旧布尔字段依赖。
3. 再重写 placement geometry 判定与 `exact-frame` / `document-only` fallback tests。
4. 最后收敛 telemetry 字段与 docs，确保 `aspectRatioError` 只保留 provenance 语义。

本次为 current-state repo 变更，不需要数据迁移或兼容旧持久化 schema。若实现中发现任何 provider catalog 缺少输出 geometry contract，则按保守 `document-only` 落地，不阻塞 shared planner 重构。

## Open Questions

- 当前没有 blocking open question。
- 后续若某个 provider 需要 minimum input size 或离散 output size 集合扩展，应以独立 provider strategy change 处理，不回写 shared planner contract。
