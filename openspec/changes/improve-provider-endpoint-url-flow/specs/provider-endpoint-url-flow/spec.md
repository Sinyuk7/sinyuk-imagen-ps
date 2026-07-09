## ADDED Requirements

### Requirement: SettingsAddPage endpoint import SHALL recompute derived draft state from the current raw URL
当用户在 `SettingsAddPage` 输入、替换或继续编辑 full endpoint URL 时，系统 SHALL 以当前 raw input 作为单一真相，重新计算 `apiFormat`、base URL、`config.paths`、feedback、alias suggestion 与 explicit `modelId` 提取结果。该 explicit `modelId` 结果 SHALL 只表现为当前页面派生的 `EndpointModelHint`。系统 MUST NOT 继续显示已经被当前输入移除的 endpoint/path 事实。带 query string 或 fragment 的 full URL MUST 视为 unsupported，而不是被静默 strip 后继续应用。

#### Scenario: 从 `chat/completions` 替换为 `images/generations`
- **WHEN** 用户先输入 `https://{base_url}/v1/chat/completions`
- **AND** 随后把它替换为 `https://{base_url}/v1/images/generations`
- **THEN** 系统把派生 `apiFormat` 更新为 `openai-images`
- **AND** 系统把调用路径更新为 `generation=/images/generations`
- **AND** 系统不会继续显示旧的 `invoke=/chat/completions`

#### Scenario: 只更换 base URL 时保留已识别路径
- **WHEN** 用户把 `https://{base_url_1}/v1/images/generations` 更新为 `https://{base_url_2}/v1/images/generations`
- **THEN** 系统更新 base URL 为 `https://{base_url_2}/v1`
- **AND** 系统继续保持 `openai-images` 与 `generation=/images/generations`

#### Scenario: Gemini full URL 提取 explicit model
- **WHEN** 用户输入 `https://llm-api.net/v1beta/models/gemini-3-pro-image-preview:generateContent`
- **THEN** 系统识别 `apiFormat=gemini-generate-content`
- **AND** 系统提取 explicit `modelId=gemini-3-pro-image-preview`
- **AND** 系统在当前页面派生 `EndpointModelHint`

### Requirement: Unsupported or partial add-page input SHALL clear stale path facts while preserving current input context
当 `SettingsAddPage` 的 raw URL 从一个已识别 endpoint 继续退格、删减或改成 unsupported path 时，系统 SHALL 根据当前输入重算可保留的 draft context，并 MUST NOT 继续展示已被删除的旧 path/operation。若当前输入仍然包含可用 base URL，系统 SHOULD 保留该 base URL candidate 与对应 feedback。

#### Scenario: 从完整 URL 退格到部分路径
- **WHEN** 用户先输入 `https://{base_url}/v1/images/generations`
- **AND** 随后退格删除其中一部分路径字符
- **THEN** 系统基于新的当前输入重新计算 feedback
- **AND** 系统不会继续把已被删除的 `/images/generations` 显示为当前调用路径

#### Scenario: 删除到 `https://{base_url}/v1/`
- **WHEN** 用户把 `https://{base_url}/v1/images/generations` 删除到 `https://{base_url}/v1/`
- **THEN** 系统保留 `https://{base_url}/v1` 作为当前 base URL candidate
- **AND** 系统把 `apiFormat` 与调用路径标记为 unresolved
- **AND** 系统不会继续显示之前识别到的 `generation=/images/generations`

#### Scenario: 输入 unsupported custom path
- **WHEN** 用户输入 `https://{base_url}/v1/api/generate`
- **THEN** 系统展示 unsupported feedback
- **AND** 系统不会把该输入错误归类为已支持的 `apiFormat`
- **AND** 系统不会继续保留上一次识别到的调用路径显示

#### Scenario: 输入带 query 或 fragment 的 full URL
- **WHEN** 用户输入 `https://{base_url}/v1/images/generations?foo=1`
- **OR** 用户输入 `https://{base_url}/v1/images/generations#frag`
- **THEN** 系统把该输入视为 unsupported
- **AND** 系统只显示 feedback
- **AND** 系统不会静默删除 query 或 fragment 后继续写回结构化 endpoint/path

### Requirement: SettingsDetailPage endpoint import SHALL auto-apply only supported same-format replacements to the detail draft
当用户在 `SettingsDetailPage` 编辑 full endpoint URL 时，系统 SHALL 保留一个独立于结构化 connection draft 的 transient raw full-URL draft。系统 SHALL 只在当前输入被识别为 `supported` 且 `apiFormat` 与已保存 `profile.apiFormat` 相同的情况下 auto-apply 结构化字段。这里的 auto-apply MUST 只更新 detail draft，而不是立即持久化 `profile`。unsupported、incomplete 或 cross-format 输入 MUST NOT 改变已保存 `profile` 对应的 `config.paths`、model surface 或 `apiFormat`。

