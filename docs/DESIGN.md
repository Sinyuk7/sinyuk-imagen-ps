# 设计系统 — Sinyuk Imagen PS

## 产品语境
- **这是什么：** 一个运行在 Photoshop UXP 里的图像生成插件，带一个可选的 web harness 用于开发和调试。核心闭环是：导入图片、输入 prompt、选择 provider / model、发送任务、拿到 result，再决定是否继续编辑。
- **给谁用：** 面向设计师、图像工作流操作者，以及需要浏览器端镜像环境做测试和回退的开发者。
- **所处领域：** Creative tooling、AI image workbench、workflow-focused editor UI。
- **项目类型：** Desktop plugin + optional developer web harness。

## 术语约定
- `chat` 在这里不是通用聊天，而是承载图像任务流的 task stream。
- `job` 指一次完整任务，从提交到完成或失败。
- `provider`、`model`、`prompt`、`adapter`、`host`、`UXP`、`web` 这些词保留英文，不做硬翻译。
- UI 文案以中文为主，但技术名词、配置键、模型名、错误码保持英文，以免在实现和排障时失真。
- 设置页采用两层结构：先是 provider 列表页，再进入某个 provider 的 detail page。
- 主页面是 chat-like，但不是 chat clone；它是 task stream + composer + result viewer 的重构版。

## 视觉方向
- **方向名：** Precision Studio
- **装饰程度：** Intentional
- **气质：** 安静、克制、精确、带一点工具感。它应该像一台可靠的创作仪表盘，而不是一个泛 AI 聊天产品。
- **参考：** 没有外部站点参考。这个方向来自已批准的产品计划，以及 Photoshop / UXP 的宿主约束。

### 为什么是这个方向
- Photoshop 里的 UI 不需要先证明“有多热闹”，而需要先证明“好用、稳、快”。
- 这个产品的核心价值不是花哨，而是把 image task 流程组织得更顺。
- 如果视觉太轻太软，它会像网页插件；如果太硬太重，又会压住图片本身。
- `Precision Studio` 的目标是让界面退后，让图片和任务状态站到前面。
- 参考 Eagle 的价值在于“配置中心”和“二级 provider detail page”的信息结构，不在于它的具体视觉样式。
- 参考 Gemini 的价值在于“主页面是一个有吸引力的任务入口”，不在于它的手机端比例和模块分布。

### 设计原则
- 任务优先，不是聊天优先。
- 图片优先，不是装饰优先。
- 设置页不是后台，是工作流的一部分。
- `provider` 切换必须轻，不应该像换一个软件。
- 任何视觉决定都不能让 generated image 变得不重要。

### 不做什么
- 不做通用 SaaS 那种大面积留白和轻飘飘的营销感。
- 不做 `purple AI` 套路，不用那种到处都像“智能助手”的视觉语言。
- 不做重工业式 `brutalist`，因为这会和 Photoshop 的创作语境打架。
- 不做花哨动画来证明现代感，动画只负责确认状态。

## Adobe UXP 硬约束
- **UI 基础组件优先级：** 优先使用 `Spectrum UXP widgets` 或 `Spectrum Web Components (SWC)`，不要把基础表单控件自绘成网页风。
- **Panel 优先：** 主界面默认应是 non-blocking `Panel`。只有在需要阻塞画布操作、确认关键动作、或者请求权限时，才使用 `Dialog`。
- **面板宽度：** 不要把 UI 设计成依赖大固定宽度的网页侧栏；窄宽度可用性比“桌面大屏展开感”更重要。面板必须支持 resize。
- **主题适配：** 所有颜色、边框、图标、状态都必须在 Photoshop light / dark themes 下保持可读。
- **图标规范：** Panel icon、plugin icon、selected / hover / unselected 状态都要单独考虑，不能假设 SVG 在 UXP 下无条件稳定。
- **反馈规范：** 长任务必须有 loader / progress，权限请求必须显式提示，成功 / 失败 / 输出状态必须可见。
- **表单规范：** 必须有明确 label，默认使用 top labels，错误必须贴近字段或动作。
- **动效规范：** 动效只用于状态确认，不用于装饰。
- **可访问性：** 不能只靠颜色表达状态，键盘必须能完成主流程，`prefers-reduced-motion` 必须被尊重。

