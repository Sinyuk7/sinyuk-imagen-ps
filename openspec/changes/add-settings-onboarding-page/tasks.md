## 1. 持久化与 view 状态

- [ ] 1.1 扩展 `AppGenerationSettings` 与 `normalizeAppGenerationSettings()`，新增 `settingsOnboardingSeenVersion` 持久化字段，并同步更新 Chrome / UXP generation settings store。
- [ ] 1.2 在 `AppShell` 中新增 `settings-onboarding` view，并实现首次进入 `settings` 时“先写 `settingsOnboardingSeenVersion = 1`，再切到 onboarding”的判定逻辑。
- [ ] 1.3 调整 `settings` 入口流程，使每次切入正常 `settings` view 时自动执行一次 `profilesState.reload()`，替代旧的手动 header refresh。

## 2. 页面与交互

- [ ] 2.1 新增只读 onboarding page，使用静态语义化 `HTML + CSS` 输出简短新手说明，并提供仅有的 `back` header 行为。
- [ ] 2.2 更新 `Configuration` 页 header，删除 `refresh` 按钮，新增问号按钮，并接入“重新打开 onboarding”的导航行为。
- [ ] 2.3 在 shared icon 集中新增问号 icon，保持与现有线框 icon 风格一致。

## 3. 验证与回归覆盖

- [ ] 3.1 为 generation settings 持久化新增覆盖，验证 `settingsOnboardingSeenVersion` 在缺省、读取、保存场景下行为正确。
- [ ] 3.2 为 `AppShell` / settings 导航新增测试，覆盖首次自动跳转、已读后不再跳转、问号按钮重开、进入 settings 自动 reload。
- [ ] 3.3 如现有 harness 或 UI contract 受影响，补充最小必要断言，确认 `Configuration` header 已从 `refresh` 变为问号帮助入口。
