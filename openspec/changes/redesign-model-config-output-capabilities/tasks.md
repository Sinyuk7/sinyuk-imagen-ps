## 1. Matrix editor helpers

- [x] 1.1 提取 `apps/app` 侧纯 helper，负责按 `operation` 归组 official preset matrix。
- [x] 1.2 实现 operation 语义同构判定，覆盖 `imageSizes`、`ratios`、`outputFormats`、有效三元组集合和默认组合语义。
- [x] 1.3 实现维度选择到 sparse matrix subset 的过滤函数，明确禁止重建笛卡尔积。
- [x] 1.4 实现从已保存 `outputMatrix` 子集反推维度选择的函数，并增加“是否可精确表达”的 legacy 检测结果。

## 2. ModelConfigurationPage UI redesign

- [x] 2.1 将 `ModelConfigurationPage` 的编辑态 state 从 `selectedCellIds` 替换为按 module 的 `Output Format`、`Aspect Ratio`、`Resolution` 选择集合。
- [x] 2.2 移除 raw matrix cell checkbox 列表，改为 `Output Format` detached multi-select chips。
- [x] 2.3 实现 `Aspect Ratio` selectable tile grid，包含 graphic ratio tiles 与 `Auto` / `Source` text options。
- [x] 2.4 实现 `Resolution` ordered chips，并保持 label 在选项上方、布局支持换行。
- [x] 2.5 当 `text_to_image` 与 `image_edit` 同构时只显示一个共享 section；不同时显示两个纵向 section。
- [x] 2.6 为 shared section 和 split sections 增加能力摘要与适用范围文案，替换底层矩阵串标签。

## 3. Save and normalization behavior

- [x] 3.1 更新 `ModelConfigurationPage` 保存逻辑，按维度过滤 official preset 原始 sparse cells 后再提交现有 `SaveUserModelConfigInput.outputMatrix`。
- [x] 3.2 保持每个 operation 保存结果非空，并在 UI 校验中按 operation 或 shared section 给出明确错误提示。
- [x] 3.3 对 legacy 非规则 cell 子集增加规范化警告，并在保存时收敛为新的维度过滤语义。
- [x] 3.4 在编辑页显示有效组合数量与 sparse helper 文案，避免误导用户认为所有维度可任意组合。

## 4. Styling and copy

- [x] 4.1 为 chips、ratio tiles、section header badge 和 sparse helper 增加符合 UXP 约束的 shared UI 样式。
- [x] 4.2 更新 `apps/app` i18n 文案，提供用户友好的 `Output capabilities`、`Text to Image`、`Edit Image`、字段标题、摘要和 normalization 提示。
- [x] 4.3 确认窄面板布局下的自动换行、tile 尺寸和 section 间距满足 shared UI 视觉约束。

## 5. Validation

- [x] 5.1 为 helper 增加单测，覆盖同构合并、非同构分离、维度过滤、legacy 可表达与不可表达子集。
- [x] 5.2 更新 `ModelConfigurationPage` 相关 app tests，覆盖 shared section、split sections、取消 `16:9` / `PNG` 的全局过滤语义，以及不重建不存在组合。
- [x] 5.3 增加 legacy 规范化提示测试，覆盖“显示提示”和“保存后收敛”的行为。
- [x] 5.4 运行 per-slice validation：`pnpm --filter @imagen-ps/app test`。
- [ ] 5.5 如实现触及 command 层辅助逻辑，补充并运行 `pnpm --filter @imagen-ps/application test`。
