## Context

当前 provider settings URL 流程里，真正混乱不是“识别不准”，而是职责边界不清：

1. `importProviderEndpointInput()` 同时做 parse、draft patch、alias 推导、`modelId` 提取，已经接近巨型 helper。
2. `SettingsAddPage` 有 detect input，允许用户先贴完整 URL 再落到结构化字段；`SettingsDetailPage` 没有 detect input，本质是一个带 `Save` footer 的 draft 编辑页，而不是即时持久化页。
3. 当前 change 文档把 explicit `modelId` 提取写成 runtime-only `endpoint model intent`，自然把实现带向新的长期状态域，进而引出 `profileId`、fingerprint、`satisfied`、clear-on-switch、clear-on-save 一整套生命周期。

这条线和现有代码边界不一致。`AppShell` 现在天然只持有一次性 `modelConfigurationEditorSeed`；`ModelConfigurationPage` 也只消费一次性 `initialEditorState`。更干净的设计是：页面从当前 endpoint 派生 hint；用户点击 `添加新模型` 时，再生成一次性 seed。

## Goals / Non-Goals

**Goals:**
- 把 full endpoint URL 处理拆成 parse、apply、navigation 三段纯逻辑，避免再出现新版巨型 helper。
- 用 `EndpointModelHint` 表达“当前 endpoint 推导出的事实”，而不是引入长期 `endpoint model intent` 状态。
- 用一次性的 `ModelConfigurationEditorSeed` 承接 `添加新模型` 动作，减少重复输入 `modelId`。
- 明确 `SettingsDetailPage` 的 `same-format supported -> autoApply` 只更新 detail draft，不直接持久化 `profile`。
- 让 add/detail/edit 三个 flow 在不增加 UI 复杂度前提下，复用同一套 URL 解释核心。

**Non-Goals:**
- 不新增长期 `endpointModelIntent` app state。
- 不把 endpoint-derived hint 写入 `ProviderProfile`、`UserModelConfig`、`selectedModelId` 或其他持久化真相。
- 不把 `ModelConfigurationPage` 变成反向监听 endpoint 的联动 editor。
- 不把 cross-format conversion 变成 detail page 新能力。

## Decisions

### Decision: 把 endpoint 处理拆成三个纯函数

共享逻辑不再继续堆进单个 importer，而是拆成三段：

```ts
interpretEndpointDraft(rawUrl) -> EndpointDraftInterpretation
resolveEndpointApply(interpretation, policy, context) -> EndpointApplyDecision
resolveAddNewModelAction(profile, hint, ownedModels) -> AddNewModelAction
```

职责边界：

- `interpretEndpointDraft(rawUrl)`
  - 只负责 raw 输入解释
  - 输出 `raw`、`baseUrlCandidate`、`classification`、`status`、`explicitModelHint`
- `resolveEndpointApply(...)`
  - 只负责页面策略
  - 决定当前输入是否能改写 draft、如何给 feedback
- `resolveAddNewModelAction(...)`
  - 只负责 `添加新模型` 点击后的导航结论
  - 结果只能是 `open-models-page` 或 `open-editor(seed)`

这样 add/detail 共享解释核心，但页面 apply 策略和导航策略不会混在一起。

备选方案：

- 继续把 parse + apply + navigation 混在 `interpretProviderEndpointInput()`：拒绝。现有 helper 已经证明这种写法会继续膨胀。
- 把 navigation decision 放回 `AppShell`：拒绝。`AppShell` 应该只接收导航 payload，不负责解释 endpoint。

### Decision: 用 `EndpointModelHint` + `ModelConfigurationEditorSeed`，不用长期 intent state

explicit `modelId` 提取改成两个层次：

- `EndpointModelHint`
  - 从当前 add-page raw URL 或 detail-page 当前 endpoint 展示值派生
  - 表达“当前输入/当前页面 endpoint 能否推导出 model 线索”
  - 不是独立状态真相，不持久化，不带 lifecycle 元数据
- `ModelConfigurationEditorSeed`
  - 用户点击 `添加新模型` 时才创建
  - 只用于 `ModelConfigurationPage` 初始 draft

因此：

