---
name: composer-select-swc-chain
description: Composer selection controls use sp-action-button + sp-popover + sp-menu; sp-picker / sp-action-menu are rejected because they lack UXP wrappers.
metadata:
  type: project
---

`apps/app/src/shared/ui/components/composer-select.tsx` 的受控单选下拉采用 `sp-action-button`（自定义 chip 触发器）+ `sp-popover` + `sp-menu` + `sp-menu-item` 的组合，而非 `sp-picker` 或 `sp-action-menu`。原因是 UXP 双运行时合同：shared UI 源码统一引用原生 `@spectrum-web-components/*` 包名，UXP build 再用 `@swc-uxp-wrappers/utils` 的 `aliases` 表把它们 alias 到 `@swc-uxp-wrappers/*`（见 `apps/app/vite.uxp.config.ts` 的 `UXP_SHARED_SWC_ALIAS_KEYS`）。只有存在 wrapper 的组件才能在真实 Photoshop 面板里运行；Chrome build 则直接走原生 SWC。

截至当前 `@swc-uxp-wrappers/utils` 的 36 条 alias：`action-button` / `menu` / `popover` 都有 wrapper；`action-menu` 一条都没有（0 条），核心 `sp-picker` 也没有 wrapper（只有 `picker-button` 有，但那是另一个组件）。因此 Composer 的选择控件只能落在 action-button + popover + menu 这条链上——触发器外观可自定义，但 open 状态与选项列表必须由 SWC menu/popover 承载，才能同时满足 Chrome 与 UXP。

**Why:** 未来再为 Composer 或其他 shared UI 加选择控件时，开发者很可能下意识抓 `sp-picker` / `sp-action-menu`（更“开箱即用”），但这两者在 UXP 下没有 wrapper，会直接破坏双运行时合同，且往往要到真实 Photoshop 面板里才暴露。保留这条记录可以避免重复踩坑。

**How to re-verify:** 运行 `node -e "import('@swc-uxp-wrappers/utils').then(m=>console.log(Object.keys(m.aliases)))"` 查看 alias 覆盖（确认无 `action-menu`、核心 `picker` 缺失）；或查看 `apps/app/vite.uxp.config.ts` 的 `UXP_SHARED_SWC_ALIAS_KEYS` 与 `composer-select.tsx` 的实现。同区域的选值保留 pitfall 见 [[model-selector-state-preservation]]。
