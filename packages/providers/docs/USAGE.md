# USAGE.md

## 核心 API

### Registry

| API | 说明 |
|-----|------|
| `createProviderRegistry()` | 创建内存级 provider 注册表 |
| `registerBuiltins(registry)` | 注册内置 providers (mock, openai-compatible) |
| `registry.register(provider)` | 注册单个 provider |
| `registry.get(providerId)` | 按 ID 获取 provider |
| `registry.list()` | 列出所有 provider descriptors |

### Provider

| API | 说明 |
|-----|------|
| `createMockProvider(options?)` | 创建 mock provider 实例 |
| `createOpenAICompatibleProvider()` | 创建 OpenAI 兼容 provider 实例 |
| `provider.describe()` | 获取 provider descriptor |
| `provider.validateConfig(input)` | 校验配置，失败时抛出 ProviderValidationError |
| `provider.validateRequest(input)` | 校验请求，失败时抛出 ProviderValidationError |
| `provider.invoke(args)` | 执行调用，返回 ProviderInvokeResult |

### Bridge

| API | 说明 |
|-----|------|
| `createDispatchAdapter({ provider, config })` | 创建 engine 可消费的 dispatch adapter |

## 典型用法

### 1. 初始化 Registry

```typescript
import {
  createProviderRegistry,
  registerBuiltins,
} from '@imagen-ps/providers';

const registry = createProviderRegistry();
registerBuiltins(registry);

// 或手动注册
import { createMockProvider } from '@imagen-ps/providers';
registry.register(createMockProvider());
```

### 2. 校验 Config 并创建 Dispatch Adapter

```typescript
import { createDispatchAdapter } from '@imagen-ps/providers';

const provider = registry.get('openai-compatible');
if (!provider) throw new Error('Provider not found');

// 校验 config
const config = provider.validateConfig({
  providerId: 'openai-compatible',
  displayName: 'OpenAI',
  family: 'openai-compatible',
  baseURL: 'https://api.openai.com',
  apiKey: 'sk-xxx',
  defaultModel: 'dall-e-3',
});

// 创建 dispatch adapter 供 engine 使用
const adapter = createDispatchAdapter({ provider, config });
```

### 3. 使用 Mock Provider 进行测试

```typescript
import { createMockProvider } from '@imagen-ps/providers';

// 基础 mock
const mockProvider = createMockProvider();

// 带延迟
const delayedMock = createMockProvider();
const config = delayedMock.validateConfig({
  providerId: 'mock',
  displayName: 'Mock',
  family: 'openai-compatible',
  baseURL: 'https://mock.local',
  apiKey: 'mock-key',
  delayMs: 500,
});

// 强制失败模式
const failingConfig = delayedMock.validateConfig({
  // ... 基础字段
  failMode: { type: 'always' },
});

// 概率失败模式（可注入随机源）
const probabilisticMock = createMockProvider({
  random: () => 0.3, // 固定随机值，便于测试
});
```

## 类型导出

```typescript
// Contract types
import type {
  Provider,
  ProviderDescriptor,
  ProviderConfig,
  ProviderInvokeArgs,
  ProviderInvokeResult,
  CanonicalImageJobRequest,
  ProviderCapabilities,
  ProviderFamily,
  ProviderOperation,
} from '@imagen-ps/providers';

// Registry types
import type { ProviderRegistry, RegistryError } from '@imagen-ps/providers';

// Config types
import type {
  MockProviderConfig,
  OpenAICompatibleProviderConfig,
} from '@imagen-ps/providers';
```

## 注意事项

1. **Config 必须先校验**：在调用 `invoke()` 或 `createDispatchAdapter()` 前，必须先通过 `validateConfig()` 校验配置。

2. **Registry 是内存级**：`ProviderRegistry` 不负责持久化，config 存储由上层 adapter 处理。

3. **Mock Provider 仅用于测试**：不要在生产环境使用 mock provider。

4. **当前只支持 generate 操作**：OpenAI-compatible provider 当前只支持 `operation: 'generate'`，edit 操作尚未实现。

5. **API Key 安全**：Config 中的 `apiKey` 应由上层 secret storage adapter 管理，不要硬编码。
