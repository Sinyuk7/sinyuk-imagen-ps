## Context

当前模型相关交互被拆散在四个不同状态平面里：

- `ProviderProfile.selectedModelIds/defaultModelId`
- `ModelDiscoveryCache`
- `UserModelConfig`
- `ModelGenerationPreference`

这些状态在 `packages/application` 中是分离的，但 `apps/app` 的 settings UI 把它们重新揉进同一个 `Model` 区。`SettingsAddPage` 直接使用 `descriptorDefaultModels` / draft discovery 作为候选源，`SettingsDetailPage` 则从 `listProfileModels()` 的 reconciliation 结果再过滤成 `configSource === "user"` 子集，导致 Add/Detail/Model Configuration 三个入口展示的“模型”根本不是一回事。

本次设计以用户目标为中心收敛：在 `Profile` 页里，用户只需要完成“选择当前 profile 使用哪个模型”。`discovery`、`catalog fallback`、`selected/default/profile models` 等内部概念不再出现在 UI 一线语义里。

## Goals / Non-Goals

**Goals:**

- 将 `Profile` 页模型区收敛为单一下拉菜单：`Selected model for this profile`。
- 下拉候选仅来自与当前 `apiFormat` 兼容的 `UserModelConfig`，不再直接暴露 `discovery` 或 `official catalog preset`。
- 当没有任何可选模型时，提供明确空态和一跳进入 `Model Configuration` 创建页的入口。
- 区分“从 `Profile` 页进入创建模型配置”和“从模型配置列表空页进入”的入口语义；前者带 profile 上下文预填并在保存后返回来源 profile。
- 保留 `provider` / `application` 层现有 `discoverModels`、`refreshProfileModels`、`refreshDraftProfileModels` contract，但将它们退出 UI 主路径，并明确为废弃能力。

**Non-Goals:**

- 不在本次变更中删除 `packages/providers` 或 `packages/application` 的 discovery command / repository 实现。
- 不修改 `UserModelConfig` 的持久化 shape 或 `ModelConfigurationPage` 的 output subset contract。
- 不在本次变更中重做 MainPage 的 selected-model 运行时语义；本变更聚焦 settings/profile 相关交互。
- 不引入新的 profile-scoped model config schema；`UserModelConfig` 仍然是一对多 profile 复用资产。

## Decisions

### Decision: `Profile` 页只展示 `UserModelConfig` 驱动的模型选择

`SettingsAddPage` 与 `SettingsDetailPage` 的模型主控件统一为：

```text
Selected model for this profile
```

候选列表仅使用当前 `apiFormat` 下已保存的 `UserModelConfig`。页面不再把 `descriptorDefaultModels`、`discovered` 结果或 `listProfileModels()` 的 reconciliation 总表直接喂给下拉框。

下拉展示文案仅使用 `UserModelConfig.modelId/displayName`，不追加 official preset 基底模型标签。

原因：用户在 `Profile` 页需要的不是“系统知道多少模型 ID”，而是“这个 profile 现在能选哪些已配置模型”。既然 `UserModelConfig` 是可复用资产层，profile 选择就应只围绕这一层展开。

替代方案：继续允许 official catalog preset 直接进入下拉。放弃该方案，因为这会让“无需创建 config 也能直接选”和“保存的用户配置资产”共存，继续维持双轨语义。

### Decision: `Profile` 页删除次级模型区块，只保留空态与跳转入口

当前 `ProviderDefaultModelSection` 同时承载默认模型、刷新、profile models 列表、状态提示、配置入口。新交互只保留：

- 下拉菜单
- 空态 `StatusNotice`
- 创建入口（inline action 或 header `+`）

`Profile models`、`discovery help`、`listNotice`、`model status notice` 等次级区块从 `Profile` 页移除。

原因：用户目标只有一个，不需要在同一页同时理解“资产列表”“远端发现”“配置状态”“默认/已选”的叠加语义。

替代方案：保留额外区块但弱化文案。放弃该方案，因为结构本身已经过度复杂，弱化文案不能消除概念冲突。

