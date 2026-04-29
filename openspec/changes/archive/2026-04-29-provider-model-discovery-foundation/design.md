## Context

`provider-storage-discovery-foundation` 与 `provider-model-selection-foundation` 已经分别建立了 `ProviderProfile` 持久化与 model selection 三级优先级两条核心能力，CLI surface 已注入 `FileProviderProfileRepository` 与 `FileSecretStorageAdapter`，并提供 `provider profile list/get/save/delete/test` 五条命令。当前仍欠缺三件事：

1. `ProviderProfile.models` 字段在 spec 中定义为"profile-side metadata"，但 dispatch 不读、无 surface 入口、来源不明确，处于"半死状态"。
2. provider implementation 没有任何机制声明"我自带的 fallback model 候选"，也没有"我能不能 discover model 列表"的能力位。
3. CLI 用户在创建 profile 之后，缺少操作 `defaultModel` 与 `enabled` 的便捷入口；现有唯一路径是 `get → 编辑 JSON → save`，且无 model 校验。

handoff `docs/HANDOFF_2026-04-29_PROVIDER_MODEL_CLI.md` 第 4 节明确"CLI-first 闭环已完成核心链路"，第 5 节标记下一步为 `cli-provider-profile-ops`；本变更在与作者多轮探索后，将该方向重新聚焦为"建立 surface-agnostic 的 model 候选契约 + 配套 CLI 操作面"，并把过度设计（paramSchema / adapter mapping / async polling / 兼容层 / fetchedAt 标注）一律剥离。

约束：
- 必须遵守 `AGENTS.md` 的依赖方向 `surface apps → packages/shared-commands → runtime packages`。
- `packages/shared-commands` 不得引入 React / DOM / UXP / Node fs/path/os。
- 项目处于开发期，无外部用户：BREAKING 变更不需要兼容层。
- 写作语言中文，标识符 / 路径 / 代码 英文。

## Goals / Non-Goals

**Goals:**

- 让 `ProviderProfile.models` 字段获得**唯一确定的来源**：`refreshProfileModels` 写入的 discovery 缓存。
- 在 `ProviderDescriptor` 上提供两个 OPTIONAL 能力位：`defaultModels`（implementation 自带 fallback）与 `discoverModels(config)`（implementation 的 discovery 能力）。
- 提供 4 个 surface-agnostic 的 shared command（`listProfileModels` / `refreshProfileModels` / `setProfileDefaultModel` / `setProfileEnabled`），CLI 与未来 UXP 共用。
- CLI 命令路径扁平化为 `imagen profile *`，并新增 5 条命令满足"创建 profile → 看 model → 选 default → 跑 job"全闭环。
- 让 `setProfileDefaultModel` 的严格校验逻辑成为后续 UXP 下拉菜单与 CLI string input 的共同 contract source。

**Non-Goals:**

- 不实现 `openai-compatible.discoverModels()`（接口位先就位，留给后续 change）。
- 不引入 model 的 `paramSchema` / `capabilities` / `metadata` / `limits`（保持 `ProviderModelInfo` 极简）。
- 不抽象出独立的 `ProviderAdapter` 层；请求/响应映射继续放在各 provider `invoke` 内部。
- 不改变 `provider.invoke` 同步 final-result 语义；不引入 progressive invoke / async polling。
- 不提供"用户手工编辑 profile.models"的命令或 UI。
- 不在返回值或持久化数据中加 `source` / `fetchedAt` / `fetchStatus` / `lastError` 等任何状态标注。
- 不为已有 `ProviderProfileInput.models` 字段做向后兼容（开发期，直接破坏性替换）。
- 不动 `provider-edit` workflow 的 `providerOptions` 绑定（保持暂缓决议）。

## Decisions

### D1：`ProviderModelConfig` → `ProviderModelInfo`，并精简到极简形态

**决策**：删除既有 `ProviderModelConfig`，新建 `ProviderModelInfo = { id: string; displayName?: string }`，所有相关 import 直接迁移到新名字。

**理由**：

- 旧名字带"Config"暗示"用户可配置"，与新语义"discovery 缓存 / implementation fallback"冲突。
- `capabilities: readonly string[]` 与 `metadata: ProviderProfileConfig` 当前没有任何调用方读取，属于推测性字段；保留只会引导后续设计方向偏移到"可执行 schema"。
- 极简类型让 `defaultModels` / `discoverModels` / `profile.models` 三个出现位点共用同一个类型，避免再制造同义概念。

**替代方案**：

- 保留 `ProviderModelConfig` 不改名 → 否决：语义错位会持续误导。
- 保留 `capabilities` / `metadata` 标记为 deprecated → 否决：开发期项目，直接删比留 deprecated 更干净。

### D2：`defaultModels` 与 `discoverModels` 都是 OPTIONAL，且彼此独立