## Typography
- **Display / Hero：** `Space Grotesk` - 有辨识度，但不会像标题字体那样抢戏；适合做产品气质的第一层表达。
- **Body：** `IBM Plex Sans` - 清晰、中性、技术感强，适合密度较高的面板和表单。
- **UI / Labels：** `IBM Plex Sans`
- **Data / Tables：** `IBM Plex Mono` - 支持 tabular rhythm，适合状态、数值、配置项和日志。
- **Code：** `IBM Plex Mono`
- **Loading：** Web 端用 Google Fonts 或 Bunny Fonts 的 `<link>`；UXP 端优先本地打包或预加载，避免网络依赖影响启动。
- **Scale：** 控制在小而稳定的字号系统里，不要为了层级感硬拉大字号。
  - `display-1`: 32px / 38px, 600
  - `display-2`: 24px / 30px, 600
  - `section-title`: 18px / 24px, 600
  - `body`: 14px / 20px, 400
  - `body-strong`: 14px / 20px, 600
  - `label`: 12px / 16px, 500
  - `mono`: 13px / 18px, 500
  - `caption`: 12px / 16px, 400

### 字体分析
- `Space Grotesk` 给这个产品一点“非默认”气质，适合标题、页面名、空状态标题。
- `IBM Plex Sans` 的优势是稳，它不会让表单、设置、状态文案显得像营销页。
- `IBM Plex Mono` 是必要的，因为这个产品会频繁展示 `model`、`providerId`、错误码、配置值和状态时间。
- 字体组合的目的不是追求时髦，而是让创作工具看起来像创作工具。
- Web 端可以更完整地使用这套品牌字体；UXP 端如果使用 Spectrum 组件，应优先尊重组件自身的 typography 和主题体系，不要为了品牌感破坏原生质感。

## Color
- **Approach：** Balanced
- **Primary：** `#78E7C0` - 主操作色，用于 Generate、Save、Retry、Confirm 这类高置信度动作。
- **Secondary：** `#67B7FF` - 用于链接、信息提示、次要高亮，不要和主操作竞争。
- **Neutrals：** 冷灰/石墨色系。
  - `#0D1117` background
  - `#151A22` surface
  - `#1C2330` elevated surface
  - `#242C3B` raised surface
  - `#2E3748` border
  - `#3A4457` border-strong
  - `#A6B0BF` muted text
  - `#E9EDF4` primary text
- **Semantic：** success `#63D48F`, warning `#F2B84B`, error `#F26D6D`, info `#67B7FF`.
- **Dark mode：** 这个系统默认就是 dark-first。因为它嵌在 Photoshop 里，目标不是显得“明亮”，而是显得“安静、专业、融入宿主”。如果未来必须做 light variant，也要保留同样的层级关系、空间关系和 accent 逻辑。

### 色彩分析
- 深色背景让图片内容更突出，能把注意力从 chrome 上抽离出来。
- mint 主色比常见的 purple / violet AI 视觉更冷静，也更像工具而不是概念品牌。
- blue 只做辅助，不承担主品牌识别，避免界面变得科技感过载。
- neutral 层级要细，不然 task stream、composer、result card 会糊成一片。

### Token Direction
使用少量明确 token，而不是页面级临时取色。
更完整的可实现 token 约定见 [TOKEN.md](./TOKEN.md)。

```css
--color-bg: #0d1117;
--color-surface: #151a22;
--color-surface-2: #1c2330;
--color-surface-3: #242c3b;
--color-border: #2e3748;
--color-border-strong: #3a4457;
--color-text: #e9edf4;
--color-text-muted: #a6b0bf;
--color-primary: #78e7c0;
--color-primary-strong: #41c9a3;
--color-secondary: #67b7ff;
--color-success: #63d48f;
--color-warning: #f2b84b;
--color-error: #f26d6d;
```

## Spacing
- **Base unit：** 8px
- **Density：** UXP 端偏 compact，web 端保持 comfortable，但两者不要长出两个视觉系统。
- **Scale：** `2xs(4) xs(8) sm(12) md(16) lg(24) xl(32) 2xl(48) 3xl(64)`
- **规则：** 默认内边距 16px，模块间距 24px，相关控件 8-12px。