- 不需要 `profileId + fingerprint + satisfied` 这类状态管理字段
- 不需要 clear-on-switch / clear-on-save / clear-on-back 规则
- matching model 与 unresolved create path 只需要点击时现算

建议模型：

```ts
type EndpointDraftInterpretation = {
  raw: string
  baseUrlCandidate?: string
  classification?: EndpointClassification
  status: 'empty' | 'incomplete' | 'unsupported' | 'supported'
  explicitModelHint?: {
    apiFormat: ApiFormat
    modelId: string
  }
}

type ModelConfigurationEditorSeed = {
  profileId: string
  apiFormat: ApiFormat
  modelId?: string | null
  wireModelId?: string | null
}

type EndpointApplyDecision =
  | { kind: 'apply'; patch: EndpointPatch; hint?: EndpointModelHint }
  | { kind: 'not-applied'; reason: 'incomplete' | 'unsupported' | 'cross-format'; feedback: string; hint?: EndpointModelHint }

type AddNewModelAction =
  | { kind: 'open-models-page'; reason: 'no-hint' | 'matched-existing'; matchedModelId?: string }
  | { kind: 'open-editor'; seed: ModelConfigurationEditorSeed }
```

备选方案：

- 保留 runtime-only `endpoint model intent` 并在 `AppShell` 管理：拒绝。它会变成第二套 model-selection 系统。
- 把 explicit `modelId` 直接写入 `selectedModelId`：拒绝。未配置 model 不能污染外部选择真相。

### Decision: `SettingsDetailPage` 的 autoApply 只更新 detail draft

detail page 当前是明确的 `Save` / `Test` / `Cancel` 式编辑流，而不是即时保存页。源码里 endpoint 编辑先改本地 draft，真正持久化只发生在 footer `Save`。

因此文档必须锁死：

- `same-format supported -> autoApply`
  - 含义是：自动写入 detail draft 的结构化 endpoint/base URL/path 字段
  - 不含义是：立即 patch 持久化 `profile`
- unsupported、incomplete、cross-format 输入
  - 只改 feedback
  - 不改 persisted profile
  - 也不切换当前 detail page 的 model surface

备选方案：

- 把 autoApply 理解成即时持久化 patch：拒绝。与现有 `Save` footer 语义冲突，也会让测试边界混乱。

### Decision: detail full URL 输入拥有独立 transient raw draft

为了承接 “unsupported / incomplete / cross-format 只反馈、不改结构化 draft” 这条规则，detail page 需要一个独立的 transient raw full-URL draft，而不是直接把每次键入都写回 `connection.endpoints[].url`。

- raw draft 承载当前用户输入、feedback 与继续编辑上下文
- same-format supported 输入才会把归一化后的 base URL / paths auto-apply 到结构化 detail draft
- unsupported、incomplete、cross-format 输入保持 raw draft 可见，但不改结构化 detail draft
- profile 切换、save 成功、cancel/back 或显式 reset 时，raw draft 重新从当前结构化 endpoint 值派生

这样 detail flow 才能同时满足“用户看到自己刚输入的 full URL”与“结构化 endpoint/path/model surface 不被半截输入污染”。

### Decision: `Detail -> Create` 现算 hint，点击时生成 seed

`Profile Detail` 页面不存长期 intent。规则收敛为：

- detail 页面基于“当前 endpoint 展示值”派生 `EndpointModelHint`
- 用户点击 selector 顶部 `添加新模型`
- 系统用当前 `profile + hint + ownedModels` 现算：
  - `matched(modelId)` -> 走 `open-models-page(reason='matched-existing')`，不走重复新建 editor
  - `unresolved` -> 生成 `ModelConfigurationEditorSeed`，直达 `ModelConfigurationPage`
  - `none` -> 走 `open-models-page(reason='no-hint')`

这样 `Detail -> Create` 保留你要的最简 UI，但不会演化成长期状态管理。

### Decision: `Add -> Detail` 先保存 profile，再优先重新 derive hint

`SettingsAddPage` 仍然不能在 `profile` 持久化前配置 model。这条保持不变。

保存后的默认 flow：

