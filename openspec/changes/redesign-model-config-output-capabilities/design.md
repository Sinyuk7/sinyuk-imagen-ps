## Context

当前 `ModelConfigurationPage` 的编辑器把 `OfficialModelPreset.outputMatrix[].cells` 直接展平成 checkbox 列表，并以 `operation · imageSize · ratio · outputFormat` 的底层字符串作为标签。该实现虽然没有改变 `packages/application` / `packages/providers` 的持久化 contract，但把稀疏矩阵的内部表示直接暴露给用户，导致 UI 语义与用户心智严重错位。

本次改造的关键约束有三条：

- `packages/providers` 与 `packages/application` 继续拥有真实 `outputMatrix` 子集 contract，`apps/app` 不能重新定义持久化 schema。
- UI 必须按能力维度编辑，但保存时只能从 official preset 的原始 sparse matrix 里过滤，不得重新生成笛卡尔积。
- `text_to_image` 与 `image_edit` 可能拥有完全相同的能力集合；在这种情况下，页面必须合并为单一配置视图，而不是重复显示两块内容。

用户给出的交互方向已经明确：

- `Output Format` 用紧凑多选 chips。
- `Aspect Ratio` 用带比例轮廓的 tile grid。
- `Resolution` 用紧凑多选 chips。
- section label 在选项上方，支持自动换行。
- 同构 operation 合并显示；非同构 operation 显示两个纵向 section。

## Goals / Non-Goals

**Goals:**

- 用能力维度替换 cell 列表，使 `Output Format`、`Aspect Ratio`、`Resolution` 成为用户唯一直接编辑的模型能力入口。
- 保持底层 `outputMatrix` 稀疏子集语义不变，保存结果继续由 official preset 过滤得出。
- 在 `text_to_image` 与 `image_edit` 完全一致时只显示一个共享 section，并在保存时同时写回两个 operation。
- 在两个 operation 不一致时显示两个轻量 section，且字段顺序、排序和文案保持一致，便于比较。
- 为 legacy 非规则 cell 子集提供规范化提示，避免用户误以为页面仍支持按单个组合做洞状裁剪。
- 将控件形态、文案、摘要与帮助信息统一为专业创意工具风格，而不是底层调试视图。

**Non-Goals:**

- 不修改 `SaveUserModelConfigInput` / `UserModelConfig` 的持久化 shape；保存结果仍然是 `outputMatrix` 子集。
- 不让用户新增 official preset 未声明的任意组合、格式、比例或分辨率。
- 不将 `Auto`、`Source` 改造成“全选”或批量操作入口。
- 不在本次变更中引入基于 popover/listbox 的高级多选管理 UI。
- 不实现完整的 legacy cell-level 编辑模式；legacy 仅提示并在保存时收敛为新语义。

## Decisions

### Decision: 页面 state 从 `selectedCellIds` 改为按 operation 的维度选择

当前实现用 `selectedCellIds` 作为唯一编辑状态，并在保存时通过 `subsetMatrix()` 直接按 cell 过滤。新设计改为为每个可见 module 保存三组集合：

```text
selectedOutputFormats
selectedRatios
selectedImageSizes
```

其中 module 可能是单个 operation，也可能是“shared” module。

原因：这是把“用户编辑维度”与“持久化矩阵”解耦的最小改法。UI state 对应用户心智，save 阶段再映射回官方 sparse matrix 子集。

替代方案：继续保存 `selectedCellIds`，但在 UI 上伪装成维度选择。放弃该方案，因为无法自然表达“去掉 `16:9` 对当前 operation 的所有兼容 cell 统一生效”。

### Decision: 保存时只过滤原始 sparse matrix，不重建组合

保存逻辑对每个 `ImageOutputMatrix` 执行：

```text
keep cell
  when cell.outputFormat in selectedOutputFormats
   and cell.ratio in selectedRatios
   and cell.imageSize in selectedImageSizes
```

随后将保留下来的 cells 传回现有 `outputMatrix` 子集 schema。

原因：这保留了 provider 真实支持的稀疏组合，避免从三个维度重新构造不存在的组合。

替代方案：用 `selectedFormats × selectedRatios × selectedResolutions` 生成新 cells。放弃该方案，因为它会凭空制造 provider 未声明的组合，与 `packages/application` 当前 `validateMatrixSubset()` 的官方子集约束冲突。

### Decision: operation 合并判定按“语义同构”而不是 `cell.id` 相等

当 `text_to_image` 与 `image_edit` 的下列属性完全一致时，视为同构：

