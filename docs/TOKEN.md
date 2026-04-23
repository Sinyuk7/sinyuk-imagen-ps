# Token System — Sinyuk Imagen PS

## 作用
这个文件定义项目的实现级 tokens。`DESIGN.md` 负责设计方向、信息结构和体验原则；`TOKEN.md` 负责可直接落地到 CSS / component theme / Spectrum mapping 的具体数值。

## 使用原则
- 所有 UI 组件优先使用这里定义的 token，不要在组件里临时发明颜色、字号或间距。
- `web` 和 `UXP` 共用同一套 token 命名，避免宿主之间出现两套视觉系统。
- `UXP` 端尽量尊重 Spectrum 组件默认能力，应用层 token 只负责 app shell、任务流和少量品牌色。
- 当 `DESIGN.md` 与本文件冲突时，以 `DESIGN.md` 的设计决策为准；当实现需要具体数值时，以本文件为准。

## Color Tokens
项目默认是 dark-first。颜色命名按语义分层，而不是按“浅灰 1/2/3”随意堆叠。

### Foundation
| Token | Value | Usage |
|---|---:|---|
| `color.bg` | `#0D1117` | 全局背景 |
| `color.surface.1` | `#151A22` | 基础面板背景 |
| `color.surface.2` | `#1C2330` | 提升一层的卡片/分组 |
| `color.surface.3` | `#242C3B` | 更强调的容器、弹层 |
| `color.border` | `#2E3748` | 常规边框 |
| `color.border.strong` | `#3A4457` | 强边框、分割强调 |
| `color.text.primary` | `#E9EDF4` | 主要文字 |
| `color.text.secondary` | `#A6B0BF` | 次要文字、说明 |
| `color.text.tertiary` | `#738093` | 辅助文字、时间戳 |
| `color.text.inverse` | `#0D1117` | 浅底色上的反转文字 |
| `color.overlay.scrim` | `rgba(13,17,23,0.72)` | 弹层遮罩 |
| `color.overlay.soft` | `rgba(255,255,255,0.04)` | 轻微悬浮高亮 |

### Brand / Action
| Token | Value | Usage |
|---|---:|---|
| `color.primary` | `#78E7C0` | 主操作、确认、成功型 action |
| `color.primary.hover` | `#8AF0CC` | 主按钮 hover |
| `color.primary.active` | `#58D9AF` | 主按钮按下 |
| `color.primary.soft` | `rgba(120,231,192,0.14)` | 主色弱背景、selected state |
| `color.secondary` | `#67B7FF` | 辅助信息、次级 action |
| `color.secondary.soft` | `rgba(103,183,255,0.14)` | 次级高亮背景 |

### Semantic
| Token | Value | Usage |
|---|---:|---|
| `color.success` | `#63D48F` | 成功、已连接、完成 |
| `color.success.soft` | `rgba(99,212,143,0.14)` | 成功弱背景 |
| `color.warning` | `#F2B84B` | 警告、需要注意 |
| `color.warning.soft` | `rgba(242,184,75,0.14)` | 警告弱背景 |
| `color.error` | `#F26D6D` | 错误、失败、危险操作 |
| `color.error.soft` | `rgba(242,109,109,0.14)` | 错误弱背景 |
| `color.info` | `#67B7FF` | 信息、说明、帮助提示 |
| `color.info.soft` | `rgba(103,183,255,0.14)` | 信息弱背景 |

### State
| Token | Value | Usage |
|---|---:|---|
| `color.state.hover` | `rgba(255,255,255,0.05)` | 非强调 hover |
| `color.state.active` | `rgba(255,255,255,0.09)` | 非强调 active |
| `color.state.disabled` | `rgba(233,237,244,0.36)` | disabled 文字 |
| `color.state.disabled.surface` | `rgba(255,255,255,0.05)` | disabled 控件背景 |
| `color.focus.ring` | `#78E7C0` | focus ring |

## Typography Tokens
### Font Families
| Token | Value | Usage |
|---|---|---|
| `font.family.display` | `"Space Grotesk", sans-serif` | 标题、空状态、页面名 |
| `font.family.body` | `"IBM Plex Sans", sans-serif` | 正文、表单、说明 |
| `font.family.ui` | `"IBM Plex Sans", sans-serif` | button、label、metadata |
| `font.family.mono` | `"IBM Plex Mono", monospace` | 数值、model id、时间、日志 |

