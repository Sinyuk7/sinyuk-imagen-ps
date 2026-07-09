## 背景

当前实现同时保留了四套互相打架的 `model` 语义：

- `UserModelConfigRepository.list(apiFormat)` 代表 `apiFormat-global` 的配置拥有关系
- `ProviderProfile.selectedModelIds/defaultModelId` 代表 `profile-level` 的 membership / 默认值状态
- `listProfileModels()` 通过 `discoveredModelIds + userModelConfigs + officialCatalogModelIds` 重新拼一个可见列表
- `SettingsDetailPage`、`SettingsAddPage`、`ModelConfigurationPage`、settings root 又分别暴露了不同的入口与操作方式

因此，用户在某个 `profile` 下“添加模型”这件事，今天会被拆成：

1. 在全局 `ModelConfigurationPage` 创建 `UserModelConfig`
2. 在 `profile` 内通过 `selectedModelIds` / `defaultModelId` 再次接入
3. 由 `listProfileModels()` 把全局 config、`official preset`、`discovery` 与 membership state 混合成 selector

这不是“复杂实现”，而是产品语义已经错误。强 `B` 的目标不是给旧结构加解释，而是直接删掉多余层级，让“当前 `profile` 拥有什么模型”成为唯一主问题。

## 目标 / 非目标

**目标：**
- 让 `ProviderProfile` 成为 `model ownership` 的唯一父资源。
- 让 `UserModelConfig` 的 canonical identity 变成 `profileId + modelId`。
- 删除 `selectedModelIds/defaultModelId`，让保存/删除 `UserModelConfig` 直接决定 availability。
- 把 `selectedModelId` 收窄为 UI/runtime 当前选择；它不是 `ProviderProfile` 上的 persisted membership/default state。
- 定义 effective selection 为 `selectedModelId ?? first owned configured model`，其中 `selectedModelId` 必须属于当前 active `profile` 的 owned list 才有效。
- 保留 `Profile Detail` 主结构，让 `Profile Detail -> Models` 成为唯一 canonical 入口。
- 把当前 `ModelConfigurationPage` 收窄为 editor 子 flow，不再承载全局列表。
- 把 `discovery` 收窄为 runtime-only `suggestion`，不做任何持久化，不进入主产品选择契约。
- 删除 `profile-add -> model configuration` 路径，让 `SettingsAddPage` 只负责创建 `profile`。

**非目标：**
- 不设计任何 legacy 数据迁移、兼容读取、回滚路径或双写策略。
- 不保留 standalone global `model ownership` 页面作为过渡方案。
- 不重做 `provider endpoint`、`auth`、`billing` 语义。
- 不让 `discovery` 直接生成可用 `model`，也不让它变成 capability 真相来源。
- 不在本次 slice 中引入跨 `profile` 共享的 `model library`。
- 不在本次 slice 中重新定义 visible label 规则；`settings summary`、selector 与 config list 的文案呈现继续复用 `separate-model-config-and-selection-labels` 已确立的 app-surface helper 契约。

## 决策

### 决策：把 persisted state 压成 `ProviderProfile + UserModelConfig` 两层
本次 change 之后，产品真相只保留两层 persisted state：

```text
Persisted
├── ProviderProfile
│   ├── profileId
│   ├── apiFormat
│   └── ... provider config / secret refs / metadata
└── UserModelConfig
    ├── profileId
    ├── modelId
    ├── baseModelId
    ├── wireModelId
    ├── requestStrategyId
    ├── outputExposure
    └── outputMatrix

Canonical key
- UserModelConfig = (profileId, modelId)

Removed persisted product state
- selectedModelIds
- defaultModelId
- discovery cache as product truth
```

`UserModelConfig` 不再以 `apiFormat` 作为 ownership key。新的 repository / command API 必须围绕 `profileId` 工作，不能再继续暴露 `list(apiFormat)`、`get(apiFormat, modelId)`、`delete(apiFormat, modelId)` 这类会把 ownership 重新拉回全局的接口。

