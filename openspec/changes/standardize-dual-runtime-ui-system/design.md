## Context

`apps/app` 是一个 dual-runtime surface：Chrome shell 与 Photoshop UXP shell 最终都渲染 `AppShell`，共享 `apps/app/src/shared/ui`、`PANEL_CSS`、theme generation、motion、toast、popup layer 与 i18n。当前结构已经避免了 Chrome-only/UXP-only 页面分叉，但共享 UI 内部仍同时存在 primitive、compound component、page-local JSX、page-local class 和 inline style 多种装配方式。

现有 `pnpm check:policy` 能阻止 UXP 不支持的 CSS、raw text input seam、synthetic input/change dispatch 与 motion 越界；`pnpm --filter @imagen-ps/app test:ui` 能证明行为和 DOM contract；`test:chrome-e2e` 能证明 browser build、viewport、overflow、console 和 network health。它们没有定义“一个新页面必须由哪些视觉构件组成”，也没有把保存的 screenshot 与 accepted baseline 比较。

现有颜色系统已经由用户确认。`theme-source`、generated `--md-sys-*` 与 public `--app-color-*` 映射、Photoshop host fallback 和 light/dark/high-contrast 输出均保持现状。本变更治理颜色的使用边界，不重新选择 palette，也不要求把所有控件替换成 SWC。Photoshop UXP 对 HTML/CSS、native editor、custom element geometry 和 SWC version 有宿主限制，因此 browser-only component library 不能成为唯一实现或验证表面。

并行 change `unify-photoshop-mask-edit-region` 可能修改 `MainPage`、Composer state 和 harness。本变更不得借 UI 迁移重写其 Mask/Edit Region 业务状态；MainPage 迁移必须保持 domain props、state owner、event path 与 task semantics 不变，并在重叠区域合并当前 worktree，而不是覆盖另一 change。

## Goals / Non-Goals

**Goals:**

- 建立 app-local、dual-runtime 的 UI composition system，使新 page 只能通过公开 primitive、pattern 与 domain component 装配。
- 保留现有用户可见颜色值，并把颜色、spacing、radius、type 与状态样式限制在现有 token/CSS authority 内。
- 把 page shell、header、segmented tabs、scroll region、section、field、list row、empty/loading/error state 和 footer action 收敛为具名 pattern。
- 建立 Chrome 与 Photoshop UXP 共用的 deterministic `ui-catalog`，覆盖组件状态、locale、theme 与 panel size。
- 为 Chrome 建立 committed screenshot baseline 与 ARIA contract；为 Photoshop UXP 建立独立 real-host geometry/visibility/console smoke。
- 通过机械 policy 让新 session 在错误装配进入 review 前失败，而不是依赖 prompt 记忆或人工审美判断。
- 渐进迁移现有 pages，同时保持 Provider、ComfyUI、HostPort、placement、persistence 与 execution behavior 不变。

**Non-Goals:**

- 不修改 `theme-source` 中的 palette，不替换现有 `--app-color-*` 结果，不进行品牌重设计。
- 不引入 React Spectrum，不升级整套 SWC，不要求所有 primitive 使用 SWC custom element。
- 不把 Storybook/Chromatic 作为 primary catalog 或 acceptance gate；后续可基于同一 public UI system 增加 browser-only review surface。
- 不创建 Chrome 与 UXP 两套 page/component tree，不在 host adapter 中复制视觉组件。
- 不修改 `apps/app` 之外的业务/domain contract，不重构 Provider、ComfyUI 或 Photoshop workflow。
- 不把 Chrome screenshot 声明为真实 Photoshop UXP 证明，也不把 manual host smoke 加入默认 mock-only CI。

## Decisions

### 1. 保留现有目录所有权，新增 page-facing public barrel

`apps/app/src/shared/ui` 继续是唯一 UI owner，不新建 workspace package。现有 `primitives/`、`components/`、`styles/`、`motion/` 与 `pages/` 保留；新增 `patterns/` 存放页面级但 domain-neutral 的组合构件，并新增一个 page-facing public barrel，例如 `apps/app/src/shared/ui/ui-system.ts`。

层级定义：