### Font Sizes
| Token | Value | Line Height | Usage |
|---|---:|---:|---|
| `font.size.display.1` | 32px | 38px | 关键标题 |
| `font.size.display.2` | 24px | 30px | 页面标题、section hero |
| `font.size.section` | 18px | 24px | 分组标题 |
| `font.size.body` | 14px | 20px | 常规正文 |
| `font.size.body.strong` | 14px | 20px | 强调正文 |
| `font.size.label` | 12px | 16px | label、辅助信息 |
| `font.size.caption` | 12px | 16px | 时间戳、说明 |
| `font.size.mono` | 13px | 18px | code、配置键、状态值 |

### Font Weights
| Token | Value | Usage |
|---|---:|---|
| `font.weight.regular` | 400 | 正文 |
| `font.weight.medium` | 500 | label、metadata |
| `font.weight.semibold` | 600 | 标题、按钮 |

## Spacing Tokens
Spacing 使用 8px 为基础单位，UXP 端偏紧，web 端偏舒展，但 token 命名保持一致。

| Token | Value | Usage |
|---|---:|---|
| `space.1` | 4px | 极小间距 |
| `space.2` | 8px | 默认间距 |
| `space.3` | 12px | 相关元素间距 |
| `space.4` | 16px | 默认内边距 |
| `space.5` | 24px | 模块间距 |
| `space.6` | 32px | 大分组间距 |
| `space.7` | 48px | 区域分隔 |
| `space.8` | 64px | 页面级留白 |

### Spacing Rules
- `composer` 内部常用 `space.3` 到 `space.4`
- card 内边距默认 `space.4`
- settings 列表条目默认 `space.3`
- 页面大区块之间默认 `space.5`

## Radius Tokens
| Token | Value | Usage |
|---|---:|---|
| `radius.sm` | 8px | 小按钮、轻量输入 |
| `radius.md` | 12px | 默认卡片、字段 |
| `radius.lg` | 16px | 重要卡片、结果区 |
| `radius.xl` | 20px | 主容器 |
| `radius.full` | 9999px | pill / chip |

## Border Tokens
| Token | Value | Usage |
|---|---:|---|
| `border.width.hairline` | 1px | 常规分隔 |
| `border.width.focus` | 2px | focus ring / active emphasis |
| `border.width.emphasis` | 1px | 强调边框 |

## Elevation Tokens
这个产品偏好用 `tone + border` 表达层级，阴影只做很轻的补充。

| Token | Value | Usage |
|---|---:|---|
| `shadow.none` | `none` | 默认 |
| `shadow.soft` | `0 8px 24px rgba(0,0,0,0.24)` | 浮层、弹出菜单 |
| `shadow.panel` | `0 16px 40px rgba(0,0,0,0.32)` | 二级页面、重要 overlay |

## Motion Tokens
动效只服务状态确认，不服务装饰。

| Token | Value | Usage |
|---|---:|---|
| `motion.duration.micro` | 80ms | hover / state change |
| `motion.duration.short` | 160ms | small panel transitions |
| `motion.duration.medium` | 240ms | modal / drawer |
| `motion.duration.long` | 360ms | result reveal |
| `motion.easing.enter` | `cubic-bezier(0.2, 0, 0, 1)` | 进入 |
| `motion.easing.exit` | `cubic-bezier(0.4, 0, 1, 1)` | 退出 |
| `motion.easing.move` | `cubic-bezier(0.2, 0, 0.2, 1)` | 移动 |

## Layout Tokens
| Token | Value | Usage |
|---|---:|---|
| `layout.maxWidth.web` | 1280px | web 主内容宽度上限 |
| `layout.panel.minWidth` | 240px | Photoshop 面板最小安全宽度 |
| `layout.panel.padding` | 16px | 面板默认内边距 |
| `layout.panel.gap` | 12px | 面板内组件间距 |
| `layout.composer.minHeight` | 88px | composer 最小高度 |
| `layout.composer.maxHeight` | 160px | composer 最大高度 |
| `layout.taskCard.minHeight` | 72px | task row 最小高度 |
| `layout.preview.aspectRatio` | `1 / 1` | 默认预览比例，可被 provider 覆盖 |