- `imageSizes` 的 `id` 和顺序一致。
- `ratios` 的 `id` 和顺序一致。
- `outputFormats` 的 `id` 和顺序一致。
- cells 的 `(imageSize, ratio, outputFormat)` 三元组集合一致。
- `defaultCellId` 所对应的三元组一致。

这时页面只显示一个共享 section，标题区域用低调 badge 表示同时适用于 `Text to Image` 与 `Edit Image`，保存时将同一组维度过滤规则分别应用到两个原始 matrix。

原因：`cell.id` 是稳定标识，但不应决定 UI 是否合并。只要两组能力对用户而言等价，就不需要重复展示。

替代方案：仅当两个 matrix 的 JSON 完全相等时合并。放弃该方案，因为这会把对用户无意义的内部 id 差异放大成重复 UI。

### Decision: 共享 section 与分离 section 使用同一字段顺序和排序策略

无论是共享 section 还是分离 section，字段顺序固定为：

```text
Output Format
Aspect Ratio
Resolution
```

排序规则：

- `Output Format` 使用 preset option 原始顺序。
- `Resolution` 使用 preset option 原始顺序。
- `Aspect Ratio` 在保持 official preset 约束的前提下，优先使用产品排序：`Auto / Source`，再从最宽到最高排序。

原因：保持 section 间的视觉可比性，降低学习成本。

替代方案：在不同 operation 下各自动态排序。放弃该方案，因为它会让同一个 ratio 在两个 section 中位置漂移，增加比较成本。

### Decision: legacy 非规则子集只做检测与规范化提示

旧配置可能包含“洞状”子集，例如仅禁用某个 resolution 下的 `16:9`，但保留另一个 resolution 下的 `16:9`。这种子集无法被三组维度选择精确表达。

页面加载时应检测当前 `UserModelConfig.outputMatrix` 是否能被压缩为维度选择：

- 如果可以，直接进入新编辑器。
- 如果不可以，显示规范化提示，说明保存后会收敛为共享 `format/ratio/resolution` 规则。

原因：当前 repo 是 current-state，但现有 repository 中仍可能已经存在旧 cell-level 子集。页面必须诚实说明信息损失，而不是默默改写。

替代方案：直接拒绝编辑 legacy 配置。放弃该方案，因为会让现有配置无法通过 UI 修订。

### Decision: 新 UI 控件保持轻量，不引入默认隐藏的 dropdown

字段控件采用：

- `Output Format`: detached multi-select chips
- `Aspect Ratio`: selectable tile grid，`Auto` / `Source` 作为 text chip 独立排列
- `Resolution`: ordered chips

两个 operation 不一致时，使用两个轻量 section，不使用 tabs，不使用双栏布局。

原因：用户需要同时理解“允许集合”和“两个 operation 的差异”。tabs 和 dropdown 都会隐藏关键信息。

替代方案：继续使用 checkbox list 或 multi-select dropdown。放弃该方案，因为都无法提供整体能力概览，也与当前创意工具心智不匹配。

## Risks / Trade-offs

- [Risk] legacy 洞状子集在新 UI 中会丢失局部差异。→ Mitigation：进入编辑页时显式提示“保存会规范化”，并为该检测补测试。
- [Risk] shared-section 合并判定写错会导致不该合并的 operation 被误合并。→ Mitigation：将同构判定抽成纯函数，并为“同构 / 非同构 / default 不同”的边界补单测。
- [Risk] `Aspect Ratio` tile grid 在窄面板下可能过度拥挤。→ Mitigation：固定为可换行 grid，保持 label 在上、tile 自换行，不依赖单行布局。
- [Risk] 维度选择看起来像“所有组合都可互相搭配”。→ Mitigation：底部显示有效组合数与说明文案，明确“部分值并非任意互相组合”。
- [Risk] 页面状态和保存逻辑脱节，导致 UI 选中和实际 `outputMatrix` 子集不一致。→ Mitigation：把“state -> subset”和“subset -> state”都做成纯 helper，并在 app tests 中做 round-trip 断言。

## Migration Plan

- 不需要跨包数据迁移；repository 中仍保存现有 `outputMatrix` 子集。
- 页面加载时增加 legacy 检测与规范化提示，作为 UI 语义升级路径。
- 一旦用户保存，配置将被重写为新的维度过滤结果；这是页面内的语义收敛，不是 schema migration。

## Open Questions

- `Aspect Ratio` 的最终可视图形是否完全由本地静态样式绘制，还是抽成共享 ratio-icon primitive；实现期可根据 `apps/app` 现有 primitive 复用情况再定。
- 是否在 section 底部默认显示 “`N valid output combinations`” 摘要，还是仅在存在稀疏不完全组合时显示；本 change 建议默认显示，避免误导用户认为三维度完全笛卡尔积可组合。