如果 implementation 为了校验或查询性能，暂时在 `UserModelConfig` 结构里保留 `apiFormat` 字段，它也只能是由 parent `ProviderProfile.apiFormat` 派生并校验的一致性冗余字段，不能继续承担产品语义或 canonical key 角色。

备选方案：
- 保留 `(apiFormat, modelId)` 作为主键，再附加 `profileId` 外键：拒绝。因为这会继续暗示“模型首先属于 `apiFormat`，其次才属于 `profile`”。
- 把 `UserModelConfig` 直接内嵌成 `ProviderProfile.models[]`：暂不采用。当前 repo 已有独立 repository / command 边界，保留独立 child resource 更利于后续验证与测试。

### 决策：保存 `UserModelConfig` 必须校验 parent profile 存在，删除 profile 必须级联删除 owned configs
`UserModelConfig` 改为 `profile-owned` 后，ownership 完整性成为数据一致性基础。保存命令在写入前 MUST 校验 `profileId` 指向的 `ProviderProfile` 存在；删除 `ProviderProfile` 时 MUST 级联删除该 `profileId` 下的所有 `UserModelConfig`，避免产生 orphan record。

这一规则同样覆盖命令层直接调用场景（如 UI 通过 `saveUserModelConfig` 创建 config）和通过 `deleteProviderProfile` 间接删除的场景。级联删除不需要用户额外确认，因为 `UserModelConfig` 在本次语义中不再具有独立于 `profile` 的生命周期。

备选方案：
- 让 `UserModelConfig` 保留独立生命周期，删除 profile 后保留 configs 以备后续恢复：拒绝。这与“`profile` 是唯一 ownership 维度”矛盾，且会在本地留下无意义数据。
- 通过后台清理任务异步删除 orphan configs：拒绝。当前 `0-user` current-state 不需要引入异步任务复杂度；命令层同步级联已足够。

### 决策：删除 persisted membership/default state，让 availability 只由 ownership 决定
保存 `UserModelConfig` 之后，它立即属于当前 `profile`，立即出现在当前 `profile` 的 selector / summary / `models page` 中；删除之后，它也立即从这些 surface 上消失。系统不再允许“已经存在一个 `model`，但还要再执行一次 membership 操作才可用”。

`defaultModelId` 不再作为产品契约保留。`ProviderProfile` 只描述 provider 连接、secret refs 与 profile metadata，不再承载“默认模型”或“当前模型”。模型是否可选只由当前 `profile` 的 owned `UserModelConfig` 集合决定。

`selectedModelId` 表示 UI/runtime 当前选择，而不是 persisted ownership 或 default。任何 selector / summary surface 计算当前有效模型时都使用同一条规则：

```text
effectiveModelId =
  selectedModelId if selectedModelId belongs to active profile owned configured models
  otherwise first owned configured model in canonical list order
  otherwise empty when no owned configured model exists
```

因此，保存第一个 `configured model` 后，它会因为 fallback 规则成为 effective model，但系统不会写入任何 `defaultModelId`。删除当前选中的 `model` 后，当前 `selectedModelId` 失效，surface 直接回退到剩余 owned list 的第一项；如果没有剩余模型，则进入无可选模型状态。

`listProfileModels()` / `reconcileProfileModels()` 的产品职责是返回当前 active `profile` 的 owned `configured model` 列表。它们不应该把 `selected` 或 `default` 当成 availability 过滤条件；如果 UI 需要高亮当前项，应在拿到列表后用 effective selection 做 surface-local 标注。

`first owned configured model` 必须来自同一个 canonical list order。implementation 可以沿用 repository/list 命令的稳定顺序，但同一 profile 在 main selector、detail quick selector 与 settings summary 上必须使用同一顺序，避免不同 surface 得到不同 fallback。

