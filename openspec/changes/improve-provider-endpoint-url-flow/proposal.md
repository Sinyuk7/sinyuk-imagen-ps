## Why

当前 `SettingsAddPage` 与 `SettingsDetailPage` 都在复用 `importProviderEndpointInput()`，但页面实际需要的交互策略并不相同，导致“第一次输入可同步、后续替换/删除不再同步”的状态漂移：

- add page 把 raw full URL、`apiFormat`、`connection.endpoints[].url`、`config.paths`、alias suggestion 混在一套即时写回里；当输入从已识别 URL 继续修改、退格，或切到另一个完整 URL 时，其他区域会残留上一次识别结果。
- detail page 直接在已存在 `profile` 的结构化字段上做 import；用户看起来是在编辑一个 full URL，但系统实际只允许部分情况 auto-apply，导致“输入值、调用路径、模型区块”之间缺少清晰的一致性规则。
- explicit model URL 例如 `https://.../v1beta/models/gemini-3-pro-image-preview:generateContent` 已经能提取 `modelId`，但这个信号只停留在页面局部状态里，没有真正减少后续“找模型 / 新建模型 / 再返回”的手动步骤。
- repo 目前缺少覆盖“替换 URL、退格删除、删除到 base path、跨域名替换、显式 model handoff”的稳定 harness，回归容易反复出现。

这次 change 目标不是继续堆交互，而是把“raw endpoint URL 如何解释、何时写回结构化字段、何时触发模型捷径”收敛成一套明确 contract。

## What Changes

- 新增共享的 `provider-endpoint-url-flow` capability，定义 full endpoint URL 的解释结果、add/detail 两种 apply policy，以及 explicit model hint / editor seed handoff。
- 保持 add 与 edit 复用同一套 endpoint interpreter，但明确区分页面策略：
  - add page 使用 live draft policy，raw URL 每次变化都重新计算派生状态，禁止其他区域显示已经被删除的旧 endpoint/path 结果。
  - detail page 保留独立的 transient raw full-URL draft；只有 `same-format supported -> autoApply` 才会把结果写入 detail draft。unsupported、incomplete、cross-format 输入只更新该 transient draft 与 feedback，不改变结构化 detail draft 或已保存 `profile` 的 endpoint/path/model surface。
- 把 explicit model detection 从“页面局部提示”收敛为 `EndpointModelHint + ModelConfigurationEditorSeed`：
  - 如果当前 `profile` 已有匹配 `modelId`，系统把这次 action 收敛为进入 canonical `Profile Detail -> Models` 页面，而不是制造重复新建路径。
  - 如果没有匹配 model，用户点击 `添加新模型` 时才生成一次性 editor seed，直接打开带预填 `modelId` / `wireModelId` 的 `ModelConfigurationPage`；默认 `wireModelId` 与推导出的 `modelId` 相同，除非 seed 显式覆盖。
- full endpoint URL 的 draft interpretation 锁死与 provider base-url contract 对齐：带 query string 或 fragment 的 URL 视为 unsupported，给 feedback，但不做静默 strip。
- `SettingsAddPage` 任意成功保存后都默认进入新 profile 的 `Profile Detail`，由 Detail 优先重新 derive hint；只有保存后的结构化 profile 无法重建 explicit model 时，才允许一次性 route seed 兜底。
- 建立 harness-first 测试矩阵，但把大多数 URL 演进场景下沉到纯函数 case bank；页面 harness 只保留少量高价值交互。

## Capabilities

### New Capabilities
- `provider-endpoint-url-flow`: full endpoint URL 的解释、draft apply policy、`EndpointModelHint`、`ModelConfigurationEditorSeed`，以及 add/detail 页对这些结果的消费规则。

### Modified Capabilities
- `profile-model-ui-structure`: 调整 `Profile Detail`、`ProfileModelsPage`、`ModelConfigurationPage`、`SettingsAddPage` 之间的导航规则，使当前 endpoint 派生 hint 可以在点击 `添加新模型` 时减少一步无意义跳转，同时保持 canonical browse/manage page 不变。

## Impact

- 受影响代码主要在 `apps/app`：`provider-endpoint-import` 及其新纯函数/类型、`SettingsAddPage`、`SettingsDetailPage`、`AppShell`、`ProfileModelsPage`、`ModelConfigurationPage`、相关 harness helpers 与 UI tests。
- `packages/providers` 的 `classifyEndpoint()` 继续保留严格 provider contract；如果需要 richer draft interpretation，应放在 app/application 侧而不是把 UI transient state 塞回 provider adapter contract。
- 受影响交互：
  - add page 改成“raw URL 是单一真相，其他区域跟随当前输入实时重算”。
  - detail page 改成“只接受 same-format supported 自动写回 detail draft；其他输入只报状态，不改已保存结构”。
  - `添加新模型` 在存在 unresolved explicit model hint 时允许直达预填 editor；显式 browse/manage 入口仍进入 `ProfileModelsPage`。
  - add page 保存后先到 `Profile Detail`，再由 detail flow 决定是否直达 model create。
- 受影响验证：需要新增纯 case-based interpreter tests、少量 settings page harness tests、以及 app-shell navigation tests，避免 UI test 文件数量按 bug 线性增长。
