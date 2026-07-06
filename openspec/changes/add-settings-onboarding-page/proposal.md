## Why

当前 `Configuration` 页面对第一次使用的用户过于直接，用户需要自己理解先建 `Model Configuration`、再建 `Provider Profile`、最后回首页使用的顺序。现有顶部 `refresh` 按钮价值很低，但缺少一个稳定的帮助入口，因此需要一个只出现一次的新手引导页和一个后续可重开的问号按钮。

## What Changes

- 新增首次进入 `Configuration` 时显示的新手引导页，用简短静态内容说明最基本的配置顺序。
- 新增持久化字段 `settingsOnboardingSeenVersion`，用于记录用户是否已经看过当前版本的新手引导。
- `Configuration` 页面首次进入时，如果 `settingsOnboardingSeenVersion !== 1`，系统先写入已读标记，再切到新手引导页，确保只自动触发一次。
- 新增顶部问号按钮，允许用户从 `Configuration` 页面再次打开新手引导页。
- 删除 `Configuration` 页面顶部 `refresh` 按钮，并改为每次进入 `settings` view 时主动执行一次 profile reload。
- 新手引导页使用只读 `HTML + CSS` 内容展示，不引入 `Markdown renderer`、富文本编辑器或额外内容管理链路。

## Capabilities

### New Capabilities
- `settings-onboarding`: 定义 `Configuration` 首次进入引导、已读持久化、帮助入口与只读引导页展示行为。

### Modified Capabilities

- 无。

## Impact

- `apps/app/src/shared/ui/app-shell.tsx`：新增 onboarding view、settings 进入时 reload、首次跳转判定。
- `apps/app/src/shared/ui/pages/settings-page.tsx`：删除 `refresh`，新增问号按钮。
- `apps/app/src/shared/ui/pages/*` 与共享样式：新增 onboarding page 与对应样式。
- `apps/app/src/shared/ui/components/icons.tsx`：新增问号图标。
- `apps/app/src/shared/ports/app-generation-settings.ts` 与 Chrome / UXP store adapter：持久化 `settingsOnboardingSeenVersion`。
- App 测试与 harness：覆盖首次进入、已读后不再自动跳转、问号入口、settings 进入自动 reload。
