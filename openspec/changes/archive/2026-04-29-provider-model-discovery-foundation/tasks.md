## 1. providers：类型与 mock 声明

- [x] 1.1 在 `packages/providers/src/contract/` 中新增并导出 `ProviderModelInfo` 类型 `{ id: string; displayName?: string }`，从包根（`packages/providers/src/index.ts`）re-export。
- [x] 1.2 删除既有 `ProviderModelConfig` 类型与导出；批量替换 `packages/providers/` 内残留引用为 `ProviderModelInfo`。
- [x] 1.3 在 `ProviderDescriptor` 类型上新增 `defaultModels?: readonly ProviderModelInfo[]` 字段（OPTIONAL）。
- [x] 1.4 在 `Provider` 接口上新增 `discoverModels?(config: ProviderConfig): Promise<readonly ProviderModelInfo[]>` 方法（OPTIONAL）。
- [x] 1.5 让 `MockProvider.describe()` 返回的 descriptor 携带 `defaultModels: [{ id: 'mock-image-v1' }]`。
- [x] 1.6 不在 `MockProvider` 上实现 `discoverModels`（保持 `undefined`）；在源码注释中显式说明该决策。
- [x] 1.7 确保 `MockProvider.invoke()` 仍按原 model-selection 三级优先级解析 effective model，不读取 `descriptor.defaultModels`，保持现有 raw.model 回显行为。

## 2. providers：测试

- [x] 2.1 在 `packages/providers/tests/` 下新增 `model-discovery-contract.test.ts`，覆盖：mock 声明 `defaultModels`、未声明 `discoverModels`、不同 implementation 的可选字段独立性。
- [x] 2.2 调整既有 `mock-provider.test.ts`（如有断言 descriptor 结构的用例）以包含 `defaultModels` 字段。
- [x] 2.3 运行 `pnpm --filter @imagen-ps/providers build && pnpm --filter @imagen-ps/providers test` 全绿。

## 3. shared-commands：类型与 input 契约

- [x] 3.1 在 `packages/shared-commands/src/commands/types.ts` 中将 `ProviderModelConfig` 类型替换为 re-export 自 `@imagen-ps/providers` 的 `ProviderModelInfo`。
- [x] 3.2 将 `ProviderProfile.models` 字段类型改为 `readonly ProviderModelInfo[] | undefined`。
- [x] 3.3 从 `ProviderProfileInput` 接口中**删除** `models` 字段（破坏性，不留 deprecation comment 之外的兼容代码）。
- [x] 3.4 修改 `packages/shared-commands/src/commands/provider-profiles.ts` 的 `saveProviderProfile`：
  - [x] 3.4.1 删除从 `input` 读取 `models` 的逻辑；
  - [x] 3.4.2 保留从 `existing.models` 透传的逻辑（discovery cache 不应在 save 时被擦除）；
  - [x] 3.4.3 行为对 `existing.models` 不变。

## 4. shared-commands：新增 4 条命令

- [x] 4.1 在 `packages/shared-commands/src/commands/types.ts` 中追加 `setProfileEnabled` / `setProfileDefaultModel` 等命令的 result 类型签名。
- [x] 4.2 在 `packages/shared-commands/src/commands/provider-profiles.ts`（或新建 `profile-models.ts`）实现 `listProfileModels(profileId)`：
  - [x] 4.2.1 解析 profile，profile 不存在返回 validation error；
  - [x] 4.2.2 通过 `runtime.providerRegistry.get(profile.providerId)` 取 descriptor，未注册返回 validation error；
  - [x] 4.2.3 fallback chain：`profile.models` → `descriptor.defaultModels` → `[]`；
  - [x] 4.2.4 返回值不附带任何 source/fetchedAt 元数据。
- [x] 4.3 实现 `refreshProfileModels(profileId)`：
  - [x] 4.3.1 通过 `ProviderConfigResolver` 解析 runtime config（同 `testProviderProfile` 路径）；
  - [x] 4.3.2 取得 implementation；若 `discoverModels` 未实现返回 `validation` 错误；
  - [x] 4.3.3 调用 `discoverModels(config)`，抛错则返回 `provider` 错误且不修改 `profile.models`；
  - [x] 4.3.4 成功（含空数组）则覆盖写入 `profile.models`，调用 `repository.save(profile)` 并 bump `updatedAt`；
  - [x] 4.3.5 返回值为新 model 列表；保证错误信息不泄露 secret。
