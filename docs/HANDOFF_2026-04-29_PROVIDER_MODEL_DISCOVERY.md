# Handoff: provider-model-discovery-foundation 完成总结

日期：2026-04-29
变更名：`provider-model-discovery-foundation`
状态：实现完成（pending archive）

## 1. Scope（实际落地）

本变更同时完成了 **三件互锁的事**：

1. 在 `packages/providers` 上建立 **surface-agnostic 的 model discovery 契约**
   （`ProviderModelInfo` + `ProviderDescriptor.defaultModels` + `Provider.discoverModels`）。
2. 在 `packages/shared-commands` 上将 `ProviderProfileInput` 的 `models` 字段
   破坏性移除，并新增 4 条 surface-agnostic 命令：
   - `listProfileModels`
   - `refreshProfileModels`
   - `setProfileDefaultModel`
   - `setProfileEnabled`
3. 在 `apps/cli` 上把 `imagen provider profile *` **整体扁平化**为
   `imagen profile *`，并新增 5 条 CLI 命令对接上述 facade：
   - `imagen profile models <profileId>`
   - `imagen profile refresh-models <profileId>`
   - `imagen profile set-default-model <profileId> <modelId>`
   - `imagen profile enable <profileId>`
   - `imagen profile disable <profileId>`

## 2. Breaking Changes

| 维度 | 旧 | 新 |
|------|----|----|
| Type | `ProviderModelConfig` | `ProviderModelInfo`（仅 `id` + 可选 `displayName`） |
| Type | `ProviderProfileInput.models` | **已删除**（编译期 + 运行期都拒绝） |
| CLI | `imagen provider profile *` | `imagen profile *`（扁平化，无双路径） |

均为破坏性，不保留兼容代码（设计文档明确不做 deprecation period）。

## 3. 行为契约要点

- **Fallback chain**（`listProfileModels`）：
  `profile.models` cache → `provider.descriptor.defaultModels` → `[]`。
- **Refresh**（`refreshProfileModels`）：
  - 当 provider 未实现 `discoverModels` → 返回 `validation` 错误，profile 不变。
  - 当 `discoverModels` 抛错 → 返回 `provider` 错误（错误 message 不携带 secret），profile 不变。
  - 成功（包括返回空数组）→ 覆盖 `profile.models`，`updatedAt` 推进。
- **Set default model**（`setProfileDefaultModel`）：
  - `modelId` MUST 出现在 `listProfileModels` 当前返回列表中。
  - 没有 `--force` 旁路；不允许任意自定义 modelId。
- **Set enabled**（`setProfileEnabled`）：
  - 严格幂等；目标状态等于当前状态时仍返回成功。
- **Save profile**（`saveProviderProfile`）：
  - 不再读 `input.models`；即使绕过 typing 强行注入也被忽略。
  - 现存 `existing.models` cache 在 save 时透传不被擦除。

## 4. 文件变更摘要

新增：
- `packages/providers/src/contract/model.ts`
- `packages/providers/tests/model-discovery-contract.test.ts`
- `packages/shared-commands/src/commands/profile-models.ts`
- `packages/shared-commands/tests/profile-models-fallback.test.ts`
- `packages/shared-commands/tests/profile-models-refresh.test.ts`
- `packages/shared-commands/tests/set-profile-default-model.test.ts`
- `packages/shared-commands/tests/set-profile-enabled.test.ts`
- `packages/shared-commands/tests/save-profile-rejects-models.test.ts`
- `apps/cli/src/commands/profile/index.ts`
- `apps/cli/src/commands/profile/lifecycle.ts`
- `apps/cli/src/commands/profile/models.ts`
- `apps/cli/src/commands/profile/refresh-models.ts`
- `apps/cli/src/commands/profile/set-default-model.ts`
- `apps/cli/src/commands/profile/enable.ts`
- `apps/cli/src/commands/profile/disable.ts`
- `apps/cli/tests/commands/profile-command-tree.test.ts`
- `apps/cli/tests/commands/profile-discovery-commands.test.ts`

修改：
- `packages/providers/src/contract/provider.ts`（新增 `defaultModels` / `discoverModels`）
- `packages/providers/src/index.ts`（re-export `ProviderModelInfo`）
- `packages/providers/src/mock/mock-provider.ts`（descriptor 上声明 defaultModels）
- `packages/shared-commands/src/commands/types.ts`（删除 `ProviderProfileInput.models` 等）
- `packages/shared-commands/src/commands/provider-profiles.ts`（save 不读 input.models；透传 existing.models）
- `packages/shared-commands/src/index.ts`（导出 4 条新命令）
- `apps/cli/src/commands/provider/index.ts`（移除 profile 子注册）
- `apps/cli/src/index.ts`（注册顶级 `profile` 命令组）
- `apps/cli/README.md`（新增 Profile Management 章节 + e2e 示例）
- `docs/HANDOFF_2026-04-29_PROVIDER_MODEL_CLI.md`（顶部 deprecation banner）

删除：
- `apps/cli/src/commands/provider/profile.ts`

## 5. 已剥离的非目标

设计阶段明确剥离的事项，本次也未做：

- 不做 “executable schema”（参数 schema、capability hint、modality 等）。
- 不在 cache 中加 `source` / `fetchedAt` / `version` 等任何元数据。
- 不引入 TTL 或自动 refresh 调度。
- 不为 `setProfileDefaultModel` 提供 `--force` 旁路。
- 不动 Photoshop UXP / React UI；UI 端的 `cli-provider-profile-ops` 仍待后续单独 change。
- 不动 `provider-edit` workflow 的 providerOptions 绑定。
- 不做旧 CLI 命令的兼容/双路径保留。

## 6. 测试矩阵

```text
pnpm --filter @imagen-ps/providers       build && test   # 16 passed
pnpm --filter @imagen-ps/shared-commands build && test   # 56 passed
pnpm --filter @imagen-ps/cli             build && test   # 45 passed
```

CLI smoke（手动）：

- `profile save` → ok
- `profile models mock-dev` → `[{ "id": "mock-image-v1" }]`（fallback 到 mock 默认）
- `profile refresh-models mock-dev` → `{"error":"Provider implementation \"mock\" does not support model discovery."}`
- `profile set-default-model mock-dev unknown-model` → `{"error":"Model \"unknown-model\" is not in the candidate list ..."}`
- `profile set-default-model mock-dev mock-image-v1` → ok，`defaultModel` 持久化
- `job submit provider-generate` → `raw.model = "mock-image-v1"`

`openspec validate provider-model-discovery-foundation` → valid。

## 7. 下一步建议

- **Archive** 本 change：`openspec-archive-change provider-model-discovery-foundation`，
  并把 `specs/provider-model-discovery/`、`specs/shared-commands-provider-config/`、
  `specs/cli-provider-profile/` 增量同步到主线 `openspec/specs/`。
- 后续 change 可选方向：
  - **`uxp-profile-model-ui`**：为 Photoshop UXP 端实现 “select profile + select model”
    的 React UI，对接已有 4 条 shared-commands facade。
  - **`provider-openai-discover-models`**：在 `openai-compatible` provider 上真正实现
    `discoverModels`（hit `/v1/models`），通过 `refreshProfileModels` 验证端到端 cache。
  - **`provider-edit-provider-options`**：把 `provider-edit` workflow 的 providerOptions
    绑定补齐（参考本次 `provider-generate` 的处理方式）。
