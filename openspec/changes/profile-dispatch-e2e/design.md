## Context

当前 provider-generate workflow 的端到端链路在 job submit 阶段失败，阻止了 profile → model discovery → selection → real image 的完整通路。

### 已有基础设施状态

| 组件 | 状态 | 说明 |
|------|------|------|
| `provider-generate` workflow step | ✅ stable | `provider: '${provider}'` 模板变量绑定 |
| `createProfileAwareDispatchAdapter` | ✅ complete | 已注册为 `provider: 'profile'`，支持 profileId → providerConfig → defaultModel injection |
| `DefaultProviderConfigResolver` | ✅ complete | profile → provider config 解析，含 secret 解析与 family 校验 |
| model discovery (openai-compatible) | ✅ complete | `discoverModels()` 实现 |
| CLI job submit 命令 | ✅ complete | 透传 JSON input |
| ProviderDispatcher | ✅ complete | adapterMap 路由，支持多 adapter |

### 失败链路分析

```
CLI: job submit provider-generate '{"profileId":"n1n-smoke","prompt":"test"}'
  → submitJob({ workflow, input })
    → runner.executeWorkflow('provider-generate', input)
      → context = { profileId: 'n1n-smoke', prompt: 'test' }
      → resolveStepInput(generateStep.input, context)
        ┌─────────────────────────────────────────────────────────────┐
        │ provider:    '${provider}'    → context 无 'provider' k   │
        │                                    → 保留字面量 '${provider}' │
        │ providerProfileId: '${providerProfileId}' → 保留字面量     │
        │ profileId:   '${profileId}'   → 'n1n-smoke' ✅             │
        │ request.prompt: '${prompt}'   → 'test' ✅                  │
        │ request.providerOptions: '${providerOptions}' → 保留字面量 │
        └─────────────────────────────────────────────────────────────┘
      → provider = resolvedInput.provider ?? step.name = '${provider}'
      → dispatcher.dispatch({ provider: '${provider}', params: {...} })
        → adapterMap.get('${provider}') → undefined → 抛错
        → error: "No provider adapter registered for '${provider}'"
```

### 模板变量字面量的双重风险

当 job input 未提供某些可选字段时，`resolveValue` 会**保留原始字面量字符串**（按设计 intent：让 provider/request validation 处理缺失输入）。这导致：

1. **`providerProfileId`**：`adapter.dispatch` 中 `params.providerProfileId ?? params.profileId` 的字面量 `'${providerProfileId}'` 是 truthy 字符串，阻止了 `profileId` 的 fallback。
2. **`providerOptions`**：schema `z.preprocess` 安全地将其过滤为 `undefined`，但通过 `injectDefaultModel` 时字符串会被 spread 为字符索引对象（已确认存在潜在 bug）。

```
injectDefaultModel 链路风险:
  → locateRequestInParams → { requestObj: ..., hasRequestKey: true }
  → requestObj.providerOptions = '${providerOptions}' (字符串)
  → const existingOptions = (字符串 as Record<string, unknown>) ?? {}
  → { ...existingOptions } = { '0': '$', '1': '{', ... }  ← bug
```

## Goals / Non-Goals

**Goals:**
- CLI `job submit provider-generate '{"profileId":"...","prompt":"..."}'` 可以成功执行并完成图片生成
- `createProfileAwareDispatchAdapter` 能正确处理模板字面量占位符
- 端到端 smoke 测试验证 profile dispatch 完整链路
- 集成测试覆盖 profile dispatch 路径

**Non-Goals:**
- 不改 UXP/UI 等 surface layer
- 不改 `provider-edit` workflow 的 profile dispatch（deferred）
- 不引入多 provider 并发 dispatch
- 不做 job history 持久化
- 不改 `resolveValue` 的核心语义（保留字面量是设计意图，provider/request 层应负责处理）

## Decisions

### Decision 1: 在 `submitJob` 中自动注入 `provider: 'profile'`（推荐）

**方案对比：**