- token/style authority：`styles/theme-source`、generated theme、`styles/*.ts`；只定义视觉值和 selector contract。
- primitive：原生控件、Icon、IconButton、Divider 等最小 host-safe seam；只有 primitive 可以直接输出受控 native control。
- component：TextSelect、StatusNotice、SettingsListRow、PopupLayer 等可复用 compound behavior。
- pattern：PageFrame、PageHeader、SegmentedTabs、PageScroll、SettingsSection、FieldGroup、PageState、FooterActions 等页面 archetype。
- page：读取 controller/view model、组装 domain content、绑定 event；不得定义新的通用视觉语言。

Page 与 `src/harness/components/ui-catalog` 只能从 public barrel 导入公共 UI。Primitive/component 内部仍可 direct import，避免 barrel cycle。选择 app-local barrel 而不是独立 package，因为所有视觉兼容 contract 都由 `apps/app` 和 UXP host 约束，跨 package export 会扩大边界且没有复用消费者。

### 2. 颜色合同冻结视觉结果，只治理 token consumption

本变更不改 `theme-source/*.css`、`generate-theme-css.mjs` 的 palette algorithm 或 generated color values。新 pattern 和迁移后的 page 必须消费已有 `--app-color-*`、`--app-space-*`、`--app-radius-*`、font 与 component token；不得从 page 直接消费 `--md-sys-*`，也不得写 `#hex`、`rgb()`、`hsl()` 或状态专用颜色。

若 pattern 需要新语义，先增加由现有 `--app-*` alias 派生的 component token，例如 `--ui-page-header-*`，不得借机选择新颜色。Visual baseline 以迁移前稳定画面为初始 reference；任何颜色差异都必须作为显式 visual review，而不是 migration side effect。

选择 alias-only 策略而不是替换 Material 3 source 或改用 Spectrum token package，因为用户对当前 palette 满意，当前问题是装配漂移而非色彩质量。未来 palette 变更应作为独立 change。

### 3. Page pattern 以 archetype 和 slot 表达，不以自由 className 表达

第一组 pattern 覆盖 Settings surface 的高频结构：

- `PageFrame`：page root、runtime-neutral data attributes、motion integration。
- `PageHeader`：back/title/right slot，统一 header geometry 与 placeholder。
- `SegmentedTabs`：tablist、selected/disabled/keyboard/ARIA contract。
- `PageScroll`：唯一 primary scroll region。
- `SettingsListSection`：section label + SettingsListRow collection。
- `SettingsFormSection`：heading + fields + status/action slots。
- `FieldGroup`：label/control/help/error ownership。
- `PageState`：loading、empty、error 与 retry/action。
- `FooterActions`：primary/secondary/destructive action placement。

Pattern 暴露 bounded variant 和 slot，不暴露任意视觉参数。`className` 只用于明确 allowlist 的 domain hook 或 test hook，不能让 page 改写 padding、color、radius、font 或 control state。选择 archetype pattern 而不是一个万能 `Stack/Box` API，因为自由 layout primitive 会把设计决策重新推回 page，并难以在 UXP CSS subset 下机械验证。

### 4. 用 TypeScript AST policy 强制 page 装配

新增 `scripts/policy/ui-composition.mjs`，通过 TypeScript compiler API 解析 `apps/app/src/shared/ui/pages/**/*.tsx` 和受约束 harness，而不是只用 regex 判断 TSX。Policy 至少检查：

- page 不得出现 raw `<button>`、`<input>`、`<textarea>`、`<select>`；必要 native element 只能存在于 approved primitive/seam 文件。
- page 不得出现 visual `style={{...}}`；只允许 motion/geometry owner 中经明确 path allowlist 的 style 写入，以及 public component 内设置 CSS custom property。
- page 不得直接导入 internal primitive/component path；公共 UI 必须从 `ui-system.ts` 导入。
- page 不得写 color literal 或直接引用 `--md-sys-*`。
- page 不得创建 `<style>`、修改 global stylesheet 或注册 duplicate visual primitive。
- public barrel export 和跨模块 public component 必须有中文 JSDoc。

