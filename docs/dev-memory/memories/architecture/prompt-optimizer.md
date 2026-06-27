# Prompt Optimizer 开发参考

> 面向开发者的事实速查：默认配置在哪改、文案在哪改、链路怎么走、怎么调试。
> 不是用户文档。代码是唯一真相，本文只是索引。

## 一句话

系统内置一个唯一、不可删除的 Prompt Optimizer Profile（`__prompt-optimizer__`）。
用户在 Settings 里配 Base URL / API Key / Model / Instruction，点 Test 验证通过后
`enabled = true`，Composer 的 Optimize 按钮自动可用。点击后复用现有 Provider dispatch
链路，把 instruction + 当前输入文本发给 chat/completions，返回的优化文本回填输入框，
按钮临时变成 Undo。

## Codemap（文件 → 职责）

### Provider 层

| 文件 | 职责 |
|---|---|
| `packages/providers/src/providers/prompt-optimize/defaults.ts` | `DEFAULT_OPTIMIZER_INSTRUCTION` 常量，仅用于初始化内置 Profile |
| `packages/providers/src/providers/prompt-optimize/descriptor.ts` | 静态 descriptor：`id/family = 'prompt-optimize'`，`operations: ['prompt_optimize']` |
| `packages/providers/src/providers/prompt-optimize/config-schema.ts` | Zod schema，含 `instruction`（必填）、`testPrompt`（可选） |
| `packages/providers/src/providers/prompt-optimize/request-schema.ts` | Zod schema：`{ operation: 'prompt_optimize', prompt, providerOptions? }`，不携带 image/output 字段 |
| `packages/providers/src/providers/prompt-optimize/build-request.ts` | 构造 `{ model, messages: [system(instruction), user(prompt)] }` |
| `packages/providers/src/providers/prompt-optimize/parse-response.ts` | 从 `choices[0].message.content` 提取文本（支持 string 和 array parts） |
| `packages/providers/src/providers/prompt-optimize/models.ts` | 解析 `/models` 响应，不做 image-only 过滤 |
| `packages/providers/src/providers/prompt-optimize/provider.ts` | provider 实现：validateRequest 用专用 schema；invoke 返回 `{ assets: [], raw }`；discoverModels 复用 `httpRequest` |
| `packages/providers/src/providers/prompt-optimize/index.ts` | 导出 |
| `packages/providers/src/contract/capability.ts` | `ProviderFamily += 'prompt-optimize'`；`ProviderOperation += 'prompt_optimize'` |
| `packages/providers/src/contract/request.ts` | `PromptOptimizeRequest` 接口 + `ProviderRequest` 联合 |
| `packages/providers/src/contract/provider.ts` | `ProviderDispatchBridgeArgs/ProviderDispatchBridge` 接受 `ProviderRequest` 联合 |
| `packages/providers/src/contract/config.ts` | `PromptOptimizeProviderConfig` 接口 + `ProviderConfig` 联合 |
| `packages/providers/src/registry/provider-registry.ts` | Registry 接受 `Provider<ProviderConfig, ProviderRequest>`，支持多 family 共存 |
| `packages/providers/src/registry/builtins.ts` | 注册 `createPromptOptimizeProvider()` |
| `packages/providers/src/index.ts` | 包级导出（含 `DEFAULT_OPTIMIZER_INSTRUCTION`、`parsePromptOptimizeResponse`） |

### Application 层

| 文件 | 职责 |
|---|---|
| `packages/application/src/commands/prompt-optimize.ts` | 全部业务命令：`ensurePromptOptimizerProfile` / `optimizePrompt` / `validatePromptOptimizerProfile` / `extractPromptOptimizeText` / `PROMPT_OPTIMIZER_PROFILE_ID` |
| `packages/application/src/commands/provider-profiles.ts` | `deleteProviderProfile` 拒绝保留 ID；`saveProviderProfile` 拒绝保留 ID 改 providerId |
| `packages/application/src/commands/index.ts` | 导出新命令 |

