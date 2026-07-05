## Why

当前 `ModelConfigurationPage` 将 `outputMatrix.cells` 直接平铺为 checkbox 列表，用户看到的是底层矩阵组合，而不是可理解的模型能力维度。这使得“取消 `16:9`”或“取消 `PNG`”只能删除若干具体 cell，无法表达“对当前 operation 下所有兼容分辨率统一生效”的真实产品语义。

现在需要将该页面重构为面向能力维度的配置编辑器，在保持底层 `outputMatrix` 稀疏组合真实度的前提下，让用户以 `Output Format`、`Aspect Ratio`、`Resolution` 的方式配置模型能力，并在 `text_to_image` 与 `image_edit` 完全一致时合并为单一 UI。

## What Changes

- 将 `ModelConfigurationPage` 的 `outputMatrix cells` checkbox 列表替换为基于能力维度的编辑器，不再直接暴露 cell 级组合。
- 将配置维度固定为 `Output Format`、`Aspect Ratio`、`Resolution`，并使用更适合 UXP 面板宽度的控件形式：
  - `Output Format` 使用紧凑多选 chips。
  - `Aspect Ratio` 使用带比例轮廓的 selectable tile grid。
  - `Resolution` 使用紧凑有序多选 chips。
- 将页面按 `operation` 拆分为 `Text to Image` 与 `Edit Image` 两个 section；当两者支持集合语义完全一致时，只显示一套共享配置 UI，并在保存时同时写回两个 operation。
- 将用户交互语义改为“按维度过滤原始稀疏矩阵”，例如取消 `16:9` 会移除该 operation 下所有 `ratio === 16:9` 的原始 cells，而不是只移除某几个当前可见 cell。
- 明确禁止 UI 基于三个维度重新生成笛卡尔积；保存结果仍然必须是 official preset `outputMatrix` 的真实子集。
- 为无法精确映射到维度选择的 legacy cell 子集增加规范化提示；用户保存后统一收敛为新的维度过滤语义。
- 更新页面文案、摘要和说明文字，替换底层 `text_to_image · 1K · 16:9 · PNG` 样式字符串，改为用户友好的能力标签与统计摘要。

## Capabilities

### New Capabilities
- `model-config-output-capabilities`: 定义 `ModelConfigurationPage` 的能力维度编辑语义、operation 合并展示规则、稀疏矩阵过滤规则、legacy 子集规范化提示，以及用户可见的控件与文案结构。

### Modified Capabilities
- 无。

## Impact

- `apps/app/src/shared/ui/pages/model-configuration-page.tsx` 的编辑态 state、派生逻辑、保存逻辑和页面结构。
- `apps/app` 的 shared UI primitives、样式、i18n 文案，以及与 `ModelConfigurationPage` 相关的 app tests / fake tests。
- 可能新增 `apps/app` 侧纯 helper，用于 operation 归组、同构判定、维度选择与 matrix subset 互转。
- `packages/application` 与 `packages/providers` 的持久化 contract 可以继续复用现有 `outputMatrix` 子集 schema，但需要为新 UI 语义补充验证测试。
