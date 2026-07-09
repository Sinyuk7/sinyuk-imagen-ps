## Context

`docs/ENGINEERING_CONTEXT.md` 已经明确：`Toast` 是 shared app-surface primitive，`useNotice()` 只用于 inline 和 persistent notice。这条高层 contract 今天没有在 `StatusNotice` call site 上被贯彻，导致同一个 primitive 同时承载了四类不同语义：

- 显式用户动作失败或拒绝，例如 `refreshSuggestions()`、output selector save rejection。
- section 持续状态，例如 path info 不可用、billing stale warning。
- empty state 指引与 CTA。
- field/group 校验或 capability 组合不合法提示。

当前 10 个 `StatusNotice` host 已经暴露出三类结构性问题：

1. **lane 混用**：动作失败和 section 状态复用同一个 inline host，用户既看不出反馈持续性，也无法预测消息会出现在页内还是 toast。
2. **placement 失控**：`footer` 压扁 notice、settings flow 贴边、wrapper spacing 与局部 margin patch 混用，说明外部布局 ownership 不清楚。
3. **content semantics 漂移**：`detail` 永远按 diagnostic `<pre>` 渲染，但 call site 又把 empty-state prose 与 CTA 指引塞进这个槽里。

当前实现还有两个技术信号说明 contract 仍然半成品：

- `StatusNotice` 手写 `NoticeState`，没有复用 `createNoticeState()`，inline branch 容易与 shared `Notice` 默认值漂移。
- `announcement` 已经进入 public props，但 repo 里没有任何真实 caller 使用，说明 a11y announcement contract 还没有被 app-surface 真正采纳。

## Goals / Non-Goals

**Goals:**
- 把 `apps/app` 的反馈 surface 收敛成清晰的 lane：`Toast`、inline `StatusNotice`、`FieldHelp`、`empty-state slot`。
- 为 inline `StatusNotice` 定义明确的合法 host、非法 host 与 spacing ownership。
- 把 supporting prose 与 diagnostic `detail` 语义拆开，避免 typography、copy affordance 与 empty-state 指引继续混槽。
- 让后续 reviewer 可以机械地检查一个新 call site 属于哪条 lane，而不是靠逐页视觉巡检。
- 把本次 change 限定在 `apps/app` surface 内，沿用现有 harness-first 验证方式。

**Non-Goals:**
- 不重做 `ToastHost` 的视觉主题、队列策略或 motion 行为。
- 不做 repo-wide `settings-flow` 重构，也不要求所有 settings section 改成统一的新 layout primitive。
- 不修改 `packages/application`、`packages/core-engine` 或 `packages/providers` 的 runtime contract。
- 不在本次 change 中重写 provider/billing/domain 业务语义；这里只收敛 feedback surface。

## Decisions

### Decision: feedback surface 固定为四条 lane

`apps/app` 后续只允许以下四条反馈 lane：

| lane | 语义 | 典型位置 |
| --- | --- | --- |
| `Toast` | 显式用户动作的瞬时结果、失败、拒绝、恢复提示 | 页外 global toast |
| inline `StatusNotice` | section 持续状态、内容替代状态、持续 warning | section body 内 |
| `empty-state slot` | 区域无内容，需要解释与 CTA | list / selector / panel body 内的空态块 |
| `FieldHelp` | 单 field 或单 option group 的局部校验 | control 邻近区域 |

这四条 lane 必须互斥选用，不能再把动作失败、section 状态和 field 校验混进同一个 inline host。

备选方案：
- **继续保留单一 `StatusNotice` lane，再逐页补 if/else**：拒绝。它会让同一个错误在不同页面落到不同 surface，继续制造 drift。

### Decision: inline `StatusNotice` 只允许三种合法 host

inline `StatusNotice` 的合法 placement 收敛为三种：

1. `section replacement status`
   - 内容不可用、未加载完成或暂时无法展示时，notice 替代原本内容区域。
2. `section warning slot`
   - 内容仍可见，但需要一个持续存在的 warning / stale / blocking state。
3. `empty-state slot`
   - 区域为空，需要解释当前空态并提供 CTA 或下一步指引。

以下 host 一律非法：

- `footer`
- `toolbar`
- `action row`
- `heading row`
- `list row`

现有 10 个 host 按该 contract 收敛后，目标 lane 如下：

- `profile-models-page` 的 `error` host：拆出动作失败，改走 `Toast`。
- `profile-models-page` 的空列表 host：保留为 `empty-state slot`。
- `global-generation-settings-page` 的 output validation/loading host：动作拒绝改走 `Toast`。
- `global-generation-settings-page` 的 path info unavailable host：保留为 `section replacement status`。
- `global-generation-settings-page` 的 combined error section：保留为 `section warning slot`。
- `settings-detail-page` 的 billing stale host：保留为 `section warning slot`。
- `provider-settings-sections` 的 selector empty-state：保留为 `empty-state slot`。
- `model-configuration-page` 的 normalization warning：保留为 `section warning slot`。
- `model-configuration-page` 的 module validation host：保留为 `section warning slot`，前提是它继续表示跨多个 option group 的组合状态，而不是单 field 错误。
- `model-configuration-page` footer error：移出 `footer`，改走 `Toast` 或合法 section host。