备选方案：
- 保留 `selectedModelIds` 作为显式 membership list：拒绝。它只会把旧复杂度原封不动搬到新数据模型里。
- 保留 `defaultModelId` 作为 profile-level 默认模型：拒绝。它会与 UI/runtime `selectedModelId` 形成第二套选择状态，继续制造“当前选中”和“默认”的歧义。
- 保留显式 `no-default-model state`：拒绝。只要当前 `profile` 已拥有 configured models，用户期望 selector 展示并可使用这些模型；空默认状态会把 ownership 和选择状态再次拆开。
- 保存首个模型时写入 `defaultModelId`：拒绝。fallback 是 runtime 计算，不是新的 persisted default。

### 决策：保留 `Profile Detail` 主结构，但把它改成“快速入口”而不是 ownership 页面
`Profile Detail` 继续承载 `endpoint/auth/billing/provider` 主配置结构；这部分页面结构尽量不动。变化只发生在 `model` 区块：

- “当前模型”语义改成“模型列表”语义
- detail 页 inline `+` 按钮删除
- quick selector 顶部固定提供一个动作项：`添加新模型`
- 点击 `添加新模型` 导航到当前 `profile` 的 `Profile Detail -> Models`
- detail 页空状态与快捷动作也只跳转到 `ProfileModelsPage`，不再直接打开 editor
- detail quick selector 不再展示“默认模型”语义，不再把选择写回 `ProviderProfile.defaultModelId`

这意味着 detail 页不再承担 `model CRUD`，而是承担“当前状态摘要 + 快速跳转”。

页面职责矩阵如下：

| 页面 / route | 处理 | 职责 |
| --- | --- | --- |
| settings root | 修改 | 只列出 `profile` 与全局设置，不再提供 standalone global `model ownership` 入口 |
| `SettingsAddPage` | 修改 | 只创建 `profile`，不再配置 `model` |
| `Profile Detail` | 保留并修改 | 保留 `endpoint/auth/billing` 主结构；`model` 区块改为快速 selector + 跳转入口 |
| `ProfileModelsPage` | 新增 | 当前 `profile` 的 canonical `model ownership` 列表页；承载 list / create / edit / delete / discovery suggestion；不承载 set-default |
| `ModelConfigurationPage` | 保留并收窄 | 保留现有 `Create/Edit Model Config` editor 结构；只作为子 flow，不再承载全局列表 |
| Main Page | 修改 | 只消费当前 active `profile` 的 owned `configured model` |

备选方案：
- 继续让 `Profile Detail` 同时承担 list + create + edit：拒绝。detail 页会重新膨胀成混合职责页面。
- 保留全局 `ModelConfigurationPage` 列表，只是加 `profile filter`：拒绝。全局页面本身就会持续暗示错误 ownership。

### 决策：直接把当前混合页拆成 `ProfileModelsPage` + editor 子 flow
当前 `ModelConfigurationPage` 同时承载“全局列表模式”和“editor 模式”，并且通过 `source: 'settings-list' | 'profile-add' | 'profile-detail'` 区分入口。这正是旧语义还在 UI 层存活的证据。

本次 change 直接拆页：

- 现有列表模式从 `ModelConfigurationPage` 中剥离出来，成为新的 `ProfileModelsPage`
- 现有 editor 结构保留，继续使用 `ModelConfigurationPage`
- `ModelConfigurationPage` 只接受当前 `profile` context，不再存在全局列表入口
- `profile-add` source 直接删除
- `profile-detail` source 也直接删除；editor 只从 `ProfileModelsPage` 的 create / edit / suggestion 动作进入
- 旧 `ProfileModelsPage` 上的 `默认` badge、`设置为默认` 按钮、set-default mutation 与相关 success/error handling 全部删除

这不是单纯的“代码重构”，而是页面语义重命名：list 页代表 ownership，editor 页代表 child flow。