### 间距分析
- 这个产品的工作区会在小面板里塞入很多信息，因此 spacing 不能松散。
- UXP 端比 web 端更需要压缩垂直浪费，因为 Photoshop 面板本身就不宽松。
- 但是不能压到“像工具栏贴工具栏”，否则会损失阅读秩序。

## Layout
- **Approach：** Hybrid
- **Grid：** UXP 用单列堆叠 + sticky header + sticky composer。Web 端在桌面使用 12 列，平板压缩到 8 列，小屏回落到单列。
- **Max content width：** web 端 1280px。UXP 面板按可用宽度铺满，但内容块要控制视觉宽度，避免文字横向过散。
- **Border radius：** `sm 8px`, `md 12px`, `lg 16px`, `xl 20px`, `full 9999px`.

### Layout Rules
- 第一屏必须直接给到工作面，不要先放 hero。
- composer 必须始终可见，用户不应该为了发送任务往下找入口。
- result card 要在 task stream 里就地展示，不要跑到另一个隐藏视图。
- web 可以做右侧 settings rail；UXP 更适合堆叠或抽屉式 settings。

### 信息层级
1. 当前任务状态
2. 输入区（图片 + prompt + provider / model）
3. 结果预览
4. 配置和辅助信息

这个顺序的原因很简单：用户来这里不是为了浏览后台，而是为了把一张图做出来。

### 布局分析
- 如果把 settings 放到太远的地方，`provider` 配置会变成“开发者之后再说”的东西，和产品目标冲突。
- 如果把 result 区域放得太大，composer 会失去紧迫感，任务流会被拖慢。
- 如果把导航做得太复杂，会让它像一个桌面 dashboard，而不是一个创作面板。
- 主页面应该是 chat-like 的，但要围绕 Photoshop 面板的纵深和可见高度重做比例，而不是照搬 Gemini 的移动端 hero + shortcut chips 排列。
- 主页面的首要目标不是“对话感”，而是“任务连续性”：当前输入、历史任务、状态、结果、重试入口都必须一眼可见。

## Motion
- **Approach：** Intentional
- **Easing：** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration：** micro(80ms) short(160ms) medium(240ms) long(360ms)

### Motion Rules
- 动画只用来确认状态变化，不用来“卖弄效果”。
- 过渡要短、平、干净，不要 bounce、overshoot、玩具感 spring。
- panel 切换优先用 opacity + 4-6px translate。
- result reveal 可以用非常轻的 `scale(0.98 → 1.0)`。
- loading 只做轻微 pulse，不做 aggressive shimmer。
- 如果用户开启 `prefers-reduced-motion`，尽量减少位移动画和缩放效果。

### 动效分析
- 这个产品不是面向浏览娱乐内容的，用户在这里进行的是连续、密集的工作。
- 过多 motion 会让“任务提交 / 结果返回 / settings 保存”这些关键确认变得迟钝。
- 所以 motion 的角色是“安静地告诉我已经发生了什么”，而不是“让我感觉界面很活泼”。

## Component Patterns

### App Shell
- 深色背景、细边框、安静 header。
- 左侧放标题，中间放 provider / model 状态，右侧放 settings 入口。
- 不要做大 banner，也不要做过度品牌化的顶部区域。

### Task Stream / Chat History
- 每一条记录都应该更像 task record，而不是通用 chat bubble。
- 当前请求要是最强视觉层级，但不能压过结果。
- status label 必须可读，不能只靠颜色表达。
- 每条记录建议包含：缩略图、prompt 摘要、provider / model、状态、时间、必要的 actions。

### Composer
- prompt field、image attachment、provider / model 选择、primary action 应该并排组成一个明确的输入区。
- prompt 输入可以扩展，但必须有最大高度，不能无限撑高。
- send button 必须只有一个含义：发送当前任务。
- composer 里只保留当前 provider / model 的快速切换，不重复承载完整配置表单。

### Provider and Model Selection
- `provider` 是一等选择，但控件要尽量 compact。
- `model` 更适合 chip / segmented control，而不是一大段表单。
- 如果选项不可用，优先隐藏；如果必须显示，必须说明原因。

