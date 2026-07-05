Status: draft
Authority: current user request
Owner: `packages/application`, `apps/app`
Created: 2026-07-05

# 模型配置 UI

## Context Docs（上下文文档）

- `AGENTS.md`：当前状态优先、harness-first Loop 合约；root active Loop 当前为 `none`。
- `docs/agent/LOOP.md`：Loop 元数据、scope、validation、stop rule、completion report 规则。
- `docs/TESTING.md`：mock-only 开发门禁和最终 `pnpm validate`。
- `packages/application/AGENTS.md`：Application 负责 profile/model 协调；不能引入 React/DOM/host IO。
- `apps/app/AGENTS.md`：App 负责 shared React UI、i18n、UXP-safe CSS、host adapters、popup/navigation contract。
- `docs/ENGINEERING_CONTEXT.md`：model discovery/execution 边界：discovery facts、user configs、official presets、`request.model`、`requestStrategyId`。

当前代码探针：

- `packages/application/src/commands/types.ts`：已有 `UserModelConfigRepository`，但还没有面向 UI 的 save/load command。
- `packages/application/src/commands/model-config-resolution.ts`：执行链路已按 user config 优先于 official preset 解析。
- `packages/application/src/commands/profile-models.ts`：`listProfileModels()` 已返回 discovery cache ∪ user configs ∪ official catalog。
- `apps/app/src/shared/ports/commands-port.ts`：已有 `listProfileModels()` 和 `refreshProfileModels()`，但还没有 model-config commands。
- `apps/app/src/shared/ui/pages/settings-page.tsx`：Configuration 层已有 `Prompt Settings` 行，还没有 `Model Configuration` 行。
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`：Profile 模型区仍偏 default model selector；已有 status notice，但没有 edit/configure 路径。
- `apps/app/src/shared/ui/model-info.ts`：main selector 已过滤 `selected && configured`。

## Goal（目标）

为 `UserModelConfig` 增加一条完整、mock-tested 的 UI 路径：

- Configuration 页面在 `Prompt Settings` 下方显示 `Model Configuration`；
- `Model Configuration` 页面 actionbar 有 plus 按钮，点击进入统一模型配置编辑页；
- Profile 模型管理区显示 `listProfileModels()` 的完整本地 union；
- 未配置模型可见，选中后显示 `StatusNotice`，并提供 edit/configure action；
- 新增和编辑共用同一个 model config editor 和同一条保存逻辑；
- 保存 model config 后不自动勾选、不自动设为 Profile 默认模型；
- main selector 继续只显示 `selected && configured`；
- Profile 切换后不能保留上一 Profile 的 stale selected model state。

## Non-goals（非目标）

- 不做 live provider call、live provider smoke、付费生成证明。
- 不做真实 Photoshop / UXP host proof；本 Loop 以 fake app tests 和 Chrome harness 为准。
- 不做任意 JSON request-body editor 或 schema editor。
- 不重构 provider transport、request builder、catalog strategy。
- 不保留旧模型选择状态的 migration/backcompat。
- 保存 model config 后不自动选中。
- 不做 profile-specific model config override；user model config 仍是全局 `(apiFormat, modelId)`。
- 不做 model configuration entry、editor、profile model management 之外的 settings 大改版。

## Scope（范围）

允许修改：

- `packages/application/src/commands/**`
- `packages/application/src/runtime.ts`，仅限 model config commands 所需 command/repository access
- `packages/application/src/commands/types.ts`
- `apps/app/src/shared/ports/commands-port.ts`
- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/settings-page.tsx`
- 新增 `apps/app/src/shared/ui/pages/model-configuration-page.tsx`
- 新增或复用 `apps/app/src/shared/ui/` 下的 shared model config editor component
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/components/provider-settings-sections.tsx`
- `apps/app/src/shared/ui/hooks/use-provider-settings.ts`
- `apps/app/src/shared/ui/i18n/messages.ts`
- `apps/app/src/shared/ui/styles/**`，仅限必要的 UXP-safe layout styles
- `apps/app/tests/**`，聚焦 settings/model config/profile/main selector 覆盖
- `packages/application/src/commands/*.test.ts`
- `docs/ENGINEERING_CONTEXT.md`，仅当最终实现产生未记录的稳定架构事实

禁止修改：

- `packages/providers/src/transport/**`
- provider request builders 和 wire codecs
- `packages/core-engine/**`
- 现有 repository adapters 之外的 Photoshop/UXP host IO 行为
- live provider smoke 或 `.test.env`
- broad docs cleanup、completed-loop cleanup、无关 settings/prompt UI 改动
- 将 main selector 规则改成非 `selected && configured`

## Ownership Boundary（所有权边界）

- `packages/application`：拥有 listing templates、reading/saving user model configs、validation、config 改动后的 cleanup rule command facade。
- `apps/app/src/shared/ports`：只暴露 application commands；UI 不能直接 import runtime repositories。
- `apps/app/src/shared/ui/pages`：拥有 Configuration-level navigation、Model Configuration page、Profile model management、editor presentation。
- `apps/app/src/shared/ui/hooks`：拥有 UI state orchestration 和防 stale profile/model reload 行为。
- `apps/app` adapters：保持现有 repository injection；除非测试证明 narrow type alignment 必须调整，否则不新增 host 行为。

## Baseline（基线）

实现前运行：

- `pnpm --filter @imagen-ps/application test`
- `pnpm --filter @imagen-ps/app test`

如果 baseline 失败：

- 记录第一个相关失败；
- 只有失败明确无关 application model commands 或 settings UI 时才继续；
- 如果失败阻断归因，停止并输出 Decision Packet。

当前 repo 状态备注：

- `main` ahead of `origin/main`；
- `.local/` 是 untracked，必须保持不碰；
- `docs/loops/2026-07-05-status-notice-contract.md` 是已存在的 historical completed file，不属于当前 active Loop。

## Slices（切片）

### 1. Application model-config command facade

目标：

- 增加 UI 可用的 application commands，让 UI 不需要触达 repositories。

必须产出：

- command：按 `apiFormat` 列出 official model config templates/presets；
- command：按 `(apiFormat, modelId)` 读取 user model config；
- command：保存 user model config，并校验 `requestStrategyId` 绑定 `apiFormat`；
- delete command 仅当 editor 暴露 delete 时加入；否则不做删除；
- save 返回 saved config 或 command error；
- save 不修改任何 Profile 的 `selectedModelIds/defaultModelId`。

允许范围：

- `packages/application/src/commands/**`
- `packages/application/src/runtime.ts`
- `packages/application/src/commands/types.ts`
- application tests

验证：

- `pnpm --filter @imagen-ps/application test`

Stop rule：

- 如果 delete/update 需要同步清理 selected/default，但产品策略未定，停止并给出 A/B/C：command-owned cleanup、no delete UI、repository-only internal cleanup。

### 2. App command port 和 fake harness wiring

目标：

- 通过 `CommandsPort` 和 app fakes 暴露 model-config commands。

必须产出：

- `createCommandsAdapter()` 导出新增 commands；
- app fakes 支持 user model configs 的 list/get/save；
- Chrome/UXP repository adapters 继续走现有 runtime setup；
- tests 能 seed user configs 和 official templates，不直接访问 repository。

允许范围：

- `apps/app/src/shared/ports/commands-port.ts`
- `apps/app/tests/fakes.ts`
- 仅当 type wiring 必须调整时，修改 app composition files

验证：

- `pnpm --filter @imagen-ps/app test`

Stop rule：

- 如果 UI 需要直接 import runtime/repository，停止；必须改由 application commands 承接。

### 3. Configuration-level Model Configuration 页面

目标：

- 在 `Prompt Settings` 下方增加 `Model Configuration`，并创建带 actionbar plus 的页面。

必须产出：

- Configuration 页面行顺序：Global Generation、Prompt Settings、Model Configuration、Provider Profiles；
- 行点击进入与 Prompt Settings 同层级的 dedicated Model Configuration page；
- 页面能列出 existing user model configs，或以足够清晰的方式展示 grouped official presets 以供选择/编辑；
- 页面 actionbar plus 打开统一 editor 的 create mode；
- empty state 简洁可用；
- copy 同步到 `en` 和 `zh-CN`。

允许范围：

- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/settings-page.tsx`
- 新增 Model Configuration page/component files
- `apps/app/src/shared/ui/i18n/messages.ts`
- focused app tests

验证：

- `pnpm --filter @imagen-ps/app test`

Stop rule：

- 如果 navigation shape 与现有 AppShell view model 冲突，停止并给出 A/B/C：page view、detail subview、modal。

### 4. Unified model config editor

目标：

- 创建新增、编辑、从 Profile 未配置模型进入时共用的同一个 editor。

必须产出：

- create mode 接收 `apiFormat`、`modelId`、preset/template selection；
- edit mode 可加载 existing config 或 discovered unconfigured model ID；
- preset selection 复制 `requestStrategyId` 和 output constraints；
- UI 明确显示持久化/排查值：`apiFormat`、`modelId`、`requestStrategyId`、aspect ratios、sizes、output formats；
- 用户只编辑 supported output lists，不直接编辑 raw strategy internals；
- blank/default strategy 仅在当前 application/provider catalog 暴露该 `apiFormat` 的 valid default 时允许；
- validation 阻止 empty `modelId`、invalid `apiFormat`、unknown/invalid `requestStrategyId`、empty output sets；
- save 写入 `UserModelConfig` 并返回调用页；
- save 不自动选中任何 Profile 中的模型。

允许范围：

- `apps/app/src/shared/ui/` 下新增或复用 editor component
- Model Configuration page
- Settings Detail/Profile model area
- app tests

验证：

- `pnpm --filter @imagen-ps/app test`

Stop rule：

- 如果 editor 无法在不重构 provider 的前提下选择 stable strategy，停止并给出 A/B/C：必须选择 preset、per-api default strategy、禁止 blank config。

### 5. Profile model management 集成

目标：

- Profile 页面显示完整 union，并将未配置模型引导到同一个 editor。

必须产出：

- Profile 页面以 `listProfileModels()` 作为最终本地模型列表；
- official catalog models 即使未 discovery 也显示；
- discovered unknown models 显示并标记为 unconfigured；
- 选择 unconfigured model 后显示带 edit/configure action 的 `StatusNotice`；
- configure action 带 `apiFormat/profileId/modelId` context 打开统一 editor；
- 保存 config 后 reload Profile list，模型变为 configured，但仍不自动 selected；
- configured model 的勾选/选择保持显式操作；
- `defaultModelId` 必须保持属于 selected models；
- 打开列表不发网络请求；refresh 仍是显式动作。

允许范围：

- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/components/provider-settings-sections.tsx`
- `apps/app/src/shared/ui/hooks/use-provider-settings.ts`
- app tests

验证：

- `pnpm --filter @imagen-ps/app test`

Stop rule：

- 如果当前 “default model selector” UI 无法表达 full union + selected state，需要停止并给出 A/B/C：checkbox list、segmented list、two-step selector。

### 6. Main selector 和 Profile switch 防 stale 验证

目标：

- 验证新增 editor/list flow 后，main selector 规则和防 stale state 行为仍正确。

必须产出：

- main selector 只包含 `selected && configured`；
- unconfigured discovered models 不出现在 main page；
- unselected configured models 不出现在 main page；
- 切换 Profile 会清理或重算 selected model，上一 Profile 的模型不能残留为 stale UI state；
- Profile model reload sequence 能忽略 profile switch 后返回的旧 async response。

允许范围：

- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- app tests only，除非发现缺陷

验证：

- `pnpm --filter @imagen-ps/app test`

Stop rule：

- 如果修复 stale state 需要 session/core-engine model persistence changes，停止并输出 Decision Packet。

### 7. Final verification 和 docs decision

目标：

- 用 mock-only proof 收口；只在确有稳定架构事实时更新 durable docs。

允许范围：

- tests/policy 要求的修复
- `docs/ENGINEERING_CONTEXT.md`，仅限 durable architecture facts

验证：

- `pnpm --filter @imagen-ps/application test`
- `pnpm --filter @imagen-ps/app test`
- `pnpm check:policy`
- `pnpm validate`

Stop rule：

- 如果 final failures 需要 live provider 或真实 Photoshop proof，停止。

## Validation（验证）

- quick：
  - `pnpm check:policy`
- per-slice：
  - `pnpm --filter @imagen-ps/application test`
  - `pnpm --filter @imagen-ps/app test`
- final：
  - `pnpm validate`
- manual-only：
  - 可选 Chrome visual observation，覆盖新 settings pages 的 narrow 和 regular panel widths；
  - 可选 Photoshop/UXP spot check，只作为额外证据，不作为 required proof。
- live-provider：
  - none

## Decision Packet Triggers（需要停止并给出决策包的条件）

- editor add/edit flow 需要 existing official presets 或 request strategies 未表达的 provider transport 行为；
- delete/update `UserModelConfig` 需要当前需求未批准的 Profile cleanup policy；
- Profile model management 需要比 list + status notice + editor action 更大的交互重设；
- application command facade 无法在不让 UI import providers/runtime 的情况下校验 configs；
- mock/fake harness 无法证明声明的 UI 行为；
- final validation failure 需要 live provider 或真实 Photoshop proof。

## Completion Report（执行报告）

执行 agent 必须报告：

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Boundary evidence:
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

## Memory Note Candidate（记忆写回候选）

默认：`no`。

仅当实现建立了稳定的 user model config editing command/UI contract，并且应提升到 `docs/ENGINEERING_CONTEXT.md` 时，使用 `yes: architecture`。
