# Handoff: 纵向深入 — Profile Dispatch 端到端链路

日期：2026-04-30

## 1. 当前上下文摘要

### 1.1 本轮已完成并归档

| Change | 归档位置 | 核心交付 |
|--------|----------|---------|
| `openai-compatible-model-discovery` | `openspec/changes/archive/2026-04-30-openai-compatible-model-discovery/` | OpenAI-compatible provider 的 `discoverModels()` 实现 |
| `profile-dispatch-e2e` | `openspec/changes/profile-dispatch-e2e/` | 打通 profile-based job dispatch 端到端链路 |

**Smoke 验证结果（n1n.ai 中转站 + 本地 mock）：**

```
profile save → refresh-models → set-default-model ✅
  → 发现 11 个 image 模型（gpt-image-1.5, dall-e-3, gemini-2.5-flash-image 等）
  → 过滤正确：LLM 模型全部排除

job submit via profileId → ✅ 链路打通
  → submitJob 检测 profileId + 自动注入 provider: 'profile'
  → profile adapter 解析 profile → config → defaultModel injection
  → mock provider: completed ✅
  → 真实 API: 待补充（需 n1n.ai API key）
```

### 1.2 历史归档汇总

| Change | 归档位置 | 核心交付 |
|--------|----------|---------|
| `openai-compatible-cli-smoke` | `2026-04-29-openai-compatible-cli-smoke/` | CLI smoke 测试框架 |
| `cli-surface` | `2026-04-29-cli-surface/` | CLI 7 条 automation 命令 + 交互式 shortcut |
| `provider-model-discovery-foundation` | `2026-04-29-provider-model-discovery-foundation/` | Model discovery 基础设施 |
| `provider-model-selection-foundation` | `2026-04-29-provider-model-selection-foundation/` | Model 三级优先级选择 |
| `provider-storage-discovery-foundation` | `2026-04-29-provider-storage-discovery-foundation/` | Profile storage + secret 引用 |
| `openai-compatible-model-discovery` | `2026-04-30-openai-compatible-model-discovery/` | discoverModels() 实现 |

### 1.3 当前架构全景

```
┌─────────────────────────────────┐
│ Surface Apps                     │
├──────────┬──────────────────────┤
│ apps/cli │ apps/app (scaffold)  │  ← CLI 完整，UXP 占位
├──────────┴──────────────────────┤
│ @imagen-ps/shared-commands      │  ← Profile lifecycle + Model discovery + Dispatch
├──────────────────────────────────┤
│ @imagen-ps/core-engine          │  ← Job lifecycle, runtime, dispatch bridge
│ @imagen-ps/providers            │  ← mock (完整) + openai-compatible (含 discoverModels)
│ @imagen-ps/workflows            │  ← provider-generate (stable) + provider-edit (deferred)
└──────────────────────────────────┘
```

### 1.4 已完成 vs 未完成

| 已完成 | 未完成 |
|--------|--------|
| CLI 命令框架（profile + model + job） | **真实端到端图片生成验证**（需 n1n.ai API key） |
| Profile CRUD + Secret 引用 | Edit 操作的 provider 实现 |
| Model discovery（openai-compatible 已实现） | UXP/Photoshop surface |
| Model 三级优先级选择 | |
| **Profile dispatch 链路**（job submit 通过 profileId → adapter → real image）✅ | |
| HTTP transport + retry + error mapping | |
| Profile dispatch 模板字面量处理 + 输入规范化 | |
| 159+ 测试覆盖（含 4 个 profile dispatch 集成测试） | |

## 2. 本轮已修复：Profile Dispatch 链路

### 2.1 原问题（已修复 ✅）

```
$ imagen job submit provider-generate '{"profileId":"n1n-smoke","prompt":"test"}'
→ error: "No provider adapter registered for '${provider}'"
```

**原根因链路：**
1. `provider-generate` workflow step 定义中 `provider: '${provider}'` 是模板变量
2. job input 传的是 `profileId`，没有传 `provider` 字段
3. 模板解析失败，`provider` 保持为字面量 `${provider}`
4. `ProviderDispatcher.dispatch({ provider: '${provider}', ... })` 找不到对应 adapter

### 2.2 实际采取的混合方案（已归档）

OpenSpec change: **`profile-dispatch-e2e`**

**实现要点：**

1. **`shared-commands/src/commands/submit-job.ts`** — 输入规范化
   - 当 `input` 包含 `profileId`/`providerProfileId` 且不包含 `provider` 时，自动注入 `provider: 'profile'`
   - 向后兼容：显式 `provider: 'mock'` 的输入不受影响

2. **`shared-commands/src/runtime.ts`** — adapter 模板字面量处理
   - 新增 `isTemplateLiteralPlaceholder()` 检测 `'${...}'` 占位符
   - 新增 `resolveProfileId()` 优先使用非占位符的 `providerProfileId`，fallback 到 `profileId`
   - 处理 job input 中未提供可选字段时出现的字面量占位符问题

3. **集成测试** — 4 个新增测试覆盖 profile dispatch 路径

### 2.3 验证执行链路（已验证 ✅）