备选方案：
- **允许 `footer` 压扁复用 inline notice**：拒绝。`footer` 天生是 compact action host，不适合承载可复制、可扩展的持续状态块。

### Decision: spacing ownership 属于 host slot，不属于 `StatusNotice`

本次 change 不给 `.status-notice` 增加全局默认外边距。外部 spacing 归属固定如下：

- `section replacement status`：由替代内容的 section body wrapper 拥有。
- `section warning slot`：由 warning slot wrapper 拥有。
- `empty-state slot`：由 empty-state wrapper 拥有。
- 已经拥有 spacing 的现有 wrapper（例如 `billing-error`）继续保留其 ownership。

原因：

- 现有 host 已经有 `.billing-error`、`.test-area .status-notice`、`settings-detail-footer-actions .status-notice` 等局部规则；给组件本体增加全局 margin 会立刻引入双重 spacing 或覆盖冲突。
- 用户已经明确拒绝“为了一个组件重做全部页面”。因此不能用 repo-wide `settings-flow` 重构解决当前问题。
- 真正需要的是 **placement contract**，不是让组件本体猜测自己处在什么上下文里。

实现层面允许引入少量 shared host class / wrapper（例如 section warning slot、empty-state slot），但只覆盖当前 10 个 host 与未来新增 call site，不追求全页布局统一改造。

备选方案：
- **给 `.status-notice` 增加组件级上下 margin**：拒绝。会与现有 wrapper spacing 叠加，并继续掩盖 placement ownership 不清的问题。
- **用 repo-wide `settings-flow` 强制所有 settings section 重排**：当前不采用。范围过大，且与用户要求的最小变更面不一致。

### Decision: `message`、supporting prose 与 diagnostic `detail` 必须分槽

`StatusNotice` 的内容语义固定为三层：

- `message`：主状态，一行或多行短文本。
- supporting prose：辅助说明、empty-state 指引、CTA 上下文。
- diagnostic `detail`：原始 provider/runtime error、机器导向文本、可复制详情。

其中只有 diagnostic `detail` 允许绑定 mono typography、`copyText`、以及更接近 log/error 的呈现方式。supporting prose 禁止复用 diagnostic `detail` 槽。

这条决策直接修复当前两类错误：

- `profile-models-page` 空列表提示把 `modelConfigurationSaveHint` 塞进 diagnostic `detail`。
- `provider-settings-sections` 的 empty-state CTA 把“先创建 model configuration”这类 prose 走成 `<pre>`。

备选方案：
- **继续复用 `detail`，只在 CSS 层弱化 `<pre>` 风格**：拒绝。即使视觉变轻，diagnostic 与 prose 混槽的问题仍然存在，copyability 和 future API 也会继续模糊。

### Decision: `StatusNotice` 必须作为 semantic wrapper 依附 shared `Notice`

`StatusNotice` 继续作为 inline feedback primitive 存在，但它不能只是一个把底层类型重新 export 的别名层。实现约束为：

- inline branch 使用 shared `Notice` 的 canonical state builder（`createNoticeState()` 或同等级 shared helper），避免默认 icon、role、aria-live、detail/copy 行为漂移。
- public props 只暴露 `StatusNotice` 需要的 semantic surface，不继续鼓励 call site 直接依赖底层 `NoticeState`/`NoticeAction` 形状。
- `announcement` 保留“显式 opt-in 才创建 live region”的语义；如果实现阶段确认没有任何 caller 需要它，应优先 internalize 或删除，而不是维持一个没有真实场景的 public prop。

备选方案：
- **保持当前 wrapper 极薄、继续手写 `NoticeState`**：拒绝。这样每次 shared `Notice` contract 演进时，inline branch 都要手工追一遍默认值。

## Risks / Trade-offs

- **[Risk] 把部分现有 inline error 改成 `Toast` 会改变消息持续时间** → Mitigation: 只迁移动作结果类反馈；section 持续状态仍保留 inline host。
- **[Risk] supporting prose / diagnostic `detail` 分槽会牵动多个 call site 文案与测试** → Mitigation: 只覆盖当前 10 个 host，并为每类 lane 建 focused UI/harness 断言。
- **[Risk] `model-configuration-page` 的 module validation 介于 section warning 与 local validation 之间** → Mitigation: 保留“跨多个 option group 的组合状态可用 section warning”的规则；只有单 field / 单 group 错误才下沉到 `FieldHelp`。
- **[Risk] host-owned spacing 需要少量 wrapper class，短期会出现一部分 call site 改动** → Mitigation: 将 shared slot/wrapper 限制在当前 matrix 覆盖的 host，不做整页 layout 改造。

## Migration Plan

1. 先落地 shared feedback surface contract：更新 `StatusNotice`/`Notice` semantic surface，并准备 section warning / empty-state host wrappers。
2. 迁移非法或 lane 错误的 host：优先清理 `model-configuration-page` footer host，以及 `profile-models-page`、`global-generation-settings-page` 中应改走 `Toast` 的动作反馈。
3. 迁移剩余合法 inline host：为 empty-state 与 section warning host 接入明确 wrapper，并完成 supporting prose / diagnostic `detail` 分槽。
4. 补齐 focused 测试与权威文档更新，确保未来新增 call site 能按 contract 审查。

## Open Questions

- 无。当前 contract 已足够进入实现；剩余差异属于 call site 落位与 API 收口执行问题，而不是方案方向问题。
