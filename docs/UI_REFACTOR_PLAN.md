# Composer 输入面板简化计划

## 目标

把首页底部 Composer 改成以提示词为中心的简洁输入面板。附件、蒙版、Photoshop 捕获、模型与生成参数、校验和提交继续使用现有状态及业务 handler；本次改变参数区的展示方式和输入区 UI，不重写生成规则。

默认只显示提示词、必要的可操作反馈和稳定的操作栏。附件存在时才显示附件缩略条。模型和生成参数默认隐藏，由操作栏上的**唯一设置图标**统一展开或收起。设置收起时可查看当前实际生效的配置摘要。

## 代码范围与边界

- 主要 UI 所有者：`apps/app/src/shared/ui/pages/main-page.tsx`。
- 主要样式所有者：`apps/app/src/shared/ui/styles/composer.ts` 及确有需要时的 `responsive.ts`；通过 `panel-css.ts` 汇总。
- 复用现有 `IconButton`、`Button`、`ComposerSelect`、`ComposerParameterField`、提示组件、动效、国际化和无障碍模式。设置摘要统一使用现有 `IconButton` 的 tooltip/label 交互，不另造一套 popover 行为。
- `IconButton` 目前将 tooltip 文案传入 Spectrum `ActionButton` 的 `label`、`title` 和 `data-tooltip-placement`。设置摘要应作为可更新的文案接入这一现有交互；它不是独立占位区域，也不是点击后才出现的参数面板。
- 保持 provider/workspace 状态、参数 schema、生成 payload、捕获与蒙版 host adapter 的所有权和实现不变。
- 测试归属 app UI/Chrome 确定性 harness。若没有覆盖真实 Composer 结构的窄 harness，再新增最小测试入口；避免把本计划扩展为会话卡片、Provider 设置页或 Photoshop host 的全面重构。

## 默认面板和控件行为

提示词输入区保持主要视觉层级。底部操作栏固定为左右两组，附件增删不得改变控件的存在、顺序或左右归属：

```text
[ 添加附件 ] [ 蒙版 ] [ 捕获图层/选区 ]                 [ 设置 ] [ 运行 <平台对应的快捷键> ]
```

- **添加附件**：沿用现有入口及附件菜单，继续提供 Photoshop 图层选择和本机文件添加。必须保留明确的无障碍名称，并沿用现有 tooltip 交互。
- **蒙版**：沿用现有开关、禁用条件、状态和处理逻辑。图标可以在本次 UI 改版中暂用占位图形，但必须保留表达蒙版功能的无障碍名称及现有 tooltip；不得因占位图标而变成无名按钮。
- **捕获按钮的可见文案**：使用清楚、简短、直接描述行为的中文，例如“捕获图层/选区”；不要以英文 `Capture` 作为文案或实现示例。代码中的实际捕获规则是：当前文档有选区时捕获选区，否则捕获当前图层（返回结果的 `sourceKind` 分别为 `selection` 或 `layer`）。因此不能把行为描述成始终只捕获图层。Tooltip 和无障碍描述明确说明“捕获当前 Photoshop 图层或选区”，并保留忙碌保护、原错误反馈和附件创建行为。若实现时 handler 规则发生变化，应以真实 handler 行为重新确定可见文案和描述。
- **设置按钮**：图标按钮紧邻 Run，是模型、模板和全部生成参数的唯一显示入口。按钮无障碍名称保持稳定、清晰（如“生成设置”）；当前配置摘要只能作为补充描述及视觉 Tooltip 内容，不能替代按钮名称。先使用现有 `IconButton` 已支持的独立 `aria-label` 与 tooltip 属性分别承载名称和摘要。若现有属性映射/渲染不能保证这两种语义互不覆盖，再评估对 `IconButton` 的最小兼容扩展；不得因此引入第二套 Tooltip 或自定义 Popover。通过 `aria-expanded` / `aria-controls` 表达展开状态。
- **运行按钮**：使用文字“运行”及可见的提交快捷键提示，不再使用含义不清的纯发送图标。点击按钮和快捷键共用 `handleSend`，保留 readiness 校验、IME 输入保护和现有提交路径。
- **快捷键提示**：插件同时面向 macOS 和 Windows，不能固定显示单一平台的符号，也不能同时显示两种快捷键。运行时按操作系统呈现对应组合键（macOS `⌘↵`，Windows `Ctrl↵`），并在按键 handler 中实现相同组合键；确认 Windows/macOS 的检测方式兼容 Chrome harness 与 UXP。普通 Enter 用于在多行提示词中换行，不再提交；IME 确认输入不得误触发组合键提交。按钮点击与平台组合键提交不得分叉到不同业务路径。
- **附件缩略条**：零附件时不渲染条带、空列表或占位容器。有一个及以上附件时在操作栏上方显示附件条目和移除操作。每个条目样式简洁统一、宽度相同，包含图片缩略图、受长度限制的附件标题、可选的必要补充信息，以及删除按钮；长标题单行截断/省略，不挤压缩略图和删除按钮。删除与附件状态无关的多余 hover 装饰、复杂动效或冗余状态呈现，保留有助于识别或操作的必要反馈。添加/移除附件不得改变 Add、Mask、捕获、设置和运行控件的结构。