**决策**：在 `ProviderDescriptor` 上分别新增 `defaultModels?: readonly ProviderModelInfo[]` 与 `discoverModels?(config): Promise<readonly ProviderModelInfo[]>`，两个字段互不要求。

**理由**：

- `mock` 不应有 discovery 能力（无远端可问），但应有 fallback 候选 → 只声明 `defaultModels`。
- `openai-compatible`（未来）需要 discovery 能力，且 fallback 候选需要在中转站不实现 `/v1/models` 时兜底 → 两个都声明。
- 完全私有协议的 implementation 可能两个都不声明，让 `listProfileModels` 返回 `[]` 即可——`setProfileDefaultModel` 在空列表场景下会全部 reject，这正是设计意图（强迫 implementation 在某种程度上声明候选）。

**替代方案**：

- 把两个字段合成单一 `models` 接口（必须实现 list 方法）→ 否决：会迫使每个 implementation 都写一份冗余代码，且 mock/私有实现没有 discovery 概念。
- 用 `family` 隐式决定能力 → 否决：family 是协议家族，不是能力声明，会污染语义。

### D3：fallback chain 的固定顺序：`profile.models` → `descriptor.defaultModels` → `[]`

**决策**：`listProfileModels` 内部按以上顺序取第一个非空数组返回；不混合两层（不做去重合并）。

**理由**：

- `profile.models` 来自最近一次 discovery，是"针对该 profile 实际可用"的最准确信息，理应优先。
- `descriptor.defaultModels` 是 implementation 的全局兜底，仅在该 profile 从未 discover 成功时使用。
- 混合合并会引入"同 id 不同 displayName 取谁"等次生问题，且没有真实使用价值。

**替代方案**：

- 合并两层去重 → 否决：复杂度上升、价值不明。
- 反向优先（descriptor 优先）→ 否决：违背"用户态 / discovery 结果优先"的直觉。

### D4：`refreshProfileModels` 失败时不擦除 `profile.models`、不持久化失败状态

**决策**：discoverModels 抛错或 implementation 未实现该接口时，命令返回 error，但 `profile.models` 维持原值；不写入任何 `lastError` / `fetchStatus` / `fetchedAt` 字段。

**理由**：

- 网络抖动是常态；从"有缓存"退化到"空"会让用户体验更差。
- "下次再拉"是天然的失败恢复路径，不需要持久化失败状态。
- 不持久化状态意味着 profile 文件 schema 几乎不变，运维与排错的认知负担最小。

**替代方案**：

- 失败清空 → 否决：用户体验倒退。
- 加 `modelsFetchedAt` / `modelsFetchStatus` → 否决：当前 surface 没有任何使用方需要读取这些字段；M3/M4 决议已明确不加。

### D5：`setProfileDefaultModel` 严格校验、CLI/UXP 共用同一 contract

**决策**：`setProfileDefaultModel(id, modelId)` 内部调用 `listProfileModels(id)`，严格断言 `modelId` 命中，未命中返回 `ValidationError`；CLI `imagen profile set-default-model <id> <modelId>` 不提供 `--force` 等绕过通道。

**理由**：

- "下拉菜单只暴露候选"是 UXP 的呈现方式，不是数据契约本身；契约必须由 shared-commands 强制，否则 CLI 路径会绕过 UXP 的承诺。
- 校验失败是有信息量的反馈："你应该先 refresh 或者重新审视 implementation 的 defaultModels"。
- 如果某天用户必须用一个不在列表里的 model，正确路径是 implementation 先暴露它（声明到 `defaultModels`），不是绕过校验。

**替代方案**：

- 软校验 + warning + `--force` → 否决：会让 CLI 与 UXP 行为分裂，破坏 D2 的设计意图。
- 完全透传不校验 → 否决：失去了 model 候选契约的意义。

### D6：CLI 命令路径破坏性扁平化为 `imagen profile *`

**决策**：删除 `imagen provider profile *` 路径，改为 `imagen profile *`；不保留双路径并存。

**理由**：

- "provider" 二字已被认知为"协议家族 / implementation"层，与用户实际操作的"profile 实例"层不重合；嵌套到 `provider profile` 在心智上误导。
- 项目处于开发期，无外部用户；保留两套路径会增加文档负担与未来回收成本。
- 扁平化后命令呈现接近 `kubectl <noun> <verb>` 的形态，对脚本化也更友好。

**替代方案**：

- 双路径并存 + deprecation → 否决：开发期无必要。
- 保留 `provider profile *` 不动 → 否决：心智污染会持续。

### D7：`ProviderProfileInput` 移除 `models` 字段（编译期 + 运行时双保险）

**决策**：从类型签名上删除 `models` 字段；同时在 `saveProviderProfile` 实现里不再读取 `input.models`。运行时不需要专门的"拒绝 models 字段"校验——TypeScript 直接挡住合法调用方，野调用方传了也只会被忽略。