- [x] 4.4 实现 `setProfileDefaultModel(profileId, modelId)`：
  - [x] 4.4.1 调用 `listProfileModels(profileId)` 获取 candidate list；
  - [x] 4.4.2 校验 `modelId` ∈ candidate list；空列表场景下任意 modelId 均拒绝；
  - [x] 4.4.3 通过 repository 持久化更新 `config.defaultModel`，保留其他字段与 `models` cache；
  - [x] 4.4.4 不提供任何 force/override 旁路。
- [x] 4.5 实现 `setProfileEnabled(profileId, enabled)`：
  - [x] 4.5.1 解析 profile，更新 `enabled` 字段；
  - [x] 4.5.2 持久化、保留其他字段；
  - [x] 4.5.3 当 profile 已处于目标状态时仍返回成功（幂等）。
- [x] 4.6 在 `packages/shared-commands/src/index.ts` 导出 4 个新命令。

## 5. shared-commands：测试

- [x] 5.1 新增 `packages/shared-commands/tests/profile-models-fallback.test.ts`：fallback chain（cache / impl-default / empty）、profile 不存在、provider 未注册。
- [x] 5.2 新增 `packages/shared-commands/tests/profile-models-refresh.test.ts`：
  - mock implementation 无 `discoverModels` → validation error，`profile.models` 不变；
  - 自定义带 `discoverModels` 的伪 implementation → 成功覆盖；
  - 伪 implementation 抛错 → provider error，`profile.models` 不变；
  - 返回空数组 → `profile.models` 被设为 `[]`。
- [x] 5.3 新增 `packages/shared-commands/tests/set-profile-default-model.test.ts`：命中 cache、命中 impl default、未命中、空列表全拒绝、profile 不存在、不存在 force 旁路。
- [x] 5.4 新增 `packages/shared-commands/tests/set-profile-enabled.test.ts`：true/false toggle、幂等、profile 不存在。
- [x] 5.5 新增 `packages/shared-commands/tests/save-profile-rejects-models.test.ts`：编译期负向断言（通过 `// @ts-expect-error` 验证 `ProviderProfileInput` 不含 `models`）+ 运行时 saveProviderProfile 不擦除 existing.models 的回归。
- [x] 5.6 运行 `pnpm --filter @imagen-ps/shared-commands build && test` 全绿。

## 6. CLI：路径扁平化与命令拆分

- [x] 6.1 在 `apps/cli/src/commands/` 下新建 `profile/` 目录。
- [x] 6.2 创建 `profile/index.ts` 注册 `imagen profile` 顶级命令。
- [x] 6.3 将既有 `commands/provider/profile.ts` 中的 list/get/save/delete/test 逻辑迁移到 `profile/lifecycle.ts`，命令路径调整为 `imagen profile <sub>`。
- [x] 6.4 删除 `commands/provider/profile.ts` 与 `imagen provider profile *` 命令注册（破坏性，不保留双路径）。
- [x] 6.5 检查 `commands/provider/index.ts`：若仅承载 profile 子命令，整体删除并清理 `apps/cli/src/index.ts` 中相关注册；若仍承载其他子命令，保留并仅移除 profile 注册。
  - 实测：`provider` 仍承载 `list / describe / config`，按规则保留并仅移除 profile 注册；`apps/cli/src/index.ts` 新增 `registerProfileCommands(program)`。

## 7. CLI：5 条新命令

