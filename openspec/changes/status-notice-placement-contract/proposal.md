## Why

当前 `apps/app` 对 `StatusNotice` 缺少明确的 app-surface placement contract。用户动作失败、section 持续状态、empty state 指引、field/group 校验被混用到同一种 inline host 里，已经导致 footer 压扁 notice、settings 页相邻块无间距、以及把说明文案塞进 diagnostic `detail` 的语义错误。

这个问题现在已经不再是单点样式缺陷，而是共享反馈 primitive 的 contract 缺失。继续按页面逐点修补会让新增 call site 重复引入相同错误，因此需要先把 feedback surface 的归属、合法 host、spacing ownership 与 content semantics 定义清楚，再进入实现。

## What Changes

- 为 `apps/app` 定义统一的 feedback surface contract，明确 `Toast`、inline `StatusNotice`、`FieldHelp` 与 `empty-state slot` 的使用边界。
- 规定 inline `StatusNotice` 的合法 host 仅限 section replacement、section warning 与 empty-state slot；禁止在 `footer`、`toolbar`、`action row`、`heading row` 与 `list row` 中渲染 inline `StatusNotice`。
- 把显式用户动作产生的失败或拒绝结果路由到 `Toast`，不再混入页面 body 的 inline `StatusNotice` host。
- 规定 inline `StatusNotice` 的外部 spacing 由 host slot / wrapper 拥有，不依赖组件级默认外边距，也不允许继续靠页面局部补丁维持可读性。
- 拆分 inline 状态里的 supporting prose 与 diagnostic `detail` 语义，保留 diagnostic `detail` 给 mono / copyable 的机器导向文本，禁止用它承载 empty-state 指引或普通说明文案。
- 收紧 `StatusNotice` 与共享 `Notice` primitive 的边界，避免 inline branch 与 `createNoticeState()` 默认规则漂移，并清理没有真实调用场景支撑的 API surface。

## Capabilities

### New Capabilities
- `status-feedback-surfaces`: 定义 `apps/app` 中 `Toast`、inline `StatusNotice`、`FieldHelp` 与 `empty-state slot` 的反馈归属、合法 placement、spacing ownership、diagnostic vs supporting text 语义，以及默认 announcement 行为。

### Modified Capabilities
- 无。

## Impact

- 受影响代码主要位于 `apps/app/src/shared/ui/components/notice.tsx`、`apps/app/src/shared/ui/components/status-notice.tsx`、`apps/app/src/shared/ui/provider-status.ts`，以及当前所有 inline `StatusNotice` host：`profile-models-page.tsx`、`global-generation-settings-page.tsx`、`settings-detail-page.tsx`、`provider-settings-sections.tsx`、`model-configuration-page.tsx`。
- 受影响样式主要位于 `apps/app/src/shared/ui/styles/pages.ts` 中的 `status-notice`、`billing-error`、`test-area`、`settings-detail-footer-actions` 等 host 规则。
- 受影响验证主要是 `apps/app` 的 UI/harness 测试与必要的权威文档更新，例如 `docs/ENGINEERING_CONTEXT.md` 中对 `Toast` 与 inline notice 职责的补充说明。
- 该 change 保持在 `apps/app` surface 内完成，不修改 `packages/application`、`packages/core-engine` 或 `packages/providers` 的 runtime contract。