**理由**：

- D7 是 D1 / D3 的自然后果：profile.models 唯一来源是 `refreshProfileModels`，输入路径就不该接受。
- 项目内部无兼容包袱，直接破坏比加 deprecation 干净。
- 不加 strict ValidationError，是因为校验自由文本字段没有产品价值，且会增加 spec 复杂度。

**替代方案**：

- silent 接受并 deprecate → 否决：留隐患，后期清理成本更高。
- strict 报错 → 否决：项目内部无外部 caller，多余的运行时校验。

### D8：spec 拓扑——本次只产生 delta，不新增 capability

**决策**：所有 spec 变更落到 `provider-contract` / `provider-profile-discovery` / `shared-commands-provider-config` / `mock-provider` 四个已有 capability 的 delta 上；不新建 capability 目录。

**理由**：

- 新能力（`defaultModels` / `discoverModels` / 4 个新 command）都是对现有 capability 的扩展，不构成独立"能力面"。
- 减少 spec 目录爆炸，让 capability 列表保持稳定。

## Risks / Trade-offs

- **风险**：`mock` 在本次同时声明了 `defaultModels`，已有依赖 mock fallback `'mock-image-v1'` 的测试若假设了"无 defaultModels"语义，可能行为不一致。
  → 缓解：`defaultModels` 仅供 `listProfileModels` / `setProfileDefaultModel` 使用，不参与 `provider.invoke` fallback；保持 `model-selection` 三级优先级里 mock 的硬编码默认值不动。
- **风险**：CLI 路径扁平化是 BREAKING；任何已落盘的脚本、文档、AGENTS skill 提示词中含 `imagen provider profile *` 都会失效。
  → 缓解：在 tasks 中显式枚举需要更新的文档/示例位置（README、handoff、AGENTS skill 提示）。
- **风险**：`setProfileDefaultModel` 严格校验意味着用户在 implementation 没有声明 `defaultModels` 且未做过 refresh 的场景下根本无法设置任何 model id。
  → 缓解：这正是 D5 想要的产品力；通过文档与命令错误信息明确指引用户"先 refresh 或在 implementation 中声明候选"。
- **风险**：删除 `ProviderModelConfig.capabilities` / `metadata` 字段，未来真有 capability 需求时，需要再 propose 一个 change 重新引入。
  → 缓解：那时已经有真实使用场景，能设计得更准；当前没有 caller。
- **风险**：`refreshProfileModels` 失败不更新任何状态 → 调用方无从感知"我上次刷新过吗"，可能反复刷新。
  → 缓解：CLI 端不持久化是合理的，UI 端如有"上次刷新时间"等需求，将来用 surface-local state 解决，不污染 shared-commands 契约。
- **Trade-off**：本次保持 `provider.invoke` 同步 final-result 语义不变，未来接 MJ-class async provider 时需要在 `provider invoke` 内部隐藏 polling，或另起 change 引入 progressive 接口；这是有意识的延迟决策，避免现在为推测性需求过度设计。

## Migration Plan

由于无外部用户，迁移以"代码内一次切换"完成：

1. `packages/providers`：新增 `ProviderModelInfo` 类型；扩展 `ProviderDescriptor`；mock 声明 `defaultModels`；删除 `ProviderModelConfig` 旧导出。
2. `packages/shared-commands`：迁移 `ProviderProfile.models` 类型；从 `ProviderProfileInput` 删除 `models`；移除 `saveProviderProfile` 中处理 `models` 的代码；新增 4 个 command；保持 `runtime` 注入接口稳定。
3. `apps/cli`：更新 `commands/provider/profile.ts` → 拆分到新的 `commands/profile/*.ts`；更新 `register*` 调用与命令树；增加 5 条新命令；同步 README。
4. 全量跑 `pnpm --filter @imagen-ps/{providers,shared-commands,cli} build && test`，并 `openspec validate` 本 change。
5. 更新 `docs/HANDOFF_*.md`（生成新一份 handoff，引用归档的本 change）。

无 rollback 流程：开发期项目，发现问题直接前向修复或回滚 commit。

## Implementation Notes

### CLI 命令树拆分细节

- `provider` 命令组在扁平化后仍保留 `list / describe / config` 等子命令，仅移除 `profile` 子树。`apps/cli/src/index.ts` 中新增 `registerProfileCommands(program)` 调用，保持命令树结构清晰。
- 实测确认：profile 子命令迁移后，`commands/provider/index.ts` 不再承担 profile 注册职责，但 provider 组本身因承载其他子命令而继续存在。

## Open Questions

无。所有微决策（M1–M4、N1–N2）已在 explore 阶段闭环；spec 与 tasks 直接基于本设计推导即可。
