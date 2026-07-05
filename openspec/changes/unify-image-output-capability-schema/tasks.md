## 1. Capability schema foundations

- [ ] 1.1 在 `packages/providers` 设计并落地新的 image output capability contract，明确拆分 `Capability`、推荐 preset、`Selection` 与 builder 边界。
- [ ] 1.2 实现 `GeometryCapability` discriminated union，首轮仅覆盖 `flexible-pixels`、`ratio-resolution`。
- [ ] 1.3 为 edit input capability 落地最小事实字段：`inputFormats`、`maxImages`、`maxBytesPerImage`、`mask`，其中 `mask` 至少可表达 `target`、`formats`、`maxBytes`、`requiresSameDimensions`，并删除或废弃旧 `inputFidelityPolicy` 一类混合行为字段。
- [ ] 1.4 为 `gpt-image-2`、Gemini 各自建立新的 capability truth 数据，并以它们验证 `flexible-pixels` 与 `ratio-resolution` 两种 geometry kind。
- [ ] 1.5 在 capability 中定义 provider-owned 推荐 preset 数据，明确推荐项不是能力真相全集，并约定最终 label / hint / 排序归 `apps/app`。

## 2. Selection and builder refactor

- [ ] 2.1 在 `packages/application` 与 `packages/providers` 之间定义 canonical output selection contract，首轮支持 `provider-default`、`pixels`、`ratio-resolution`、`input-derived.exact-size`，并显式包含 `outputFormat`。
- [ ] 2.2 区分 `storedSelection` 与 `effectiveSelection`，定义 operation normalization 为非破坏性 runtime projection，不得静默覆盖已保存 preference；visible `Auto` 仅是 UI 投影，不得回写销毁 `Use Input Size` 偏好。
- [ ] 2.3 落地 `Use Input Size` / `exact-size` 在 `image_edit` 下的 selection 表达，并定义它在 `text_to_image` 下归一为 `provider-default` 的解析规则。
- [ ] 2.4 将 provider request builder 重构为消费 `Selection + normalized input context`，而不是消费 catalog 里的 `requestOutput` 模板。
- [ ] 2.5 在 input normalization / asset metadata 链路中产出统一的 normalized input geometry context，供上传与 `Use Input Size` 共用，并明确多图时 `primary edit input = first input`，禁止建立第二条并行 output size 派生链路。
- [ ] 2.6 为 GPT builder 实现“消费 normalized input geometry 并解析 exact pixel size”的路径，并补合法性校验 failure。
- [ ] 2.7 明确 exact-size resolver 只校验 normalized input geometry，不得为满足输出约束而静默 round、crop 或 resize。
- [ ] 2.8 为 Gemini builder 实现“保留 native ratio-resolution selection 并直接映射 provider 字段”的路径。
- [ ] 2.9 删除或旁路旧的 matrix-as-truth `requestOutput` 依赖与相关推导路径，确保 builder 对无法解析的 selection fail closed。

## 3. Shared controller and UI archetypes

- [ ] 3.1 重构 shared generation settings controller / hook，使其输出 capability-driven UI archetype data，而不是固定 `imageSize / ratio / outputFormat` matrix DTO。
- [ ] 3.2 在 MainPage 按 geometry kind 渲染固定 archetype：`Size + Format`、`Size + Aspect Ratio + Format`。
- [ ] 3.3 在 `GlobalGenerationSettingsPage` 复用同一 archetype 渲染规则，并与 MainPage 保持同一 selection/save 路径。
- [ ] 3.4 将 `Use Input Size` 并入 `Output Size` 组选项并固定排第一；在 `text_to_image` 下隐藏该项并显示归一后的 `Auto`。
- [ ] 3.5 为 GPT / Gemini 两类 archetype 补齐文案、secondary hint、排序与空态/validation 行为，并在 input 设置处明确 `Use Input Size` 使用 normalized input size；多图时提示基于第一张输入图。

## 4. User model output exposure

- [ ] 4.1 将 `UserModelConfig` 从“matrix subset”语义迁移为“产品暴露入口限制”语义。
- [ ] 4.2 重写 `ModelConfigurationPage`，按 output UI archetype 渲染共享输出配置，而不是固定 `Output Format / Aspect Ratio / Resolution` 维度编辑器。
- [ ] 4.3 在 `ModelConfigurationPage` 中将 `Use Input Size` 作为 `Output Size` 的 edit-only 首位项处理，而不是拆出第二套 operation section。
- [ ] 4.4 为 `flexible-pixels` 模型实现“限制推荐 preset 与 `Use Input Size` 暴露”的配置能力。
- [ ] 4.5 为 `ratio-resolution` 模型实现维度级 exposure 限制：分别限制 `aspectRatio`、`resolution`、`outputFormat`，首轮不支持组合级 exception。

## 5. Old change convergence

- [ ] 5.1 在 `model-output-matrix-generation-settings` change 中补简短 superseded note，标记其 matrix-as-truth 方向被新 change 替代。
- [ ] 5.2 在 `redesign-model-config-output-capabilities` change 中补简短 superseded note，标记其固定三维 capability editor 方向被新 change 替代。
- [ ] 5.3 清理实现中已经引入的旧假设命名、测试描述与 fake data，避免继续围绕 fixed matrix 扩展。

## 6. Validation

- [ ] 6.1 为 `packages/providers` 增加 capability truth、selection resolution、builder 映射、非法 selection fail-closed 测试。
- [ ] 6.2 为 `packages/application` 增加 canonical selection save/load、operation normalization、context-aware resolution 测试。
- [ ] 6.3 为 `apps/app` 增加 UI archetype 渲染、`Use Input Size` 显隐与 `text_to_image -> auto` 归一化测试。
- [ ] 6.4 为 `ModelConfigurationPage` 增加 exposure-based 编辑测试，覆盖 GPT shared config、Gemini archetype、`Use Input Size` 单项限制。
- [ ] 6.5 运行 per-slice validation：`pnpm --filter @imagen-ps/providers test`、`pnpm --filter @imagen-ps/application test`、`pnpm --filter @imagen-ps/app test`。
- [ ] 6.6 运行 final validation：`pnpm validate`。