## 设置区与有效配置摘要

- 首次进入时设置区收起。收起时不常驻显示模型、Prompt template、比例、尺寸、Provider catalog 参数或当前配置摘要行。
- 点击设置图标展开**全部**可用参数；再次点击收起整个参数区。移除 “Show advanced inputs” / “Hide advanced inputs” 入口及其单独状态。原先归为 advanced 的 Provider 参数，与模型、Prompt template、比例和尺寸由同一个展开状态控制。
- 原有选项、值、默认值解析、禁用状态、参数更新 handler 均保持不变。收起/展开不重置选择、不触发生成、不改写 workspace 状态。
- 收起状态下，悬停或键盘焦点到设置图标时，tooltip 显示**当前实际生效的**模型、Prompt template、比例和尺寸。模板须显示当前选中模板的可读名称或标签，不能只显示内部 ID；过长名称截断并以省略号结尾，摘要总长控制在适合小面板的少量文字内。显示 label/value，而非只显示无标签的数值；缺少的字段省略，不用默认值冒充当前生效值。来源应是当前选中的 model、`currentTemplate` 及 `ratioSizeProjection` 等与实际请求一致的投影。
- 按钮的稳定无障碍名称保持为“生成设置”（或对应本地化文案）；动态摘要作为补充描述/Tooltip，不覆盖或拼接进按钮名称。验证 accessibility tree/ARIA 属性，而不只依赖视觉 Tooltip 检查。
- 参数改变后摘要随 React 当前状态立即更新，不等待生成、刷新或重新打开页面。
- 点击设置图标打开完整参数区时，Tooltip 必须停止显示摘要；设置展开期间，hover/focus 不再出现会遮挡参数控件的摘要浮层。不能假设改变布局就会自动关闭 Tooltip，必须验证展开状态确实控制了提示显示。离开 Tooltip 触发区域或焦点离开后摘要消失，不占据任何 Composer 布局空间。
- Tooltip 使用现有 `IconButton`/Spectrum ActionButton tooltip 机制，通过动态文本展示多项摘要；不得混用 Tooltip 与自定义 Popover，也不得创建常驻摘要行。实现验证必须覆盖：指针悬停可读到摘要；键盘焦点可获得必要辅助信息；点击展开后 Tooltip 关闭；鼠标离开及焦点移出后摘要不再显示；参数变化后下一次查看展示最新值；稳定按钮名称未被摘要替换。上述行为须在 Chrome harness 和受支持的 UXP 环境/契约内验证。如果现有机制无法可靠显示受限长度的动态摘要或满足可访问性，应先验证兼容方案，再选择单一呈现机制并同步修订本计划，不得未经验证混搭。
- 展开面板和提示交互须适配 compact、regular、wide 三种面板宽度及项目支持的 UXP CSS。

## 状态、错误和执行保护的显示位置

删除的是默认视图里的冗余常驻状态装饰，不是运行状态、保护条件或错误处理逻辑。实现时按以下规则安置：