### UI 层

| 文件 | 职责 |
|---|---|
| `apps/app/src/shared/ports/commands-port.ts` | `CommandsPort` 接口 + adapter，暴露 3 个新命令 |
| `apps/app/src/shared/ui/app-shell.tsx` | 启动时 `ensurePromptOptimizerProfile`；过滤普通 Profile 列表；传 `promptOptimizerProfile` 给 MainPage / SettingsPage |
| `apps/app/src/shared/ui/pages/main-page.tsx` | Composer Optimize / Loading / Undo 三态按钮、回填、编辑重置 |
| `apps/app/src/shared/ui/pages/settings-page.tsx` | Settings 列表页固定 Prompt Optimizer 入口 |
| `apps/app/src/shared/ui/pages/settings-detail-page.tsx` | 详情页：Instruction 字段、隐藏 Delete、Test 调 `validatePromptOptimizerProfile` |
| `apps/app/src/shared/ui/hooks/use-provider-settings.ts` | `providerConfigFromForm` 支持 `instruction` 参数 |
| `apps/app/src/shared/ui/i18n/messages.ts` | 所有文案 |

### 测试

| 文件 | 覆盖 |
|---|---|
| `packages/providers/tests/prompt-optimize-provider.test.ts` | build/parse/discoverModels/invoke/空响应 |
| `packages/application/src/commands/prompt-optimize.test.ts` | ensure/optimize/validate/delete 保护/save 保护 |
| `apps/app/tests/main-page.test.tsx` | optimize 回填 |
| `apps/app/tests/fakes.ts` | `fakeOptimizerProfile` + 3 个命令 mock |

## 默认配置在哪改

### 默认 Instruction

`packages/providers/src/providers/prompt-optimize/defaults.ts:2`

```ts
export const DEFAULT_OPTIMIZER_INSTRUCTION =
  'You are an expert prompt engineer for image generation models. ' +
  'Rewrite the user prompt to be clearer, more vivid, and more detailed while preserving intent. ' +
  'Return only the optimized prompt text without explanations or quotes.';
```

这个常量**只在** `ensurePromptOptimizerProfile()` 初始化内置 Profile 时写入 config。
之后运行时只读 `profile.config.instruction`，不再 fallback。改这个常量只影响**新建**
的内置 Profile；已存在的 Profile 不会自动更新（需要手动改 config 或删掉 Profile 重新 ensure）。

### 默认 testPrompt

`packages/application/src/commands/prompt-optimize.ts:22`

```ts
const DEFAULT_TEST_PROMPT = 'test';
```

`validatePromptOptimizerProfile` 优先读 `config.testPrompt`，为空才 fallback 到 `'test'`。
初始化时写入 `config.testPrompt = 'test'`。

### 默认 model

`packages/providers/src/providers/prompt-optimize/build-request.ts:16`

```ts
function resolveModel(request, defaultModel?) {
  return typeof request.providerOptions?.model === 'string'
    ? request.providerOptions.model
    : (defaultModel ?? 'gpt-4o-mini');
}
```

Provider 自身的硬编码 fallback 是 `'gpt-4o-mini'`。实际运行时优先级：
`request.providerOptions.model` → `config.defaultModel` → `'gpt-4o-mini'`。

### 默认 endpoint

`packages/providers/src/providers/prompt-optimize/provider.ts:62`

```ts
const url = endpointUrl(config.baseURL, 'chat/completions');
```

固定走 `chat/completions`。`discoverModels` 走 `models`。

## 内置 Profile

### ID

`packages/application/src/commands/prompt-optimize.ts:18`

```ts
export const PROMPT_OPTIMIZER_PROFILE_ID = '__prompt-optimizer__';
```

### 初始化时机

`apps/app/src/shared/ui/app-shell.tsx` mount 时调用一次：

```ts
useEffect(() => {
  void services.commands.ensurePromptOptimizerProfile().then((result) => {
    if (result.ok) {
      void profilesState.reload();
    }
  });
}, [services]);
```

