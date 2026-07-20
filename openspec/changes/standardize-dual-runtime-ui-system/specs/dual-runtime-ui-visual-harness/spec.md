## ADDED Requirements

### Requirement: The system SHALL provide one deterministic dual-runtime UI catalog
系统 SHALL 提供一个 app-native `ui-catalog` React harness，并 SHALL 由 Chrome shell 与 Photoshop UXP panel runtime 渲染同一 catalog component、public UI imports、production theme injection、PopupLayer root、motion preference 与 host-safe primitive seam。Catalog 不得复制 production CSS 或建立 runtime-specific component gallery。

#### Scenario: Open the catalog in Chrome
- **WHEN** Chrome app 使用 `?harness=ui-catalog` 启动
- **THEN** shell SHALL 渲染 shared `ui-catalog`，且 SHALL 不创建 production host/services 或访问 external network

#### Scenario: Open the catalog in Photoshop UXP
- **WHEN** `imagenPsPanelHarness` 选择 `ui-catalog` 且 plugin reload
- **THEN** UXP panel SHALL 渲染与 Chrome 相同的 catalog component 和 fixture matrix

#### Scenario: Catalog component requires a host-sensitive seam
- **WHEN** catalog 展示 IconButton、TextField、UxpTextArea 或 popup overlap
- **THEN** catalog SHALL 使用 production public component，不得使用 browser-only substitute

### Requirement: UI catalog SHALL cover a bounded visual state matrix
Catalog SHALL 使用 deterministic fixture 覆盖当前支持的 theme、locale、panel classification、control state、content state 与 host-sensitive seam。矩阵 SHALL 至少包含 dark/light/high-contrast、`zh-CN`/`en`、300x420/360x600/420x680/520x720、default/focus/selected/disabled/busy/success/warning/error、empty/loading/error/long-text/overflow 与 popup/native-editor overlap。

#### Scenario: Render all required component states
- **WHEN** visual suite 打开 catalog default matrix
- **THEN** 每个 public primitive/pattern SHALL 至少出现一次 approved state，且 required state SHALL 有稳定 `data-testid` 或 `data-visual-id`

#### Scenario: Render long localized content
- **WHEN** catalog 切换到 `zh-CN` 或 `en` long-text fixture
- **THEN** label、button、row、header 与 field content SHALL 不重叠、不截断关键 action、也不造成 horizontal page scroll

#### Scenario: Add a new public visual variant
- **WHEN** public primitive/pattern 新增 variant 或状态
- **THEN** 同一 change SHALL 增加 catalog fixture 和对应 visual/contract evidence

### Requirement: Visual capture SHALL wait for explicit stable-ready state
Catalog/page fixture SHALL 在 locale、theme、panel mode、fixed fixture、component mount 与 motion preference 全部稳定后设置 `data-visual-ready="true"`。Visual capture SHALL 强制 reduced motion、固定时间/随机值、禁止外部 network，并等待该 ready marker；仅等待 element visible 或任意 sleep 不得视为稳定证明。

#### Scenario: Capture the first Settings route
- **WHEN** visual test 从 MainPage 导航到 Settings
- **THEN** test SHALL 等待目标 fixture 的 `data-visual-ready="true"` 和最终 motion state，再生成 screenshot，不得捕获 page fade 中间态

#### Scenario: Fixture starts asynchronous work
- **WHEN** catalog component 尝试访问 Provider、ComfyUI、storage、timer-driven clock 或 random data
- **THEN** harness SHALL 使用 fixed fake 或拒绝该 dependency，且不得在 ready 前产生未受控变化

#### Scenario: Reduced motion is active
- **WHEN** visual mode 启动
- **THEN** shared motion layer SHALL 立即写入最终 visual state，且 screenshot 不得依赖 animation duration

### Requirement: Chrome visual suite SHALL compare committed screenshot baselines
系统 SHALL 提供独立 Playwright Test visual suite，对 catalog 和少量高价值 page archetype 使用 `toHaveScreenshot()` 比较 committed baseline。Baseline SHALL 在一个声明的 OS、Chromium revision、font set 与 device scale 环境生成；普通 test run 不得自动更新 baseline。

#### Scenario: Visual output matches accepted baseline
- **WHEN** visual suite 在 accepted environment 运行且 rendered pixels 在 configured tolerance 内匹配
- **THEN** visual test SHALL pass 并保留 baseline 不变

#### Scenario: Component geometry or color changes unexpectedly
- **WHEN** screenshot 与 baseline 超出 configured tolerance
- **THEN** visual test SHALL fail 并生成 expected/actual/diff artifact，且 implementation 不得通过普通 run 自动接受新 baseline

