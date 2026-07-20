## 1. 当前基线与迁移清单

- [ ] 1.1 运行并记录 `pnpm --filter @imagen-ps/app theme:check`、`pnpm --filter @imagen-ps/app test:ui`、`pnpm check:policy` 与 Settings `test:chrome-e2e` 当前结果，确认 baseline failure 与本变更无关。
- [ ] 1.2 生成 page UI inventory，列出 `apps/app/src/shared/ui/pages/**/*.tsx` 的 raw control、internal UI import、visual inline style、raw color/`--md-sys-*` reference 与重复 page fragment。
- [ ] 1.3 为 inventory 建立只减不增的 migration manifest，并添加 contract test，证明新增 violation 或新增 manifest entry 会失败。
- [ ] 1.4 保存 Settings 主要 route 在 300x420、360x600、420x680、520x720 的稳定 Chrome reference，强制 reduced motion，确认当前 `theme-source` 与 generated color output 无修改。

## 2. Shared UI public foundation

- [ ] 2.1 新增 `apps/app/src/shared/ui/ui-system.ts` page-facing public barrel，导出 approved primitive、component、pattern，并为跨模块 public export 添加简洁中文 JSDoc。
- [ ] 2.2 新增 `patterns/PageFrame`、`PageHeader`、`PageScroll` 与 focused contract tests，统一 page root、header geometry、right-slot placeholder、primary scroll ownership 和 motion integration。
- [ ] 2.3 新增 `patterns/SegmentedTabs` 与 contract tests，覆盖 role、selected/disabled、keyboard、focus 和 compact panel 行为。
- [ ] 2.4 新增 `patterns/SettingsListSection`、`SettingsFormSection`、`FieldGroup`、`PageState`、`FooterActions` 与 focused contract tests。
- [ ] 2.5 将 pattern CSS 接入现有 `PANEL_CSS` authority，仅消费现有 `--app-*`/component token，不修改 `theme-source` palette 或 generated color values。
- [ ] 2.6 为 public barrel 增加 export/ownership contract，证明 page 可使用 public symbol、internal component 仍可 owner-local direct import，且不会形成 barrel cycle。

## 3. UI composition policy

- [ ] 3.1 新增 `scripts/policy/ui-composition.mjs`，使用 TypeScript compiler API 解析 page TSX import、JSX element、style object、style element 与 token/color reference。
- [ ] 3.2 实现 page raw `<button>/<input>/<textarea>/<select>` 禁止规则，并为 approved primitive/native editor seam 建立 path allowlist 与 focused policy tests。
- [ ] 3.3 实现 page internal UI import、visual inline style、`<style>`、color literal 与直接 `--md-sys-*` reference 禁止规则，并输出 file/line/replacement boundary。
- [ ] 3.4 将 UI composition policy 接入 `pnpm check:policy`，保持现有 UXP CSS contract、architecture policy 与 theme check 职责不变。
- [ ] 3.5 验证 migration manifest 只能删除 entry；扩大 allowlist、复制 legacy violation 或新增 manifest entry 均使 policy 失败。

## 4. 双宿主 UI catalog

- [ ] 4.1 新增 `apps/app/src/harness/components/ui-catalog/`，只从 `ui-system.ts` 导入 production primitive/pattern，禁止复制 production CSS、network、storage、Provider、ComfyUI 或 Photoshop document dependency。
- [ ] 4.2 建立 deterministic fixture matrix，覆盖 dark/light/high-contrast、`zh-CN`/`en`、四个 panel size、control 状态、content 状态、long text/overflow 与 host-sensitive seam。
- [ ] 4.3 为 catalog 增加 fixed clock/random、forced reduced motion、stable fixture ownership 与 `data-visual-ready="true"` contract。
- [ ] 4.4 在 Chrome shell 增加 `?harness=ui-catalog` 路由，在 UXP panel runtime 增加 `imagenPsPanelHarness=ui-catalog` 路由，两端渲染同一 catalog component。
- [ ] 4.5 增加 catalog contract tests，验证 required visual id/state matrix、无 external side effect、唯一 primary scroll、无 horizontal overflow 与 public import boundary。
- [ ] 4.6 把现有 icon、popup overlap、native text editor 与 UXP CSS contract board 的高价值状态接入 catalog 或建立明确链接，避免复制第二份视觉 fixture。

## 5. Chrome visual baseline 与 ARIA gate

- [ ] 5.1 新增独立 `apps/app/playwright.visual.config.ts`、deterministic local server/fixture setup 与 `test:visual` package script，不改变现有 `test:chrome-e2e` behavior runner 职责。
- [ ] 5.2 增加 `tests/visual/ui-catalog.spec.ts`，等待 `data-visual-ready="true"` 后使用 `toHaveScreenshot()` 覆盖 approved catalog matrix。
- [ ] 5.3 增加 `tests/visual/page-archetypes.spec.ts`，覆盖 Settings list/form/state archetype 与四个 primary panel size，提交 accepted baseline。
- [ ] 5.4 为 PageHeader、SegmentedTabs、FieldGroup、PageState、SettingsListRow 与 popup/dialog 增加 `toMatchAriaSnapshot()` 或等价 role/name/state relationship assertions。
- [ ] 5.5 增加 accepted environment guard，锁定 OS、Chromium revision、font 与 device scale；unsupported environment 禁止生成可提交 baseline。
- [ ] 5.6 增加 explicit `--update-snapshots` workflow 与 diff artifact，证明普通 test run 不自动更新 baseline。
- [ ] 5.7 修正现有 Settings screenshot capture 的 motion 中间态问题，使 retained diagnostic screenshot 等待最终 motion state；保持其“artifact 非 baseline proof”边界。