现有 `uxp-css-contract` 继续负责 CSS property/value subset，新的 AST policy 只负责 ownership/composition。迁移期间采用显式 migration manifest 记录尚未迁移的现有 page violation；manifest 只能减少，新增 violation 立即失败。全部 page 迁移后删除 manifest，切换为 zero-tolerance。

选择 AST 而不是扩展 regex，因为 JSX element、import source、style object 与 CSS variable reference 都有结构，AST 能降低注释、字符串和格式变化造成的误报。

### 5. `ui-catalog` 是双宿主唯一 component catalog

新增 `apps/app/src/harness/components/ui-catalog/`。Catalog 直接使用 public barrel、production theme injection、motion preference、popup root 和 native editor seam，不复制 production CSS。Chrome shell 通过 `?harness=ui-catalog` 选择；UXP panel runtime 通过现有 `imagenPsPanelHarness` 机制选择同一 React component。

Catalog 使用固定 fixture，不访问 network、storage、Provider、ComfyUI 或 Photoshop document。矩阵至少包括：

- theme：当前 dark/light/high-contrast host modes。
- locale：`zh-CN` 与 `en`，覆盖长文本和不可断技术标识符。
- panel：300x420、360x600、420x680、520x720。
- control state：default、focus、selected、disabled、busy、success、warning、error。
- content state：empty、loading、error、long text、overflow、one/many list rows。
- host-sensitive seam：IconButton geometry、TextField/UxpTextArea、popup overlap、scroll ownership。

Catalog root 在 fixture、theme、locale、viewport classification、motion preference 与 component mount 全部稳定后设置 `data-visual-ready="true"`。Visual mode 强制 reduced motion、固定时间/随机值、禁止 async network，并在 screenshot 前清除 focus/caret 等非目标波动。

选择 app-native catalog 而不是 Storybook 作为 primary surface，因为 catalog 必须能原样进入 Photoshop UXP、复用 panel bootstrap 和 host workaround。Storybook 可以后续消费相同 component，但不能替代 host evidence。

### 6. Chrome visual suite 与现有 behavior E2E 分离

保留 `apps/app/tests/chrome-e2e/run.mjs` 作为 behavior/responsive/live-provider runner；新增独立 Playwright Test visual suite，例如：

- `apps/app/playwright.visual.config.ts`
- `apps/app/tests/visual/ui-catalog.spec.ts`
- `apps/app/tests/visual/page-archetypes.spec.ts`
- committed per-platform baseline 目录
- `pnpm --filter @imagen-ps/app test:visual`

Visual suite 构建 Chrome app、启动 deterministic local server、打开 catalog/page fixture，等待 `data-visual-ready="true"`，使用 `toHaveScreenshot()` 比较 accepted baseline，并对关键 pattern 使用 `toMatchAriaSnapshot()`。Baseline 只在固定 OS、browser revision、font 与 device scale 环境生成；update 必须使用显式 `--update-snapshots`，不得由普通 test 自动接受。

Visual suite 初始覆盖 catalog 与 Settings archetype；后续迁移 History、Model Configuration、Main Page 时按 page state 增加少量高价值 baseline。避免为每个业务组合生成截图矩阵，防止 baseline 数量失控。

### 7. Photoshop UXP 使用 catalog geometry probe 和 manual screenshot

UXP build 加载到真实 Photoshop 后，使用现有 `node scripts/uxp-debug/uxp-debug.mjs` 对 `ui-catalog` 运行固定 probe。Probe 输出 structured JSON，至少包含：

- catalog root ready state。
- required selector count、visibility 与 `getBoundingClientRect()`。
- primary scroll ownership 与 overflow。
- Icon/IconButton 非零 geometry。
- popup root 与 anchor geometry。
- TextField/UxpTextArea native editor suspension state。
- console/page diagnostic summary。

真实 host screenshot 作为 manual review artifact，验证 Photoshop theme、font、control geometry 和 host-only rendering。Host gate 不进入默认 `pnpm validate`，但涉及 primitive、pattern、icon、popup、text editor 或 shared CSS 的变更没有该证据不得宣称 UXP visual acceptance complete。

选择 DOM geometry + manual screenshot，而不是 macOS window automation，因为 repo 已规定 `uxp-debug` 是默认 host probe，窗口自动化脆弱且无法解释 DOM/host mismatch。