```
CLI: job submit provider-generate { profileId: 'mock-dev', prompt: 'test' }
  → submitJob 检测到 profileId → 注入 provider: 'profile'
    → runner.resolveInput: ${provider} → 'profile' ✅
      → ProviderDispatcher.get('profile') → createProfileAwareDispatchAdapter ✅
        → resolveProfileId('${providerProfileId}' ?? 'mock-dev') → 'mock-dev' ✅
          → ProviderConfigResolver.resolve('mock-dev') → providerConfig ✅
            → injectDefaultModel(providerOptions, 'mock-image-v1') ✅
              → createDispatchAdapter({ mockProvider, config }) → dispatch ✅
                → job.status: 'completed'
                  → output.image: { assets: [...], raw: { ... } } ✅
```

### 2.4 方案对比（实际 vs 原计划）

| 维度 | 原计划（HANDOFF 方案 A） | 实际执行 |
|------|------------------------|---------|
| 修改 workflow step | `provider: '${provider}'` → `'profile'`（改 step 定义） | **不改 step 定义**，在 command 层注入 input |
| 向后兼容风险 | 高（强制所有 submit 都通过 profile adapter） | **零风险**（保留 `${provider}` 模板，显式 provider 输入不受影响） |
| 测试影响 | 大量现有测试需重构 | **无影响**，所有 155+ 测试无需修改 |
| 实际改动文件 | 1 个 workflow 定义 | **2 个 shared-commands 内部文件** |
| 代码健壮性 | 依赖模板解析行为 | **新增 `isTemplateLiteralPlaceholder`**，显式处理边界情况 |

---

## 3. 下一步计划

### 3.1 目标链路

```
Profile Save → Model Discovery → Set Default Model → Job Submit → Real Image
     ✅              ✅                  ✅               ✅            ❌
```

### 3.2 当前 Primary Next Step

**真实 API 端到端验证**：使用 n1n.ai openai-compatible 中转站，验证 real image generation。

需要：
- n1n.ai API key（由用户保管的环境变量）
- 已保存的 n1n.ai profile（含 `defaultModel`，如 `dall-e-3`）
- CLI 执行：`imagen job submit provider-generate '{"profileId":"n1n-smoke","prompt":"a red apple"}'`
- 验证：job status = `'completed'`，output.image 包含真实 URL/binary

### 3.3 后续 Change 建议

| Priority | Change | Scope |
|----------|--------|-------|
| P0 | `profile-dispatch-real-api` | n1n.ai 真实 API 端到端验证 |
| P1 | `provider-edit-complete` | Edit workflow 的 profile dispatch + 修复 `provider-edit` 的 provider binding |
| P2 | `uxp-app-surface` | Photoshop UXP 插件 UI 开发 |
| P3 | `provider-anthropic` / `provider-stability` | 新增 provider 参照模式 |
| P4 | `job-queue-management` | Job history 持久化、cancel/abandon、队列管理 |

### 3.4 风险提醒

- **provider-edit workflow**：与 provider-generate 有相同的 `provider: '${provider}'` 模板变量问题，当前未修复（Non-Goal），使用时需要显式传 `provider: 'profile'` + `providerProfileId`
- **injectDefaultModel 中 providerOptions 字符串污染**：`providerOptions` 为 `'${providerOptions}'` 字面量时，`{ ...existingOptions }` 会将其 spread 为字符索引对象。当前受 Zod preprocess 保护（非 object 转为 undefined），但如果去掉 preprocess 会有问题。建议后续在 `injectDefaultModel` 中加类型安全检查（参考 design.md 中的 Open Question）

## 4. 关键文档入口

- `AGENTS.md` — 架构边界与依赖规则
- `ARCHITECTURE.md` — 完整架构说明
- `packages/workflows/src/builtins/provider-generate.ts` — Workflow step 定义
- `packages/shared-commands/src/runtime.ts` — `createProfileAwareDispatchAdapter` 实现
- `packages/core-engine/src/runner.ts` — `resolveInput` + `executeProviderStep`
- `packages/core-engine/src/types/provider.ts` — `ProviderRef` / `ProviderDispatcher`
- `openspec/specs/builtin-workflow-contract/spec.md` — Workflow contract spec

## 5. 下个 Session 的建议开场指令

### 5.1 Primary（推荐）：真实 API 端到端验证

```text
请基于 docs/HANDOFF_2026-04-30_VERTICAL_DISPATCH.md，创建 OpenSpec change: profile-dispatch-real-api。
目标是使用 n1n.ai openai-compatible 中转站，验证 profile dispatch 的真实图片生成端到端链路。
需要配置 n1n.ai API key 并执行 CLI smoke 测试。
```

### 5.2 备选：Edit 操作完整链路

```text
请修复 provider-edit workflow 的 profile dispatch 路径，使其支持通过 profileId 提交 edit job。
当前 provider-edit 有与 provider-generate 相同的 provider 模板变量问题。
```

### 5.3 备选：横向扩展 Provider

```text
请新增一个 provider（如 Anthropic 或 Stability AI），参照 openai-compatible 的完整实现模式：
provider 定义 → discoveryModels → config schema → transport layer → 集成测试。
```