- [x] 7.1 在 `profile/models.ts` 实现 `imagen profile models <profileId>`：内部调 `listProfileModels`，JSON 输出 `{ models: [...] }`。
- [x] 7.2 在 `profile/refresh-models.ts` 实现 `imagen profile refresh-models <profileId>`：内部调 `refreshProfileModels`，JSON 输出 `{ models: [...] }` 或 stderr error。
- [x] 7.3 在 `profile/set-default-model.ts` 实现 `imagen profile set-default-model <profileId> <modelId>`：内部调 `setProfileDefaultModel`，JSON 输出 `{ profile: ... }` 或 stderr error；不提供 `--force`。
- [x] 7.4 在 `profile/enable.ts` 实现 `imagen profile enable <profileId>`：内部调 `setProfileEnabled(id, true)`。
- [x] 7.5 在 `profile/disable.ts` 实现 `imagen profile disable <profileId>`：内部调 `setProfileEnabled(id, false)`。
- [x] 7.6 在 `profile/index.ts` 注册以上 5 条命令。

## 8. CLI：文档与示例

- [x] 8.1 更新 `apps/cli/README.md`：新增 “Profile Management” 章节（lifecycle / model discovery / enable-disable），并加入 deprecation 注记说明 `imagen provider profile *` 路径已被移除。
- [x] 8.2 在 `apps/cli/README.md` 中加入端到端示例：`profile save → profile models → profile refresh-models（mock 返回 validation error） → profile set-default-model → job submit → raw.model 回显`。
- [x] 8.3 检查仓库内其他文档（`docs/USAGE.md`、`docs/HANDOFF_*.md`、`AGENTS.md`、`apps/cli` 子文档）是否引用旧路径：
  - `docs/HANDOFF_2026-04-29_PROVIDER_MODEL_CLI.md`：在文件顶部加入 deprecation banner，正文保留作历史上下文。
  - `docs/USAGE.md` / `AGENTS.md`：grep 未发现 `imagen provider profile *` 字面引用，无需变更。
  - `openspec/changes/archive/**`：归档文件按规定不可改动；不处理。
  - `apps/cli/README.md`：已显式标注 “The previous `imagen provider profile *` path has been removed”。

## 9. CLI：测试

- [x] 9.1 在 `apps/cli/tests/` 下新增/更新命令树快照测试：确认顶级命令包含 `profile`、不再包含 `provider profile`。
  - 文件：`apps/cli/tests/commands/profile-command-tree.test.ts`。
- [x] 9.2 为 `imagen profile models` / `refresh-models` / `set-default-model` / `enable` / `disable` 各写一条 happy-path + 一条 failure-path 测试（基于 mock implementation + in-memory adapter）。
  - 文件：`apps/cli/tests/commands/profile-discovery-commands.test.ts`。
- [x] 9.3 运行 `pnpm --filter @imagen-ps/cli build && pnpm --filter @imagen-ps/cli test` 全绿（45 passed）。

## 10. 端到端联动与回归

- [x] 10.1 跑全量 build/test：`providers` 16 passed、`shared-commands` 56 passed、`cli` 45 passed，全部绿。
- [x] 10.2 手动 smoke：`profile save mock-dev` → `profile models mock-dev` → `[{ id: 'mock-image-v1' }]` → `profile set-default-model mock-dev mock-image-v1` → `job submit provider-generate ...` → 响应 `raw.model = "mock-image-v1"`。
- [x] 10.3 手动 smoke：`profile refresh-models mock-dev` → `{"error":"Provider implementation \"mock\" does not support model discovery."}`，profile 未被修改。
- [x] 10.4 手动 smoke：`profile set-default-model mock-dev unknown-model` → `{"error":"Model \"unknown-model\" is not in the candidate list ..."}`，profile 未被修改。
- [x] 10.5 `openspec validate provider-model-discovery-foundation` → `Change 'provider-model-discovery-foundation' is valid`。

## 11. 文档与归档准备

- [x] 11.1 新增 `docs/HANDOFF_2026-04-29_PROVIDER_MODEL_DISCOVERY.md`，覆盖 scope、breaking changes、行为契约、文件清单、测试矩阵、剥离的非目标与下一步建议。
- [x] 11.2 校对 `AGENTS.md` 文档地图：未引用任何具体 CLI 命令路径，无需变更（已在 PR 中显式标注）。
- [ ] 11.3 准备 archive：本 change 完成实现并通过 10 与 11 的所有任务后，由用户触发 `openspec-archive-change` 流程归档到 `openspec/changes/archive/`。
