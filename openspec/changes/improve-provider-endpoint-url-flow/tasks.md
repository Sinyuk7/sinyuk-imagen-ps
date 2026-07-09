## 1. 纯函数边界

- [x] 1.1 提炼 `interpretEndpointDraft(rawUrl)`，只输出 `EndpointDraftInterpretation`：raw normalization、base URL candidate、strict `classifyEndpoint()` 结果、`status`、`EndpointModelHint`，并锁死 query / hash 为 unsupported。
- [x] 1.2 提炼 `resolveEndpointApply(interpretation, policy, context)`，只负责 `apply` / `not-applied` 决策与 feedback，不混入导航逻辑。
- [x] 1.3 提炼 `resolveAddNewModelAction(profile, hint, ownedModels)` 或等价纯函数，在点击 `添加新模型` 时返回 `open-models-page` 或 `open-editor(seed)`。
- [x] 1.4 保持 `packages/providers` strict endpoint classification boundary 不被 UI transient state 污染，并把新的 draft interpretation 放在 `apps/app` 或 `packages/application` 的合适层级。

## 2. Add / Detail 页面接入

- [x] 2.1 更新 `SettingsAddPage`，让 full endpoint URL 的每次输入变化都驱动派生字段、feedback、alias suggestion 与 `EndpointModelHint` 实时重算，并清除 stale path 显示。
- [x] 2.2 更新 `SettingsDetailPage`，让它复用同一解释核心，并引入独立 transient raw full-URL draft；仅在 `same-format supported` 时 auto-apply 到结构化 detail draft；unsupported、incomplete、cross-format 输入只保留 raw draft 与 not-applied feedback。
- [x] 2.3 保证 detail page 的 model surface、summary 与 `profile.apiFormat` 在 transient invalid edit 期间保持稳定，不因半截 URL 误切换模型宇宙。
- [x] 2.4 调整 `SettingsAddPage` 保存后的默认导航：任意成功保存都先进入新 profile 的 `Profile Detail`，由 Detail 优先重新 derive `EndpointModelHint`；只有无法重建显式 model 时才使用一次性 fallback seed。

## 3. Seed 导航与 editor 边界

- [x] 3.1 调整 `Profile Detail` 顶部 `添加新模型` 动作：点击时现算 `matched` / `unresolved(seed)` / `no-hint`，不引入长期 `endpointModelIntent` app state。
- [x] 3.2 在匹配现有 owned `configured model` 时进入 canonical `ProfileModelsPage`，不重复打开 create editor；在 unresolved 场景生成一次性的 `ModelConfigurationEditorSeed`。
- [x] 3.3 保持 `ModelConfigurationPage` 只消费初始 seed 预填 draft；seed contract 明确定义 `modelId` / `wireModelId` 预填规则，进入 editor 后不再反向监听 endpoint；并确保不同入口保存/返回回到正确页面。

## 4. 验证

- [x] 4.1 为纯函数 case bank 增加主要覆盖：URL 替换、退格删除、删除到 `/v1/`、unsupported custom path、query/hash rejection、base URL 替换、Gemini explicit model 提取/清除、`matched` vs `unresolved(seed)` 分流。
- [x] 4.2 仅保留少量高价值 UI/harness 测试：add page 不显示 stale path、detail page cross-format 不改结构化 draft/model surface 且保留 raw draft、detail selector unresolved hint 直达预填 editor、matching owned model 进入 `ProfileModelsPage` 而不重复新建。
- [x] 4.3 运行本次 slice 相关 focused suites；若受影响边界扩大，再补跑 `pnpm --filter @imagen-ps/app test` 与最终 `pnpm validate`。