### Settings Home
- 这里是 provider 列表页，不是单个 provider 的编辑页。
- 每个 provider 行只显示最必要的信息：名称、启用状态、默认模型摘要、配置完整度、进入箭头。
- 这一层的职责是“挑选和进入”，不是“填写全部参数”。
- 这里的交互参考 Eagle 的 list + detail 结构，但视觉必须保持我们自己的深色、工具化风格。

### Provider Detail Page
- 点击某个 provider 后进入二级页面。
- 这个页面负责该 provider 的全部配置，包括连接信息、默认 model、该 provider 专属参数、能力说明和测试连接。
- 如果某些参数只对 image generation 有意义，就不要抽象成通用 AI SDK 表单。
- 如果某个 provider 支持的参数和别家完全不同，就让它在 detail page 里自然展开，不要强行统一成一套假相同的字段。
- 典型参数可能包括：image size、aspect ratio、seed、steps、guidance、output count、reference image、safety / moderation、输出格式等，但是否出现完全取决于 provider 能力。
- 保存应当回到 settings home，并保持当前 provider 的配置摘要即时更新。

### Settings Page
- provider 列表页和 provider detail page 之间要有清晰层级，不要把所有东西堆在一个长表单里。
- 连接信息、默认 model、默认参数要放在一起，但具体参数是否显示取决于 provider 能力。
- advanced fields 默认收起，避免把首屏塞满。
- 每次保存都要有清晰反馈，不要让用户猜是否成功。
- 支持导入 / 导出配置，但这应当是次级能力，不要压过 provider 编辑主任务。

### Settings Page Structure
- Home: provider list, add provider, status summary.
- Detail: provider identity, auth, models, generation params, test connection, reset / delete.
- Back navigation must preserve scroll position and unsaved-change warnings.

### Result Card
- 先预览，再 metadata。
- actions 至少包括：open、copy prompt、retry、save / download（如果 host 支持）。
- result image 要放在稍微更亮一点的 frame 上，让边界在 dark theme 中仍然清晰。

### Main Page Structure
- 顶部：轻量 header，只放 workspace / provider / model / settings 这类全局信息。
- 中部：主视觉区，默认是 task launcher / quick starts；有任务时则变成 task stream + result feed。
- 底部：sticky composer，永远是最主要的操作入口，像 Gemini 那样锚定在底部。
- 侧向：可折叠的 quick controls 或 secondary info，而不是大块固定 sidebar。
- 在 Photoshop 面板里，主页面要尽量把“开始一个新任务”与“查看上一个结果”维持在同一屏的可达范围内。
- 这张参考图最适合借鉴的是：大留白 + 底部 composer + 上方卡片入口的节奏感，而不是具体视觉比例。

### Main Page / Chat-Like Shell
- 这个页面应该“像聊天”，是因为它有连续任务记录和反复编辑的语义。
- 但它不应该长得像通用 LLM chat app，更不应该像文本对话工具。
- 我们需要的是 task stream：每条记录包含图片、prompt、provider、model、状态、结果和下一步动作。
- prompt composer 要更像图像创作台：输入文字、放图片、选 provider、选 model、发起任务。
- 任务执行期间，send button 置灰或切换为 loading，主页面上方显示 running task。
- 如果一次只允许一个任务，就让当前任务占住唯一的执行槽位，避免并发把界面和状态搞乱。
- 如果某个模块只是在模仿聊天产品的外观，但没有帮助图像任务完成，就应该删掉。

### Main Page Reference Fit
- 这张 Gemini 参考图**适合**我们的不是 hero 文案，而是下面三件事：
  1. 底部固定 composer。
  2. 上方留出大块主内容区承载任务与结果。
  3. 通过卡片 / chip 提供快速入口，而不是先把所有功能摊平成表单。
- 这张图**不适合直接照搬**的部分：
  1. 过于强的手机端 hero 比例。
  2. 过多偏通用助手的快捷按钮语义。
  3. 纯“欢迎页”式结构长期存在于主工作流中。
- 因为我们的目标是 image task flow，所以 quick starts 应该更像图像任务入口，而不是泛 AI 问答入口。