### 初始化内容

`ensurePromptOptimizerProfile` 在 Profile 不存在时创建：

```ts
{
  profileId: '__prompt-optimizer__',
  providerId: 'prompt-optimize',
  displayName: 'Prompt Optimizer',
  enabled: false,                    // 未验证前 disabled
  config: {
    providerId: 'prompt-optimize',
    displayName: 'Prompt Optimizer',
    family: 'prompt-optimize',
    baseURL: '',                     // 用户填
    defaultModel: '',
    instruction: DEFAULT_OPTIMIZER_INSTRUCTION,
    testPrompt: 'test',
  },
}
```

### 保护

- `deleteProviderProfile('__prompt-optimizer__')` → validation error
- `saveProviderProfile({ profileId: '__prompt-optimizer__', providerId: '非prompt-optimize' })` → validation error
- Settings 详情页隐藏 Delete 按钮

## 文案在哪改

全部在 `apps/app/src/shared/ui/i18n/messages.ts`，EN 和 ZH 两份。

| key | EN | ZH | 用途 |
|---|---|---|---|
| `main.promptOptimize` | `Optimize prompt` | `优化提示词` | 按钮 tooltip（idle） |
| `main.promptOptimizeUndo` | `Undo` | `撤销` | 按钮 tooltip（optimized） |
| `main.promptOptimizing` | `Optimizing…` | `优化中…` | 预留 |
| `main.promptOptimizeNoProfile` | `Configure Prompt Optimizer in Providers` | `请在 Providers 中配置 Prompt Optimizer` | 未配置时提示 |
| `main.promptOptimizeEmpty` | `Enter a prompt first` | `请先输入提示词` | 空输入提示 |
| `toast.promptOptimized` | `Prompt optimized` | `提示词已优化` | 成功 toast |
| `toast.promptOptimizeNoChanges` | `No changes were suggested` | `没有建议的修改` | 结果与原文相同 |
| `toast.promptOptimizeFailed` | `Prompt optimization failed` | `提示词优化失败` | 失败 toast |

`main.promptOptimizePlaceholder`（`即将支持`）已废弃，不再使用但 key 保留。

## 执行链路

### Optimize

```
用户点击 Optimize
  → main-page.tsx handleOptimize()
    → services.commands.optimizePrompt({ prompt })
      → prompt-optimize.ts optimizePrompt()
        1. 读取 __prompt-optimizer__ profile
        2. 校验 enabled === true
        3. runtime.dispatcher.dispatch({
             provider: 'profile',
             params: {
               profileId: '__prompt-optimizer__',
               request: { operation: 'prompt_optimize', prompt }
           })
           → createProfileAwareDispatchAdapter (runtime.ts)
             → resolve profile config（含 apiKey secret）
             → capability guard（descriptor.operations 含 'prompt_optimize' ✓）
             → injectDefaultModel
             → createDispatchAdapter → provider.invoke()
               → validateRequest 校验专用 prompt_optimize schema
               → buildPromptOptimizeRequestBody（system + user messages）
               → httpRequest POST chat/completions
               → 返回 { assets: [], raw: response.data }
        4. parsePromptOptimizeResponse(result.raw) → text
        5. trim 后为空 → provider error
        6. 返回 { ok: true, value: text }
  → UI setInput(text) + setOptimizeState({ status: 'optimized', source, result })
  → 按钮变 Undo
```

### Validate

```
用户在 Settings 点 Test connection
  → settings-detail-page.tsx test()
    → persistProfile()（保存当前表单）
    → services.commands.validatePromptOptimizerProfile(profileId)
      → prompt-optimize.ts validatePromptOptimizerProfile()
        1. 读取 profile
        2. resolve config
        3. 读 config.testPrompt ?? 'test'
        4. dispatch（同 Optimize，但 prompt = testPrompt）
        5. parsePromptOptimizeResponse → text
        6. 为空 → provider error
        7. 保存 profile.enabled = true
        8. 返回 { ok: true, value: text }
    → UI 显示 success status
```

