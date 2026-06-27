---
name: model-selector-state-preservation
description: AppShell must preserve user-selected model when the model list refreshes or the profile changes.
metadata:
  type: project
---

`apps/app/src/shared/ui/app-shell.tsx` 中的模型选择器曾有一个无条件复位 effect：只要 `modelsState.models` 或 `selectedProfile` 变化，就把 `selectedModelId` 重置为 default/first model。这导致用户明明看到多个模型，UI 却永远只显示第一个，看起来像“模型列表缺失”。

修复后的模式是：在复位之前先检查当前 `selectedModelId` 是否仍在新列表中；只有当当前选择失效时才 fallback 到 default/first。这个模式同样适用于任何“从异步列表派生 UI 选择”的场景。

**Why:** 如果未来再添加 provider、profile、模型或能力切换，开发者很可能复用同样的“list 变化就 reset”的写法。保留这个记录可以避免重蹈覆辙。

**How to re-verify:** 运行 `pnpm --filter @imagen-ps/app test` 查看 `main-page.test.tsx` 中的 `模型选择保留用户选择而非强制回到第一个` 测试；或查看 `app-shell.tsx` 中模型选择 effect 的 `stillValid` 保护。
