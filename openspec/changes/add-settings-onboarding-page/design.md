## Context

当前设置相关页面由 `AppShell` 内部 `view` 状态机驱动，不是 URL router。`Configuration` 页顶部目前包含 `back`、标题、`refresh`、`add`；其中 `refresh` 仅触发一次 profile list reload，不承担模型刷新、余额刷新或全局同步职责。与此同时，`AppGenerationSettings` 当前只有 `providerInputSizePreset` 一个 app-local 持久化字段，Chrome 与 UXP 都已有稳定读写链路，适合作为本次“已读一次性 flag”的最薄落点。

本次需求明确要求：

- 首次只要没看过就触发，不额外判断 profile 数量或其他条件。
- 引导页保持极简，只有 `back`，不提供跳转 CTA。
- 引导内容不需要 `Markdown renderer`，优先简单只读 `HTML + CSS`。
- `Configuration` 顶部移除 `refresh`，改为问号按钮。
- 删除手动 `refresh` 后，进入 `settings` view 时需要主动 reload 一次。

## Goals / Non-Goals

**Goals:**

- 为第一次进入 `Configuration` 的用户提供一次性、低干扰的新手引导。
- 为已看过引导的用户保留稳定的帮助入口。
- 用最小新增状态和最少新基础设施完成该功能。
- 保持 Chrome 与 UXP 的行为一致，并通过现有 store 机制持久化已读状态。

**Non-Goals:**

- 不引入 `Markdown renderer`、CMS、富文本编辑器或远程文案下发。
- 不在引导页内加入 “去创建 Provider” 或 “去模型配置” 等 CTA。
- 不改变 `settings-add`、`settings-detail`、`model-configuration` 的核心配置流程。
- 不扩展为多步 wizard、tooltip tour 或按页面逐段引导。

## Decisions

### Decision: 新增独立 `settings-onboarding` view，而不是在 `settings` 页面内覆盖 modal

`AppShell` 现有导航模型已经基于离散 `view` 切页，新增一个独立 view 最符合当前结构，也最容易控制首次进入、问号重开和 `back` 语义。  

备选方案：

- 在 `settings` 页面内弹 modal：实现更快，但会与现有 header 和滚动容器叠加，首次自动触发时也更像阻断弹窗，不如单页清晰。
- 在 `settings` 页面顶部插入提示卡：不满足“首次 route 到引导页”的要求，也不够聚焦。

### Decision: 将已读字段放入 `AppGenerationSettings`

新增字段 `settingsOnboardingSeenVersion?: number`，当前版本写入 `1`。该字段虽然不属于 generation 语义本身，但现有 `generation-settings.json` / Chrome `appSettings.generation` 已经是稳定、跨 runtime 一致、可立即复用的 app-local 持久化通道。对单个 UI 已读 flag 来说，这是最薄方案。

备选方案：

- 新建 `app-ui-state` store：语义更纯，但会引入新的 port、adapter、读写测试和装配改动；对单字段过重。
- 复用 `promptSettings` 或 `activeImageProfile`：职责更不匹配。

### Decision: 首次进入时先持久化已读，再切到 onboarding

当用户首次进入 `settings` view 且 `settingsOnboardingSeenVersion !== 1` 时，系统先写入 `1`，再切到 `settings-onboarding`。这样即使用户立即返回、关闭 panel 或中断，也不会在第二次进入时再次自动打断。

备选方案：

- 用户看完按 `back` 再写入：更贴近“真正看完”，但与“只弹一次，别搞复杂”的目标相冲突，而且容易重复打断。

### Decision: 引导内容使用手写语义化 `HTML + CSS`

页面内容使用 JSX 直接输出 `h1`、`p`、`ol`、`code` 等只读结构，并复用 shared UI 样式体系。这样无需引入 markdown 解析与内容渲染依赖，也能得到稳定的 UXP/Chrome 表现。

备选方案：

- `Markdown renderer`：内容维护稍灵活，但当前 repo 无现成链路，新增依赖和渲染测试不值当。
- `dangerouslySetInnerHTML` 注入字符串：更脆弱，不利于类型检查与局部样式控制。

### Decision: 删除 `Configuration` 顶部 `refresh`，改为每次进入 `settings` view 主动 reload

顶部 `refresh` 仅重拉 provider profile 列表，价值低且不符合用户预期。删除后，`AppShell` 在切入 `settings` view 时执行一次 `profilesState.reload()`，确保列表仍会刷新。`Configuration` header 改为 `back + title + question + add`。

备选方案：

- 同时保留 `refresh` 和问号：会让紧凑 header 更挤，也与用户决策冲突。
- 删除 `refresh` 但不自动 reload：会丢失唯一刷新路径。

### Decision: 新增问号 icon，保持现有线框 icon 风格

现有 icon 集没有 `question`，只有 `info`。本次新增一个问号图标，但仍沿用现有 24x24、细线、无填充的 shared icon 语言，避免单点按钮风格跳脱。

## Risks / Trade-offs

- [风险] `AppGenerationSettings` 混入 UI 已读字段，语义纯度下降。  
  → Mitigation：字段名显式带 `OnboardingSeenVersion`，并限制在 app-local UI 范围；若未来已读状态增多，再统一抽 `app-ui-state`。

- [风险] 进入 `settings` view 自动 reload 可能增加一次额外异步请求。  
  → Mitigation：reload 仅在切入 `settings` view 时触发，不绑定页面内其他 state 变化。

- [风险] 新增 onboarding view 可能影响现有返回路径。  
  → Mitigation：`back` 一律返回 `settings`，不做多分支 history 语义。

- [风险] 手写静态内容后续改文案需要改代码。  
  → Mitigation：当前文案极短且稳定，收益大于成本；如后续文案复杂化，再评估 renderer。

## Migration Plan

这是 current-state 变更，无需兼容旧用户数据迁移。旧的 `generation-settings` 持久化记录在缺少 `settingsOnboardingSeenVersion` 时视为未看过；第一次进入 `settings` 时写入 `1` 即完成自然迁移。

回滚时：

- 删除 onboarding view 和问号按钮。
- 恢复 `refresh` 按钮。
- 保留 `generation-settings` 中额外字段也不会破坏旧逻辑，因为 `normalizeAppGenerationSettings()` 会忽略未知字段或由回滚实现重新收窄。

## Open Questions

- 无。当前产品决策已足够明确，可直接进入实现。