备选方案：
- 继续在一个 page 内用 `editorOpen` / `source` 分支复用：拒绝。这样只能把“全局 ownership”与“profile child flow”继续塞在同一棵状态机里。

### 决策：`official preset` 继续保留，但它只提供 editor 模板，不再提供 ownership
`official preset` 的价值仍然存在：它提供 capability 模板、`requestStrategyId`、`outputExposure` 基线，以及 editor 初始值。但它不再被视为 `profile` 已拥有的 `model`，也不再进入主页面 selector 或 settings summary。

当前 Create/Edit editor 结构基本保持不变。用户仍然会在 editor 里选择一个 `official preset` 作为 capability template；变化只是 editor 的父级关系和导航逻辑改变了。

备选方案：
- 把 `official preset` 直接继续暴露成 selector fallback：拒绝。只要 `preset` 仍然能在外部 surface 中伪装成已拥有 `model`，旧混乱就没有被真正移除。

### 决策：`discovery` 只保留为 `ProfileModelsPage` 内部的 runtime-only `suggestion`
`discovery` 如果保留，必须完全退出 persisted product state。它的边界如下：

```text
Runtime only
ProfileModelsPageState
└── discoveredSuggestions: DiscoveredModel[]
```

行为规则：

- `discovery` 结果只存在于当前 `ProfileModelsPage` 的 runtime state 中
- 它不写入 `ModelDiscoveryCacheRepository`
- 页面离开、刷新、重开之后，旧 suggestion 可以直接丢失
- suggestion 永远排在 owned `configured model` 列表下面
- suggestion 在列表内保持 provider 返回的原始顺序，不做额外排序
- 与已 owned `configured model` `modelId` 相同的 suggestion 不再重复展示
- suggestion 永远不会出现在主页面 selector、settings summary、detail quick selector 中
- `discovery` 失败时，页面保留既有 owned `configured model` 列表，错误状态只做一次 toast 提示，禁止把错误数据混入列表，也不要在列表中显示任何 `discovery` 错误行
- 一次 `discovery` 调用完成前，相关触发控件应禁用，避免重复请求
- 因此 `refreshProfileModels` 只返回 provider-discovered suggestions；旧的 persisted discovery cache 不再被 product flow 读取或写入

当用户点击一个 suggestion 时，系统只把它当成 editor 草稿输入：

- `modelId` 默认预填为 suggestion `id`
- `wireModelId` 默认预填为 suggestion `id`
- `baseModelId` / capability template 仍然来自用户选择的 `official preset`
- 只有保存成功后的 `UserModelConfig` 才能进入外部 surface

备选方案：
- 把 suggestion 持久化到 `ModelDiscoveryCacheRepository`：拒绝。它会再次把“暂时看到的远端事实”和“已经拥有的产品对象”混成一层。
- 让 suggestion 直接成为可选择 `model`：拒绝。它跳过了 editor、template、显式保存这三层必要确认。

## 与现有代码的复用分析