## 6. Settings surface 迁移

- [ ] 6.1 将 `SettingsPage` root/header/backend tabs/primary scroll 迁移到 PageFrame、PageHeader、SegmentedTabs 与 PageScroll，保持 route、back 和 add action behavior。
- [ ] 6.2 将 ProviderRoot 与 GeneralRoot 迁移到 SettingsListSection、SettingsListRow 与 PageState，统一 loading/empty/error/action 结构。
- [ ] 6.3 将 ComfyUiRoot connection、workflow、mapping、parameter 与 diagnostics 区域迁移到 SettingsFormSection、FieldGroup、PageState 与 FooterActions，保持 controller/event path 不变。
- [ ] 6.4 将 `SettingsAddPage` 与 `SettingsDetailPage` 的 header、section、field、status 与 footer 迁移到 public patterns，保持 save/test/delete/refresh-model/secret semantics。
- [ ] 6.5 将 GlobalGeneration、ProviderOutput、PromptSettings、PromptPresetDetail、ProfileModels 与 ModelConfiguration settings subroutes 迁移到 public patterns。
- [ ] 6.6 删除已迁移 Settings page 的 inline visual style、raw control、internal import、duplicate spacer/header/section fragment 与对应 migration manifest entry。
- [ ] 6.7 更新 Settings behavior tests、catalog state、ARIA proof 与 Chrome visual baseline；确认 accepted diff 不改变现有用户可见颜色。
- [ ] 6.8 运行 Settings focused UXP catalog geometry probe；若真实 Photoshop/UDT 不可用，明确记录 host proof pending，不宣称 UXP visual complete。

## 7. 其他 page 与 shared state 迁移

- [ ] 7.1 收敛 shared loading/empty/error/status/footer fragments，使 Main、History、Settings 与 model pages 复用同一 PageState/StatusNotice ownership。
- [ ] 7.2 将 HistoryPage 的 PageFrame、PageHeader、filter tabs、task rows、retry/state 与 primary scroll 迁移到 public patterns，保持 merge/filter/retry/place/download behavior。
- [ ] 7.3 将 ModelConfiguration/ProfileModels 的 list/form/advanced section 与 action placement 迁移到 public patterns，保持 model identity、wireModelId、selection 与 save semantics。
- [ ] 7.4 在 `unify-photoshop-mask-edit-region` 重叠 state/event 稳定后迁移 MainPage/Composer presentational shell；保留当前 worktree 的 Mask/Edit Region、attachment、queue、retry 与 task owner。
- [ ] 7.5 每个 page slice 先运行 focused behavior test，再 review visual diff，最后删除旧 selector 与 migration manifest entry；不得通过更新 baseline 掩盖行为或 host failure。
- [ ] 7.6 删除 migration manifest、未使用 page-local selector、重复 primitive/pattern 与 compatibility alias，启用 zero-tolerance UI composition policy。

## 8. Photoshop UXP real-host visual proof

- [ ] 8.1 为 `ui-catalog` 增加可由 `node scripts/uxp-debug/uxp-debug.mjs` 调用的 structured probe，输出 ready、selector count、visibility、rect、scroll、popup、native editor suspension 与 console summary。
- [ ] 8.2 在真实 Photoshop/UDT 加载当前 UXP build，运行 catalog probe，验证 Icon/IconButton、TextField/UxpTextArea、SegmentedTabs、Settings sections 与 popup root 的关键 rect 非零。
- [ ] 8.3 捕获 dark/light/high-contrast 中代表性 Photoshop panel screenshot，按 repo artifact policy 记录 manual evidence，不把一次性截图写入 maintained docs。
- [ ] 8.4 明确 Chrome visual、repo fake UXP 与 real Photoshop UXP proof 的证据边界；任何 host-sensitive failure SHALL 保持 UXP acceptance 未完成。

## 9. 文档与最终验收

- [ ] 9.1 更新 `apps/app/AGENTS.md`，写入 public barrel、page archetype、颜色保持、禁止项、catalog 与 required gate，保持短且可执行。
- [ ] 9.2 更新 `docs/ENGINEERING_CONTEXT.md`，记录 UI system ownership、pattern rationale、AST policy、visual baseline 与双宿主边界。
- [ ] 9.3 更新 `docs/TESTING.md`，记录 `test:visual`、baseline update、catalog route、UXP probe 与 manual/live evidence 流程。
- [ ] 9.4 运行 `pnpm --filter @imagen-ps/app theme:check`，确认 `theme-source` palette 和 generated color output 未因本变更改变。
- [ ] 9.5 运行 `pnpm --filter @imagen-ps/app test:ui`、`pnpm --filter @imagen-ps/app test:chrome`、`pnpm --filter @imagen-ps/app test:uxp`、`pnpm --filter @imagen-ps/app test:visual` 与 `pnpm --filter @imagen-ps/app test:chrome-e2e`。
- [ ] 9.6 运行 `pnpm check:policy`、`pnpm --filter @imagen-ps/app build:chrome`、`pnpm --filter @imagen-ps/app build:uxp` 与最终 `pnpm validate`。
- [ ] 9.7 汇总 Chrome baseline/ARIA、mock-only contract、policy、build 与真实 Photoshop UXP proof，逐项核对两份 capability spec 后再标记 change complete。