### 8. 迁移按 foundation、Settings、其他 page 分阶段执行

迁移不同时重构 business state。每个 page slice 先固定 behavior contract 与 screenshot，再替换 structure，最后删除旧 CSS selector 和 migration manifest entry。

顺序：

1. 建 public barrel、patterns、catalog、AST policy 和 visual infrastructure，不迁移业务 page。
2. 迁移 Settings root、Provider/General/ComfyUI sections、Settings detail/add/model/global/prompt pages。
3. 迁移 shared loading/empty/error/status/footer patterns。
4. 迁移 History 与 Model Configuration。
5. 在 `unify-photoshop-mask-edit-region` 重叠区域稳定后迁移 MainPage/Composer presentational shell；不改变 Mask 或 task state owner。
6. 删除 migration manifest、旧 selector、重复 page fragment，启用 zero-tolerance policy。

## Risks / Trade-offs

- [Risk] Pattern API 过于抽象，形成新的万能 layout DSL → 只建立从现有重复结构提取出的 archetype；新增 pattern 必须由至少两个真实 consumer 或明确 page authority 支持。
- [Risk] 迁移造成像素变化但行为测试仍通过 → 每个 slice 先建立 Chrome baseline，迁移后 review diff；颜色、font、spacing 差异必须显式接受。
- [Risk] Screenshot 在不同 OS/browser/font 下抖动 → 固定 CI image、Chromium revision、font、device scale，强制 reduced motion 和 `data-visual-ready`。
- [Risk] Chrome baseline 通过但 Photoshop UXP 失败 → host-sensitive change 必须追加 `ui-catalog` geometry probe 和 manual Photoshop screenshot。
- [Risk] AST policy 阻止合法 host workaround → workaround 只能放在 approved primitive/motion/host seam，并要求中文 JSDoc 与 focused contract test；不对 page 开例外。
- [Risk] Migration manifest 变成永久债务 → manifest 记录 owner 和 target phase，policy 禁止新增 entry，最终 task 明确删除。
- [Risk] 与 Mask/Edit Region change 同时修改 MainPage → MainPage 放在最后阶段，保留 current worktree state，按 presentational boundary 合并，不重写 domain state。
- [Trade-off] app-native catalog 不提供 Storybook addon ecosystem → 换取同一 catalog 可在真实 UXP host 运行；后续仍可增加 Storybook adapter。
- [Trade-off] committed visual baseline 增加 review 成本 → 只覆盖 catalog 和高价值 page state，不为所有业务排列生成截图。

## Migration Plan

1. 记录当前 Chrome Settings/catalog-equivalent screenshot 与现有 UI policy/test 结果，确认 theme source 无 diff。
2. 添加 patterns、public barrel、catalog 和 visual-ready contract；保持 production page 不变。
3. 添加 AST policy，但使用只减不增的 migration manifest 接纳现有 page debt。
4. 添加 Chrome visual suite并提交初始 baseline；完成 UXP catalog smoke 脚本和 runbook。
5. 按 Settings → shared states → History/Model Configuration → MainPage 顺序迁移；每批运行 focused tests、visual diff、`pnpm check:policy`。
6. 删除旧 page fragment、未使用 selector 与 migration manifest，切换 zero-tolerance。
7. 更新 `apps/app/AGENTS.md`、`docs/ENGINEERING_CONTEXT.md`、`docs/TESTING.md`，运行 `pnpm validate`；host-sensitive slice另记录真实 Photoshop UXP proof。

Rollback 以 slice 为单位：pattern 与旧结构在单个 slice 验收前可并存；若 visual/host proof 失败，回退该 page 的 pattern adoption，不回退 public foundation。不得通过关闭 policy、更新 baseline 或修改颜色来掩盖失败。

## Open Questions

- 固定 visual CI environment 使用现有本机 macOS baseline，还是新增专用 Linux container baseline；实现前必须选定唯一 accepted environment。
- Settings 之外第一批高价值 page baseline 选择 History 还是 Model Configuration；依据近期变更频率与 host 风险决定。
- UXP manual screenshot 的持久保存位置与 release evidence 形式需要沿用现有 canonical policy，避免把一次性 artifact 写进 maintained docs。