### Undo

```
用户点击 Undo（按钮在 optimized 且 input === result 时显示）
  → main-page.tsx handleUndoOptimize()
    → setInput(optimizeState.source)
    → setOptimizeState({ status: 'idle' })
  → 按钮恢复 Optimize
```

### 编辑重置

```
用户在 optimized 状态下编辑输入框
  → input !== optimizeState.result
  → useEffect 自动 setOptimizeState({ status: 'idle' })
  → 按钮恢复 Optimize
```

## UI 状态机

`apps/app/src/shared/ui/pages/main-page.tsx`

```ts
type OptimizeState =
  | { status: 'idle' }
  | { status: 'optimizing'; source: string }
  | { status: 'optimized'; source: string; result: string };
```

| 状态 | 按钮 | icon | disabled |
|---|---|---|---|
| idle | Optimize | magic-wand | `!canOptimize` |
| optimizing | Optimize | spinner spin | true |
| optimized + input === result | Undo | refresh | false |
| optimized + input !== result | Optimize | magic-wand | `!canOptimize` |

`canOptimize`：

```ts
const optimizerReady = Boolean(promptOptimizerProfile?.enabled);
const canOptimize = optimizerReady && input.trim().length > 0 && !optimizing;
```

注意：**不**与 `conversation.running` 互斥。生成进行中也能 Optimize。

请求期间禁用：textarea、send 按钮、optimize 按钮自身。其他选择器不受影响。

## 调试

### 快速验证 Provider 解析

```bash
pnpm --filter @imagen-ps/providers test prompt-optimize
```

### 快速验证 Application 命令

```bash
pnpm --filter @imagen-ps/application test prompt-optimize
```

### 快速验证 UI 回填

```bash
pnpm --filter @imagen-ps/app test main-page
```

### 手动改内置 Profile config

内置 Profile 和普通 Profile 一样存在 `ProviderProfileRepository` 里。

- CLI：`~/.imagen-ps/provider-profiles.json` 里找 `__prompt-optimizer__`
- UXP/Chrome：IndexedDB（取决于注入的 repository adapter）

可以直接改 JSON / DB 里的 `config.instruction`、`config.testPrompt`、`config.baseURL`、
`config.defaultModel`，重启后生效（因为 `ensure` 只在不存在时创建）。

### 手动重置内置 Profile

删掉 `__prompt-optimizer__` 这条 Profile，重启 app，`ensure` 会用默认值重建。
但 `deleteProviderProfile` 命令拒绝删除保留 ID，所以需要直接操作 repository / 文件。

### 观察 dispatch 是否走到 prompt-optimize

`provider.invoke` 返回 `{ assets: [], raw }`。如果 `optimizePrompt` 报
`Prompt optimizer returned empty response`，说明 `parsePromptOptimizeResponse` 没从
`raw` 里提取到文本。检查后端返回的 `choices[0].message.content` 结构。

### 并发保护

`optimizePrompt` 内部有模块级 `optimizeInFlight` flag，同一时间只允许一个优化请求。
第二个并发调用直接返回 validation error。

## Result Contract 说明

本功能**不改** `ProviderInvokeResult`。优化文本通过 `result.raw` 传递，由 Application 层
`parsePromptOptimizeResponse` 解析。这是当前唯一一处生产代码依赖 `raw`，已在设计时确认。
如果未来需要更正式的文本结果通道，再考虑加 `text?: string` 到 `ProviderInvokeResult`。

## 测试断言更新清单

新增 `prompt-optimize` provider 后，以下测试的 provider ID 列表断言已更新：

- `packages/providers/tests/registry-exports.test.ts`
- `apps/app/tests/chrome-adapter.test.ts`
- `apps/cli/tests/contract/basic.contract.test.ts`

`apps/cli/tests/smoke/cli-e2e.test.ts` 的 `EntrySpec` 类型未扩展 `prompt-optimize`，
因为 smoke 配置是外部 JSON，不影响默认 CI。