1. Add page 保存 `profile`
2. 导航到新 profile 的 `Profile Detail`
3. Detail 基于新 profile 的 endpoint/base URL 展示值重新 derive `EndpointModelHint`
4. 用户如果点击 `添加新模型`，再决定是否直达 editor

只有一个例外：

- 如果保存后的结构化 `profile` 无法完整还原保存前显式 model URL 里的 `modelId`
- 允许通过一次性 route seed 兜底，把 `ModelConfigurationEditorSeed` 或其最小信息带到 Detail
- 这个 fallback seed 只服务当前一次跳转，不成为 app state

这条设计避免 agent 默认加 `AppShell intent state`，同时保留 Gemini explicit model URL 的用户上下文。

### Decision: `ModelConfigurationPage` 只消费 seed，不反向监听 endpoint

进入 `ModelConfigurationPage` 之后：

- seed 只用于初始化 draft
- seed payload 至少定义 `profileId`、`apiFormat`、`modelId?`、`wireModelId?`
- `modelId` / `wireModelId` 初始值可由 seed 预填；若 `wireModelId` 缺省，则 editor 以同值 `modelId` 初始化
- 用户后续手改这些字段，就是普通 editor 行为
- editor 不再和 endpoint URL 保持双向联动

这样 editor 边界稳定，也不会把 page 变成受外部 endpoint 状态控制的半联动表单。

### Decision: 测试主增量放在纯函数 case bank

大多数 URL 演进场景都应该下沉到纯函数测试，而不是扩大 UI harness：

- URL 替换：`chat/completions -> images/generations`
- 退格删除到 partial path
- 删除到 `/v1/`
- unsupported custom path
- base URL 替换
- Gemini explicit model 提取 / 清除
- `matched` vs `unresolved(seed)` 分流

页面 harness 只保留少量高价值场景：

- add page 不显示 stale path
- detail page cross-format 不改 model surface
- detail selector 在 unresolved hint 时直达预填 editor
- matching owned model 不重复新建

## Risks / Trade-offs

- **[Risk] 三段纯函数会让实现看起来多一层抽象** → 接受。相比继续堆一个 importer 巨型 helper，这层分离能明显降低回归面。
- **[Risk] add page 保存后改成先跳 Detail，会调整现有导航节奏** → 接受。它更符合“先创建 profile，再决定 model”的心智，也让 detail 重新 derive 成为默认路径。
- **[Risk] fallback route seed 与 detail re-derive 双路径可能不一致** → fallback 只允许在“结构化 profile 无法重建 explicit model”时启用，并保持 payload 最小化。
- **[Risk] 当前 classifier 对 query/hash 处理不一致，会影响 hint 推导** → 保留为显式 open question，在实现前锁死 contract。

## Migration Plan

无持久化迁移。

- `ProviderProfile`、`UserModelConfig`、`selectedModelId` contract 不变
- 变化只在页面解释逻辑、导航 payload、测试结构与文档命名
- 旧文档里的 `endpoint model intent` 在实现阶段整体替换为 `EndpointModelHint` / `ModelConfigurationEditorSeed`

## Locked Decisions

- 不新增长期 `endpointModelIntent` app state。
- `AppShell` 只负责导航与一次性 route payload，不负责解释 endpoint。
- `SettingsDetailPage` 的 `autoApply` 只更新 detail draft，不直接持久化 `profile`。
- `ModelConfigurationPage` 只消费初始 seed，不反向监听 endpoint。
- full endpoint URL draft interpretation 对 query string 与 fragment 一律判为 unsupported；UI 只能反馈，不能静默 strip 后继续 apply。

## Open Questions

- `interpretEndpointDraft()` 的 URL normalization 应该做到哪一层：partial 输入阶段是否就统一 host lowercase、default port strip、`/v1` vs `/v1/`，还是只在 supported/apply 阶段 canonicalize？
- 对 `.../models/<id>:generateContent`，`explicitModelHint.modelId` 应返回裸 `<id>`，还是保留 `models/<id>` 前缀？
- Add 保存后通往 Detail 的 fallback route seed，是否只在“结构化 profile 无法重建 explicit model”时携带，还是可以始终携带但由 Detail 优先忽略？