| 组件 / 能力 | 决策 | 说明 |
| --- | --- | --- |
| `UserModelConfigRepository` | Extend | 保留 repository 接口与命令层边界，把 key 从 `(apiFormat, modelId)` 改为 `(profileId, modelId)`，新增 `list(profileId)` / `get(profileId, modelId)` / `delete(profileId, modelId)`。 |
| `ProviderProfileRepository` | Extend | 保留现有 profile 读写，移除 `selectedModelIds/defaultModelId` 字段；在 `deleteProviderProfile` 中追加级联删除 `UserModelConfig`。 |
| `saveUserModelConfig` / `deleteUserModelConfig` | Extend | 保留 editor 校验与 `outputExposure` 派生逻辑，输入增加 `profileId`；保存/删除只改变 ownership，不读写 profile-level default。 |
| `listProfileModels` / `reconcileProfileModels` | New (dedicated) | 旧函数混合了 discovery cache、official catalog、membership state，语义已错误；本次用新的 profile-only list 命令替换，旧代码直接删除。 |
| `refreshProfileModels` | Extend | 保留 provider discovery 调用，但不再写入 `ModelDiscoveryCacheRepository`，返回结果直接交给 `ProfileModelsPage` runtime state。 |
| `model-generation-preference-resolution` / `model-generation-preferences` | Extend | 保留 `ModelGenerationPreferenceKey` 的 `profileId` 维度，但 `UserModelConfig` lookup 必须改成 `(profileId, modelId)`，确保相同 `modelId` 在不同 `profile` 下解析各自的 output matrix 与校验结果。 |
| UXP / Chrome / in-memory `UserModelConfigRepository` adapters | Extend | 保留 host storage 边界，但持久化 key 从 `(apiFormat, modelId)` 改成 `(profileId, modelId)`；测试 fake 与 fixture 也必须同步迁移。 |
| `ModelConfigurationPage` editor 结构 | Reuse | 保留 `Create/Edit Model Config` 的字段、校验与官方 preset 选择逻辑，只改变数据来源与返回导航。 |
| `model-info.ts` label helpers | Reuse | 继续复用 `separate-model-config-and-selection-labels` 已完成的 configuration-instance / capability-preset 呈现规则，本 change 不再发明新的 visible label 分支。 |
| `Profile Detail` shell | Extend | 保留 `endpoint/auth/billing/provider` 主结构，只收窄 model 区块语义。 |
| `ProfileModelsPage` | New (shared) | 新增页面承担 canonical ownership list；若后续出现其他需要“profile 子资源列表页”的场景，可抽象为通用模式。 |

## 风险 / 取舍

- **[Risk] 现有本地旧数据会与新语义不兼容** → 接受。当前 repo 是 `0-user` current-state；允许手动清空本地数据，或在新 UI 中直接忽略旧记录。
- **[Risk] 把列表页与 editor 拆开后，短期会出现一些 UI 代码重复** → 接受。先保证页面语义干净，再做后续抽取。
- **[Risk] runtime-only `discovery` 在刷新后会丢失 suggestion** → 接受。suggestion 不是 committed state，丢失不会导致 ownership 歧义。
- **[Risk] detail quick selector 需要支持“顶部动作项 + 普通模型项”混合渲染** → 允许扩展现有 selector 组件，或在实现时替换为更合适的触发器；不回退到全局页面。
- **[Risk] 如果 `UserModelConfig` 暂时保留冗余 `apiFormat` 字段，可能与 parent `ProviderProfile` 漂移** → 必须在 save / load 时校验 parent 一致性，或在实现阶段直接删掉该冗余字段。
- **[Risk] 命令层可能遗漏 parent profile 存在性校验，导致写入 orphan `UserModelConfig`** → 已通过在 `saveUserModelConfig` 中强制校验 `profileId` 并拒绝非存在 profile 来 mitigation。
- **[Risk] 删除 `ProviderProfile` 后可能遗留 orphan `UserModelConfig`** → 已通过在 `deleteProviderProfile` 中级联删除该 profile 下所有 configs 来 mitigation。
- **[Risk] fallback 第一项如果排序不稳定，会让当前有效模型在不同 surface 间漂移** → 所有 selection surface 必须共享同一个 canonical owned-list order，并在 `selectedModelId` 缺失或无效时使用同一 fallback。

## 数据迁移 / 回滚

本次 change 不做数据迁移，不做兼容读取，不做回滚设计。

- 当前产品按 `0-user` current-state 处理
- 旧本地 `UserModelConfig`、`selectedModelIds/defaultModelId`、`discovery cache` 可以手动清空
- 新代码允许直接忽略不兼容旧状态
- implementation 不需要双写、灰度或 reversible migration

## Open Questions

- 无。当前 change 直接选择 clean rewrite，不保留 legacy 兼容岔路。