| 情况 | 默认面板的呈现位置/行为 |
| --- | --- |
| 当前配置摘要 | 只在设置图标收起时的 hover/focus tooltip 出现；无常驻摘要行 |
| readiness / 不能运行 | 保留 `canSend` 和 `handleSend` 守卫；Run 按钮 disabled 时通过 tooltip 或无障碍描述说明原因，若用户仍触发提交，沿用现有 toast 反馈；移除持续占位的 footer readiness 行。实现前验证禁用按钮的 Tooltip 是否可由鼠标触发、其禁用原因是否能被辅助技术读取。若禁用态无法触发 Tooltip，优先采用既有可访问描述能力；不要未经验证新增常驻状态行 |
| 正在生成 | 沿用会话/任务区域对运行任务的呈现；Composer 不添加重复的“发送中”等常驻标签。按钮/handler 必须保留防重复提交行为；现有实现无该保护时，在 UI handler 边界补齐并测试，不改变 workspace 执行状态模型 |
| 捕获进行中 | 捕获按钮自身显示忙碌/不可重复触发状态，保留 `captureInFlight` 守卫；不增加独立状态横幅 |
| 捕获失败、蒙版失败 | 保留现有 toast/错误恢复；蒙版错误时保留当前重试入口。不得为视觉简化而吞掉错误 |
| 图像输入与所选模型冲突 | 在 Composer 主输入区内保留当前可见冲突提示及“选择兼容模型/移除图像”恢复操作；不可只藏在设置区或 tooltip |
| 其他 workspace notices | 逐项确认其是否要求用户采取行动。可行动 notice 留在主输入区可见位置；纯信息、重复且无操作项的 notice 才能从默认视图移除，并须在测试中覆盖其决策 |

除上述呈现变化，不改 readiness 判定、捕获/蒙版状态机、错误分类、toast 类型或业务执行保护。如果检查发现某个状态目前没有可靠呈现或重复提交保护，应在本次 UI 边界明确修复并增加确定性测试，不得悄悄删除原保护。

## 实施顺序

1. **确认真实契约和现有组件行为**：以 `captureActiveImage` 的 `sourceKind` 规则为捕获命名依据；确认 `IconButton` 的独立 `aria-label`、tooltip 文案与组件属性映射；验证 tooltip 对动态/截断文案、hover/focus/离开/展开时关闭、辅助技术和 UXP 的实际行为；验证禁用 Run 的原因说明可访问；确认运行态展示与防重复提交的现状；确认 OS 检测在 Chrome 与 UXP 的边界。遇到组件能力缺口，先形成可测的最小方案再动 UI。
2. **重排附件与操作栏**：让缩略条仅在附件非空时渲染；保持左右操作组结构稳定；加入“捕获图层/选区”文字控件以及文字 Run 和平台相关快捷键提示，接回原 handler 和守卫。
3. **统一参数展开状态**：用单一 settings-open 状态控制模型、Prompt template、比例、尺寸和所有 Provider 参数；删除高级参数独立开关。校验折叠不丢值。
4. **加入设置图标配置摘要**：摘要包含模型、Prompt template、比例、尺寸；只在收起时通过现有 tooltip 交互呈现；点击展开时立即关闭摘要，展开期间不显示摘要。验证配置变化立即反映。
5. **清理默认视图状态装饰并本地化**：移除常驻摘要及冗余 readiness/生成状态行；按上表保留冲突、可行动 notice、错误恢复和任务区状态。新增/修改的用户文案进入 `i18n/messages.ts` 英文与中文消息，不在页面中硬编码。
6. **清理旧实现并整理结构**：在新交互落地后搜索 Composer 及其资源引用，删除已废弃的 `advancedParametersOpen`、Show/Hide advanced 文案与测试标识、旧常驻配置摘要渲染、对应 CSS 选择器和不再使用的本地化消息/样式 token/图标资源；整理附件条、操作栏、附件条目和参数区的 JSX 层级及样式分组，移除重复或失效的规则以及附件条目不再需要的多余 hover/动效样式。逐项用全仓引用搜索确认资源已无其他使用者后再删除；共享控件或业务代码若仍被其他页面使用则保留。清理不得改变 handler、状态所有权或数据协议。完成后运行测试、类型检查和 policy，确保没有死引用或误删。
7. **补确定性覆盖和视觉场景**：覆盖无/有附件、统一等宽附件项及长标题截断、参数区收起/展开、模板及参数摘要、Tooltip hover/focus/离开/展开关闭/最新值/名称分离、禁用 Run 原因的可访问性、OS 快捷键映射与普通 Enter 换行、readiness/error/recovery、重复提交保护；在 Chrome harness 评估 compact/regular/wide 及 UXP CSS 合同，并确认清理后无旧入口、旧摘要或失效样式残留。

## Harness 与验证命令

先用 fake workspace/provider 输入验证状态和交互，不依赖 Photoshop、UXP Developer Tools、凭证或付费网络。

开发过程中的聚焦验证：

```bash
pnpm --filter @imagen-ps/app test:ui
pnpm --filter @imagen-ps/app test:chrome
pnpm --filter @imagen-ps/app test:visual
```