### Decision: `ModelConfigurationPage` 支持“带 profile 上下文进入”

从 `Profile` 页点击创建模型配置时，导航种子数据必须带上：

- `source: "profile-detail"` 或 `source: "profile-add"`
- `profileId`（detail 场景）
- `apiFormat`
- 可能的预填 `modelId/baseModelId`

创建页打开后优先按来源 profile 的 `apiFormat` 预填；保存成功后，如果入口来自 profile，则返回来源 profile 页面并触发候选刷新。

其中从 `SettingsAddPage` 进入时，保存后仅返回 add 表单并刷新候选列表，不自动选中新建模型；用户仍需在 profile 表单中手动选择。

原因：从 profile 进入创建页时，用户心智是“我当前这个 profile 缺模型，我现在去补一个可选项”，不是“我要去独立资产库做全局编辑然后自己再找回来”。

替代方案：统一所有入口都落到模型配置列表首页。放弃该方案，因为会打断 profile 设置流，并增加用户回跳成本。

### Decision: UI 层停用 discovery 主路径，但底层保留并标注废弃

`discoverModels`、`refreshProfileModels`、`refreshDraftProfileModels`、`ModelDiscoveryCacheRepository` 继续保留在 `packages/providers` / `packages/application` / host adapter 中；但 `apps/app` 的 settings/profile 页面不再依赖它们来生成用户可见的模型候选。

后续在代码与文档里应把这些能力标成 deprecated / internal-only，避免新 UI 继续耦合它们。

原因：用户明确希望移除 discovery 这一概念，但直接删除底层实现会扩大改动面并拉长回归范围。先退出 UI 主路径是最稳妥的 clean-up 顺序。

替代方案：立即物理删除 discovery 命令与 repo。放弃该方案，因为当前各层还有调用和测试依赖，切面过大。

### Decision: `Selected model for this profile` 继续映射到现有 `selectedModelIds/defaultModelId`

尽管文案从 `Default model` 改为 `Selected model for this profile`，底层持久化暂不引入新 schema。实现上可以继续：

- 保存单个主选中模型
- 同步维护 `selectedModelIds` 为单元素或与未来扩展兼容的集合
- `defaultModelId` 与当前主选中值保持一致

原因：本次主要是交互语义收敛，不需要同时引入 profile 选择 schema 重构。

替代方案：把底层 schema 立刻改成单值 `selectedModelId`。放弃该方案，因为会扩大 `packages/application`、runtime dispatch、validation、existing tests 的影响范围。

## Risks / Trade-offs

- [Risk] 取消 official catalog 直接可选后，首次配置 profile 的用户必须先创建 `UserModelConfig`。→ Mitigation：空态文案和 `+` 入口必须直接可达，并从 profile 上下文预填创建页。
- [Risk] `selectedModelIds/defaultModelId` 仍保留旧 schema，命名与 UI 文案短期不完全一致。→ Mitigation：在 design 和实现注释里明确“当前主选中模型”的映射关系，并限制 UI 只维护单选语义。
- [Risk] 停用 discovery UI 后，底层遗留命令可能继续被误用。→ Mitigation：在 UI 层完全移除引用，并在后续文档/类型注释中标记 deprecated。
- [Risk] 从 profile 进入创建页的回跳逻辑若处理不一致，容易出现保存后留在资产列表页。→ Mitigation：统一 `initialEditorState` / save-complete 回调的来源协议，并补 add/detail 两条 app tests。

## Migration Plan

- 无需迁移底层持久化 schema；`UserModelConfig`、`ProviderProfile`、`ModelGenerationPreference` 结构保持不变。
- UI 逐步迁移：
  1. 先让 `Profile` 页候选改为仅使用 `UserModelConfig`
  2. 再移除 discovery / profile models / secondary notices
  3. 最后补全 profile-originated create flow 与回跳
- discovery 相关底层能力先保留，待 UI 稳定后可另起 change 做彻底删除。

## Open Questions

- 暂无阻塞性问题。