#### Scenario: same-format supported 替换自动写回
- **WHEN** 当前 `profile.apiFormat` 为 `openai-images`
- **AND** 用户把 endpoint 更新为另一个同样指向 `openai-images` 的 supported full URL
- **THEN** 系统自动写回新的 base URL 与 `config.paths`
- **AND** 这些变化先停留在 detail draft 中
- **AND** detail page 继续保留当前 `profile` 的 model surface

#### Scenario: cross-format full URL 不会改写已保存结构
- **WHEN** 当前 `profile.apiFormat` 为 `openai-chat-completions`
- **AND** 用户输入 `https://{base_url}/v1/images/generations`
- **THEN** 系统显示 format conflict 或等价 not-applied feedback
- **AND** 系统保留当前 raw full-URL draft 供用户继续编辑
- **AND** 系统不会把已保存 `config.paths` 改成 `generation=/images/generations`
- **AND** 系统不会切换 detail page 的 model surface 到 `openai-images`

#### Scenario: 删除到 unsupported partial text 时保持已保存模型宇宙稳定
- **WHEN** 当前 `profile` 已保存为某个固定 `apiFormat`
- **AND** 用户把一个 supported endpoint 退格删除到 partial 或 unsupported text
- **THEN** 系统不会根据该 transient 输入重新过滤或切换当前 `profile` 的 model list
- **AND** 系统保留该 transient raw input 供用户继续补全
- **AND** 只有当输入再次成为 same-format supported endpoint 时系统才重新 auto-apply

#### Scenario: same-format auto-apply 在保存前不会持久化 profile
- **WHEN** 用户在 `SettingsDetailPage` 获得一个 same-format supported 的 auto-apply 结果
- **AND** 用户尚未点击 `Save`
- **THEN** 系统不会立刻持久化 `ProviderProfile`
- **AND** 当前变化只存在于 detail draft

### Requirement: Explicit model hints SHALL derive from the current endpoint and resolve only at create time
当系统从当前 endpoint 输入或当前 detail endpoint 展示值提取 explicit `modelId` 时，系统 SHALL 只派生当前页面级别的 `EndpointModelHint`。系统 MUST NOT 为此引入长期 `endpoint model intent` 状态。只有在用户点击 `添加新模型` 时，系统才 SHALL 用当前 `profile` 的 owned `configured model` 解析该 hint，得到 `matched` 或 `unresolved(editor seed)` 结果。

#### Scenario: matching owned model 在点击时被解析
- **WHEN** 当前 `profile` 已拥有 `modelId=gemini-3-pro-image-preview` 的 `configured model`
- **AND** 当前 endpoint 也提取出 `gemini-3-pro-image-preview`
- **AND** 用户点击 `添加新模型`
- **THEN** 系统把当前 hint 解析为 `matched`
- **AND** 系统进入当前 `profile` 的 canonical `ProfileModelsPage`
- **AND** 系统不会为同一 `modelId` 强制开启重复新建 editor

#### Scenario: unresolved hint 在点击时生成 editor seed
- **WHEN** 当前 endpoint 提取到 explicit `modelId`
- **AND** 当前 `profile` 尚未拥有 matching `configured model`
- **AND** 用户点击 `添加新模型`
- **THEN** 系统生成一次性的 `ModelConfigurationEditorSeed`
- **AND** seed 至少携带当前 `profileId`、`apiFormat`、`modelId`
- **AND** seed 若未单独覆盖 `wireModelId`，editor 使用同值 `modelId` 预填 `wireModelId`
- **AND** 该 seed 只用于初始化 editor draft

#### Scenario: hint 在保存前不是外部可选 model
- **WHEN** 当前 endpoint 提取到 explicit `modelId`
- **AND** 当前 `profile` 尚未拥有 matching `configured model`
- **THEN** 该 `modelId` 在保存前不会出现在主页面 selector、settings summary 或 `Profile Detail` quick selector 中

#### Scenario: 输入变化后 hint 随当前 endpoint 重新派生
- **WHEN** 用户把当前 endpoint 改成不再提取同一 explicit `modelId` 的内容
- **THEN** 系统基于当前 endpoint 重新派生 hint
- **AND** 后续 `添加新模型` flow 不会继续使用已经失效的旧 `modelId`