## Interaction Tokens
| Token | Value | Usage |
|---|---:|---|
| `interaction.focusOffset` | 2px | focus ring 偏移 |
| `interaction.touchTarget.uxp` | 40px | UXP 最小可点尺寸 |
| `interaction.touchTarget.web` | 44px | web 最小可点尺寸 |
| `interaction.disabled.opacity` | 0.38 | disabled 透明度 |
| `interaction.loading.opacity` | 0.72 | loading 状态透明度 |

## Component Tokens
这些 token 用于保持关键组件的一致性。

### App Shell
| Token | Value | Usage |
|---|---:|---|
| `component.appShell.padding` | 16px | 根容器 padding |
| `component.appShell.headerHeight` | 48px | 顶部轻量 header |
| `component.appShell.footerGap` | 12px | 底部 composer 外间距 |

### Task Stream
| Token | Value | Usage |
|---|---:|---|
| `component.taskRow.padding` | 12px 14px | 任务条目内边距 |
| `component.taskRow.gap` | 10px | 缩略图 / 文本 / 状态间距 |
| `component.taskRow.borderRadius` | 12px | 任务条目圆角 |
| `component.taskRow.minHeight` | 72px | 任务条目最小高度 |

### Composer
| Token | Value | Usage |
|---|---:|---|
| `component.composer.padding` | 16px | composer 内边距 |
| `component.composer.gap` | 12px | 输入块间距 |
| `component.composer.radius` | 20px | composer 容器圆角 |
| `component.composer.primaryButtonHeight` | 40px | 发送按钮高度 |

### Settings
| Token | Value | Usage |
|---|---:|---|
| `component.settings.rowHeight` | 56px | provider 列表条目 |
| `component.settings.detailGap` | 16px | detail page 模块间距 |
| `component.settings.sectionGap` | 24px | settings section 间距 |

### Result
| Token | Value | Usage |
|---|---:|---|
| `component.result.borderRadius` | 16px | 结果卡片圆角 |
| `component.result.framePadding` | 12px | 结果图 frame padding |
| `component.result.metaGap` | 8px | metadata 间距 |

## Semantic Mapping
这些语义层 token 方便组件直接引用，不要再回退到裸色值。

| Token | Map To | Usage |
|---|---|---|
| `semantic.action.primary` | `color.primary` | 主按钮 |
| `semantic.action.secondary` | `color.secondary` | 次按钮 / link |
| `semantic.surface.default` | `color.surface.1` | 默认卡片 |
| `semantic.surface.raised` | `color.surface.2` | 提升层 |
| `semantic.surface.overlay` | `color.surface.3` | 浮层 |
| `semantic.text.primary` | `color.text.primary` | 正文 |
| `semantic.text.muted` | `color.text.secondary` | 说明 |
| `semantic.text.subtle` | `color.text.tertiary` | 时间戳 / 辅助 |
| `semantic.status.success` | `color.success` | 成功 |
| `semantic.status.warning` | `color.warning` | 警告 |
| `semantic.status.error` | `color.error` | 错误 |
| `semantic.status.info` | `color.info` | 信息 |

## Token Governance
- 不允许组件直接写入新颜色，必须先映射到 `TOKEN.md`。
- 如果某个 token 的用途开始分裂，就拆成语义更清晰的新 token，而不是在实现里临时覆盖。
- Web 和 UXP 不要各自发明不同命名。
- 若需引入 Spectrum / Adobe 官方组件默认值，优先当作组件内建 token，不要重复复制成 app token。

## Implementation Note
如果后续要把这些 token 落成 CSS variables，建议命名保持一致，例如：

```css
:root {
  --color-bg: #0d1117;
  --color-surface-1: #151a22;
  --color-surface-2: #1c2330;
  --color-surface-3: #242c3b;
  --color-border: #2e3748;
  --color-primary: #78e7c0;
  --space-4: 16px;
  --radius-md: 12px;
  --motion-duration-short: 160ms;
}
```