| 方案 | 描述 | 影响文件 | 向后兼容 | 风险 |
|------|------|----------|----------|------|
| A: 改 workflow step | `provider: 'profile'` 静态值 | `provider-generate.ts` | ❌ 破坏所有直接 provider 调用测试 | 大量测试重构 |
| B: 改 runner resolveValue | 模板字面量自动 fallback | `runner.ts` | ❌ 影响所有 workflow | runner 层应 provider 不可知 |
| C: submitJob 输入检测 | 无 `provider` + 有 `profileId` → 注入 `provider: 'profile'` | `submit-job.ts` | ✅ 完全兼容 | 仅增加 command 层逻辑 |
| D: CLI 层注入 | 在 `apps/cli` 做输入转换 | `submit.ts` | ✅ CLI 兼容 | 不解决其他 surface 的同一问题 |

**选择 C 的理由：**
- `shared-commands` 是 profile dispatch 的 natural home（`createProfileAwareDispatchAdapter` 已注册在此）
- Command 层做输入规范化符合 facade 职责
- 向后兼容：现有测试 `provider: 'mock'` 不受影响
- 对其他 surface（未来 UXP）同样有效

### Decision 2: 在 `createProfileAwareDispatchAdapter` 中检测并忽略模板字面量

**问题：** `providerProfileId: '${providerProfileId}'` 字面量是 truthy 字符串，导致 `params.providerProfileId ?? params.profileId` 短路。

**解法：**
```ts
function isTemplateLiteralPlaceholder(val: unknown): boolean {
  return typeof val === 'string' && /^\$\{[^}]+\}$/.test(val);
}

const profileId = !isTemplateLiteralPlaceholder(params.providerProfileId)
  ? params.providerProfileId
  : !isTemplateLiteralPlaceholder(params.profileId)
    ? params.profileId
    : undefined;
```

**理由：** 这是最小改动，不影响任何已有行为。当用户显式传入 `providerProfileId`（非模板字面量）时仍优先使用；当未传入时正确 fallback 到 `profileId`。

### Decision 3: 不改 workflow step 定义

虽然 HANDOFF 文档提到了将 `provider-generate.ts` 的 `provider` 绑定改为 `'profile'`，但经过分析，这会强制所有 job submit 都通过 profile adapter，破坏所有直接 provider 调用的测试和既有用法。

保留 `'${provider}'` 模板变量，利用 `submitJob` 的输入规范化来覆盖 CLI 场景，这是更务实的选择。

## Risks / Trade-offs

- **[Risk] `submitJob` 承担了 profile dispatch 检测逻辑，增加了 command 层复杂度**
  → Mitigation: 检测逻辑仅 4 行，条件明确（有 profileId 且没有 provider），可预见性强

- **[Risk] 模板字面量检测可能误伤合法 profileId 值恰为 `${...}` 格式的极端情况**
  → Mitigation: 概率极低，profileId 是用户定义的标识符，通常不包含 `${` 前缀

- **[Risk] `injectDefaultModel` 中 `providerOptions` 为字符串时的 spread 行为**
  → Mitigation: `providerOptions` 的 Zod schema 有 `preprocess` 保护，会将非 object 转为 `undefined`。但 `injectDefaultModel` 在 `validateRequest` 之前运行，需要验证实际执行路径中 `providerOptions` 字面量是否会影响 defaultModel 注入。当前分析：字符串通过 `locateRequestInParams` 后，`existingOptions` 是字符串，其 `model` 属性为 `undefined`（JS 字符串索引 `'model'` 返回 `undefined`），所以不会提前 `return params`。`{ ...existingOptions }`（字符串 spread）会产生字符索引对象，然后 `{ ...mergedOptions }` 会包含这些字符索引 + `model`。这可能污染 request 的 providerOptions。但由于 `validateRequest` 的 `preprocess` 会过滤掉非 object，这可能是安全的（需要在测试中验证）。

- **[Risk] 端到端 smoke 测试依赖外部 API**
  → Mitigation: 使用 n1n.ai 中转站（已有配置），并做好测试环境隔离

## Migration Plan

无需迁移。本次 change 是修复性改动，向后兼容。

## Open Questions

1. **provider-edit workflow 是否需要同样的修复？**
   - 当前 scope 不包含（Non-Goal），但技术债登记。`provider-edit.ts` 有相同的 `provider: '${provider}'` 绑定。

2. **`injectDefaultModel` 中字符串 providerOptions 的 spread 是否会导致污染？**
   - 需要测试验证。理论分析：字符串 spread → 字符索引对象，但 Zod preprocess 会将其变为 undefined。需要确认 `injectDefaultModel` 的输出是否在 `validateRequest` 之前有副作用。