#### Scenario: Intentionally approve a visual change
- **WHEN** reviewer 确认 visual diff 符合独立 change contract
- **THEN** baseline SHALL 仅通过显式 `--update-snapshots` workflow 更新，并与 source change 一同 review

#### Scenario: Visual test runs in an unsupported environment
- **WHEN** OS、browser revision、font 或 device scale 与 accepted baseline environment 不匹配
- **THEN** suite SHALL fail fast 或明确跳过 baseline comparison，且不得生成可提交的新 baseline

### Requirement: Critical UI patterns SHALL have ARIA snapshot proof
Chrome visual suite SHALL 对 PageHeader、SegmentedTabs、form field、PageState、navigation row 与 dialog/popup 等关键 pattern 增加稳定 ARIA snapshot 或等价 semantic assertion。像素 baseline SHALL 不替代 role、name、state、selection、disabled 与 relationship contract。

#### Scenario: Segmented tabs look unchanged but lose selection semantics
- **WHEN** screenshot 仍匹配但 selected tab 不再暴露正确 role 或 selected state
- **THEN** ARIA assertion SHALL fail

#### Scenario: Field help loses its relationship
- **WHEN** TextField、help 或 error 的视觉未变，但 `aria-describedby`/label relationship 丢失
- **THEN** semantic assertion SHALL fail

### Requirement: Existing Chrome behavior E2E SHALL remain separate from visual acceptance
现有 `test:chrome-e2e` SHALL 继续负责 behavior、responsive overflow、console/page/network error 与 optional live-provider scenario；新的 `test:visual` SHALL 负责 committed pixel/ARIA baseline。两套 gate SHALL 复用 deterministic app build/fixture，但不得把 screenshot artifact existence 当作 visual pass。

#### Scenario: Behavior E2E saves screenshots without comparison
- **WHEN** `KEEP_SCREENSHOTS=1` 仅保存 current-run screenshot
- **THEN** report MAY记录 artifact，但 SHALL 不把该 artifact 声明为 baseline comparison proof

#### Scenario: Visual baseline passes while behavior fails
- **WHEN** pixels/ARIA 匹配但 click、routing、save 或 console assertion 失败
- **THEN** overall Chrome acceptance SHALL fail，且 visual suite 不得替代 behavior E2E

### Requirement: Photoshop UXP visual acceptance SHALL use real-host probe evidence
涉及 primitive、pattern、Icon、popup、native editor、shared CSS 或 host-sensitive geometry 的 change SHALL 在真实 Photoshop UXP 中运行 `ui-catalog` probe。Probe SHALL 输出 structured geometry/visibility/scroll/console evidence，并 SHALL 验证 required selector 存在、可见且关键 rect 非零。

#### Scenario: Icon renders in Chrome but collapses in Photoshop
- **WHEN** Chrome baseline通过，但 UXP probe 报告 required Icon/IconButton rect 为 `0x0`
- **THEN** UXP visual acceptance SHALL fail，且 implementation 不得以 Chrome screenshot 作为替代证明

#### Scenario: Popup overlaps a native editor
- **WHEN** UXP catalog 打开 anchored popup 覆盖 TextField/UxpTextArea
- **THEN** probe SHALL 证明 popup root/anchor geometry 有效、native editor suspension 生效且 hit-test shell 未被 native editor 截获

#### Scenario: Real-host probe is unavailable
- **WHEN** change 属于 host-sensitive 类别但当前无法连接 Photoshop/UDT
- **THEN** repo-side implementation MAY完成，但 final status SHALL 明确标记 UXP visual proof pending，不得声称 end-to-end complete

### Requirement: Default CI SHALL remain deterministic and mock-only
`pnpm validate` SHALL 保持 network-free、credential-free、mock-only 与可重复。Chrome visual baseline MAY进入固定环境 CI；真实 Photoshop UXP probe 与 manual screenshot SHALL 保持 owner-local/manual gate。Real Provider 或 live ComfyUI SHALL 不成为 UI composition acceptance 的依赖。

#### Scenario: Run default validation without local credentials
- **WHEN** clean environment 运行 `pnpm validate`
- **THEN** UI composition、unit/contract、build 与 policy checks SHALL 不读取 `.test.env` 或访问 live Provider/ComfyUI

#### Scenario: Run real-host UI proof
- **WHEN** owner 在 Photoshop/UDT 中执行 UXP catalog probe
- **THEN** evidence SHALL 作为独立 manual/live proof 记录，且不得改变 default CI 的 mock-only contract
