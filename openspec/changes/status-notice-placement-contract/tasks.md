## 1. Shared feedback contract

- [ ] 1.1 收敛 `StatusNotice` 与 shared `Notice` 的构造边界，让 inline branch 复用 canonical state builder，并把 primary `message`、supporting prose、diagnostic `detail` 拆成明确的语义通道。
- [ ] 1.2 收紧 `StatusNotice` public props：保持默认 inline announcement 静默，只保留显式 opt-in 的 live-region 入口，并清理没有真实 caller 支撑的 API surface。
- [ ] 1.3 为 `section warning slot` 与 `empty-state slot` 增加 shared host wrapper / class contract，确保外部 spacing 由 host 拥有，而不是给 `.status-notice` 增加组件级默认外边距。

## 2. Re-home current hosts

- [ ] 2.1 把 `profile-models-page.tsx` 中由 `refreshSuggestions` / `setDefault` 触发的动作结果从 inline host 迁移到 `Toast`，并保留真正的 section/empty-state 状态在合法 host 中。
- [ ] 2.2 把 `global-generation-settings-page.tsx` 中 output selector rejection / save-style 动作反馈迁移到 `Toast`，只保留 path info unavailable 与独立 combined error section 这类合法 inline status。
- [ ] 2.3 移除 `model-configuration-page.tsx` footer 中的非法 inline `StatusNotice` host，把该错误反馈迁移到 `Toast` 或合法 section host。
- [ ] 2.4 更新 `profile-models-page.tsx`、`provider-settings-sections.tsx` 与其他 empty-state host，使说明文案与 CTA 改走 supporting prose 通道，不再复用 diagnostic `detail`。
- [ ] 2.5 更新 `settings-detail-page.tsx`、`global-generation-settings-page.tsx`、`model-configuration-page.tsx` 等保留 inline status 的合法 host，使它们接入明确 slot/wrapper，并审计现有 `.billing-error`、`.test-area .status-notice`、footer override 等局部样式是否仍然必要。

## 3. Documentation and verification

- [ ] 3.1 更新 `docs/ENGINEERING_CONTEXT.md`，补充 `Toast` / inline `StatusNotice` / `FieldHelp` / `empty-state slot` 的 lane contract 与 forbidden hosts。
- [ ] 3.2 为当前 10 个 host 的收敛结果补 focused UI/harness 覆盖，至少验证动作结果走 `Toast`、empty-state prose 不再走 diagnostic `detail`、合法 inline host 拥有稳定 spacing、以及 compact host 不再渲染 inline `StatusNotice`。
- [ ] 3.3 运行相关 `apps/app` 定向验证与最终 `pnpm validate`，确认 shared primitive、host 迁移与文档收口没有引入回归。