聚焦套件通过后运行仓库门禁：

```bash
pnpm validate
```

按 `docs/TESTING.md` 规定的 viewport 和证据流程使用 Chrome visual harness，检查 compact、regular、wide；覆盖无附件、有附件、参数收起和展开。只有按仓库的基线更新流程审阅后才保存/更新截图基线。`build:uxp` 只证明编译；按 `apps/app/AGENTS.md`，真实 Photoshop/UXP 验收由用户负责，agent 不主动打开或操作 Photoshop/UXP。

## 验收标准

- [ ] 无附件时没有空缩略条、空列表或附件占位区域；有附件时只在操作栏上方出现缩略条，移除/添加不改变操作栏结构。
- [ ] 左侧依次提供添加附件、蒙版、明确命名的捕获文字按钮；捕获规则及反馈仍与真实 handler 一致，tooltip/无障碍描述清楚说明捕获当前 Photoshop 图层或选区。
- [ ] 添加、蒙版和设置图标按钮均有明确无障碍名称并沿用现有 tooltip 交互；蒙版占位图标不影响其名称。
- [ ] 右侧设置图标与文字“运行”按钮并列。Run 的快捷键提示按 macOS/Windows 对应显示，鼠标点击及快捷键走相同 `handleSend` 且保持 readiness、IME 和重复触发保护。
- [ ] 普通 Enter 只在提示词中换行；macOS `⌘↵`、Windows `Ctrl↵` 提交，按钮只显示当前平台的快捷键提示。
- [ ] 默认状态隐藏模型、Prompt template、比例、尺寸、Provider catalog 参数及常驻配置摘要。
- [ ] 一个设置图标控制全部参数；点击展开、再次点击收起；页面不再存在 “Show advanced inputs” 或其他独立参数入口。
- [ ] 设置按钮的无障碍名称始终明确且稳定；动态配置摘要仅作为补充描述/Tooltip，accessibility tree 中不会取代按钮名称。
- [ ] 设置收起时 hover/focus 摘要显示当前模型、当前模板可读名称、比例和尺寸；模板长名称省略截断；参数改变后下一次查看立即显示新值；缺失值不伪装成实际值。
- [ ] Tooltip 覆盖 hover、focus、指针离开、焦点移出及设置展开关闭行为；设置展开期间不出现摘要浮层且不遮挡参数；Tooltip 不留布局空间。Chrome harness 与受支持的 UXP 契约验证一致。
- [ ] Run 禁用时的原因可由适用输入方式及辅助技术获得；若禁用态不能触发 Tooltip，则使用可访问描述而不增加默认常驻提示行。
- [ ] 附件条目等宽且包含缩略图、限长标题、可选必要信息和删除按钮；长标题截断不挤压其他内容；多余 hover/动效被清理，附件识别与删除仍清晰可用。
- [ ] 常驻 readiness/生成状态装饰被移除，但 Run 的禁用说明、toast、捕获 busy/error、蒙版重试、图像冲突恢复、可行动 notice、任务区运行状态和执行保护均符合上方位置规则。
- [ ] 已清理旧参数展开状态、旧“高级输入”入口及文案、旧常驻摘要、失效 Composer CSS/本地化/图标资源和废弃测试标识；全仓引用检查证明已删资源没有其他消费者，共享业务实现未被误删。
- [ ] Composer JSX 与样式结构已整理；没有重复/失效规则或 dead reference，清理后的测试、类型检查和 policy 均通过。
- [ ] Chrome harness 在 compact、regular、wide 下通过视觉审阅；共享 UI 的 UXP CSS policy 检查通过。
- [ ] 聚焦测试和 `pnpm validate` 通过。

## 停止与重新定界条件

- 若 UI 修改要求改变 provider 参数协议、生成 payload、mask/capture host adapter 或跨包状态所有权，先停止并重新确定范围。
- 若要移除某个可行动错误或提示，必须先明确等效且可访问的恢复入口，并以测试证明。
- 不引入页面级原生控件、未经批准的视觉样式、不支持的 CSS 或硬编码本地化文案。
- 不把真实 Photoshop/UXP 交互作为 agent 验证步骤。

## 文档归属

本文件记录 Composer 简化重构的稳定交互契约、实施边界和验收门槛。不要在这里追加执行日志、原始测试输出、临时截图或一次性调查过程；只有仓库级 harness 流程变化时才同步修改 `docs/TESTING.md`。