### Error and Empty States
- 空状态只说一件事，并给一个主动作。
- 错误状态要说清楚：发生了什么、用户下一步做什么、是否要回到 settings。
- 长任务应该显示 elapsed time。`v1` 默认不提供 `abandon / cancel`，除非 runtime lifecycle 先扩展出正式取消语义。

### 为什么要这样分组件
- 这个产品最怕把“UI 逻辑”做成一堆泛化组件，然后最后谁都不好看。
- 这些模式的目标不是重用率最高，而是让 task flow 一眼能懂。
- 组件越接近产品语言，后续扩展到更多 provider 时越不容易失控。

## Interaction States
- **Loading：** Skeleton rows + disabled submit。
- **Idle：** 页面可用，但没有任务提交；composer 是主焦点。
- **Submitting：** composer 锁定，立刻出现 status row，elapsed time 开始计时。
- **Running：** 显示进度、running badge，以及清晰的当前任务占用状态。
- **Success：** result 就地展示，后续 actions 在 hover / focus 时可见。
- **Failure：** job record 保留在流里，并提供直接恢复路径。
- **Partial：** 如果任务有结果但 host writeback 失败，要把 job result 和 host failure 分开显示。
- `Abandoned` 不属于当前 `v1` lifecycle；若后续引入取消能力，再补独立状态和交互。

### 状态分析
- 这个产品的难点不只是“能不能跑”，而是“在等结果时用户知道自己在等什么”。
- 长任务如果没有明确的 running 反馈和 elapsed time，用户会以为卡死。
- partial 状态很重要，因为 Photoshop host writeback 可能和 provider result 并不同步。

## Accessibility
- Keyboard navigation 必须覆盖 task flow 和 settings page 的所有动作。
- Focus ring 使用 primary accent，并留 2px offset。
- 最小 touch target：UXP 40px，web 44px。
- 正文对比度至少 4.5:1。
- 尊重 `prefers-reduced-motion`。
- 状态变化要通过 accessible live region 报告。
- 永远不要只靠颜色表达状态。

### 无障碍分析
- Photoshop 面板的用户经常在高密度场景里工作，键盘操作不是“加分项”，而是基本项。
- 状态和错误如果只靠色块表达，会在复杂任务流里非常容易漏看。
- 这种产品的无障碍不是装饰项，而是生产力的一部分。

## Content Tone
- 文案要短、准、冷静。
- 推荐使用动词：Generate、Save、Retry、Update。
- 不要用“magic”“unlock”“smart assistant”这类泛 AI 话术。
- 错误提示要告诉用户下一步，而不只是告诉他失败了。

### 文案策略
- UI 说明以中文为主，保持自然、直白。
- 技术名词、模型名、错误码、配置键保留英文，减少歧义。
- 如果一句话同时要服务用户和开发者，就优先让用户看懂，再保留必要的技术词。

## Creative Bets
1. **Dark-first instrument panel** - 这是对传统白底 SaaS 的明显偏离。代价是第一眼不“亲切”，但换来的是更强的 Photoshop 适配感和控制感。
2. **Distinctive heading type** - `Space Grotesk` 让产品有点性格，又不至于破坏阅读。代价是更主观，但回报是产品更像一个认真做事的工具。
3. **Mint primary accent** - 冷一点的 mint 比常见的紫色 AI 风格更克制，也更不容易和 Photoshop 自身的视觉系统打架。代价是少一点“AI 味”，但回报是更耐看、更稳定。

## Implementation Notes
- 这个设计系统同时适用于 `apps/web` 和 `apps/ps-uxp`。
- UXP 端可以更紧凑，但不能长出另一套语言。
- 尽量用 border、tone 和 spacing 组织层级，而不是依赖重 shadow。
- icon 风格要线性、克制、工具化。
- 任何新颜色必须先映射到 token，不要在组件里临时发明。
- 如果某个交互很难解释，先检查是不是层级和状态设计不清楚，而不是先加更多按钮。

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-23 | 初版设计系统落盘 | 为 Photoshop UXP 插件 + 可选 web harness 建立 dark-first 的 Precision Studio 语言，统一字体、颜色、间距、布局和 motion 规则。 |
| 2026-04-23 | 生命周期措辞校正 | 对齐当前实现计划：`v1` 不承诺 cancel / abandon，只保留 running / success / failure 等已锁定交互语义。 |
