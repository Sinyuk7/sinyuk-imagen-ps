# CODE_CONVENTIONS.md

## 命名约定

### 类型

| 类别 | 约定 | 示例 |
|------|------|------|
| 接口 | PascalCase，名词性 | `Provider`, `ProviderRegistry` |
| 类型别名 | PascalCase | `ProviderFamily`, `ProviderConfig` |
| 泛型参数 | `T` + PascalCase | `TConfig`, `TRequest` |

### 函数

| 类别 | 约定 | 示例 |
|------|------|------|
| 工厂函数 | `create` + 名词 | `createProviderRegistry()`, `createMockProvider()` |
| 校验函数 | `validate` + 名词 | `validateConfig()`, `validateRequest()` |
| 判断函数 | `is` + 形容词/名词 | `isJobErrorLike()` |

### 文件

| 类别 | 约定 | 示例 |
|------|------|------|
| 类型定义 | 领域名词 | `capability.ts`, `provider.ts` |
| 实现文件 | 功能名词 | `provider-registry.ts`, `http.ts` |
| Schema 文件 | 名词 + `-schema` | `config-schema.ts`, `request-schema.ts` |

### 错误

| 类别 | 约定 | 示例 |
|------|------|------|
| 错误类名 | `*Error` | `ProviderValidationError`, `RegistryError` |
| 错误 code | `snake_case` | `duplicate_id`, `not_found` |

## 禁用模式

### 1. 禁止在 provider 内部直接调用裸 fetch

```typescript
// ❌ 禁止
const response = await fetch(url, options);

// ✅ 使用 transport 层
import { httpRequest } from '../../transport/openai-compatible/http.js';
const result = await httpRequest(request);
```

**原因**：裸 fetch 无法保证统一的 retry、timeout、error mapping 行为。

### 2. 禁止在 provider 内部硬编码 API Key

```typescript
// ❌ 禁止
const apiKey = 'sk-xxx';

// ✅ 从 config 获取
const { apiKey } = config;
```

**原因**：API Key 由上层 adapter 管理和注入。

### 3. 禁止 engine 理解 provider 参数语义

```typescript
// ❌ 禁止在 engine 中
if (provider.family === 'openai-compatible') {
  request.model = 'dall-e-3';
}

// ✅ 参数语义留在 provider 内部
// provider.ts
const model = config.defaultModel ?? 'dall-e-3';
```

**原因**：保持 engine 与 provider 的边界清晰。

### 4. 禁止抛出非结构化错误

```typescript
// ❌ 禁止
throw new Error('Config validation failed');

// ✅ 使用结构化错误
throw createValidationError('Config validation failed', { issues });
```

**原因**：统一错误结构便于上层消费。

### 5. 禁止在 schema 之外进行类型断言

```typescript
// ❌ 禁止
const config = input as ProviderConfig;

// ✅ 使用 schema 校验
const result = configSchema.safeParse(input);
if (!result.success) throw createValidationError(...);
return result.data;
```

**原因**：运行时类型安全必须通过 schema 保证。

## 推荐模式

### 1. Provider 实现模板

```typescript
export function createXxxProvider(): Provider<XxxConfig, XxxRequest> {
  return {
    id: xxxDescriptor.id,
    family: xxxDescriptor.family,

    describe(): ProviderDescriptor {
      return xxxDescriptor;
    },

    validateConfig(input: unknown): XxxConfig {
      const result = xxxConfigSchema.safeParse(input);
      if (!result.success) {
        throw createValidationError('...', { issues: ... });
      }
      return result.data;
    },

    validateRequest(input: unknown): XxxRequest {
      // 同上
    },

    async invoke(args): Promise<ProviderInvokeResult> {
      // 实现调用逻辑
    },
  };
}
```

### 2. 错误创建函数

```typescript
function createValidationError(
  message: string,
  details?: Record<string, unknown>,
): ProviderValidationError {
  const err = new Error(message) as ProviderValidationError;
  err.details = details;
  err.name = 'ProviderValidationError';
  return err;
}
```

## 代码审查要点

1. **Schema 校验完整性**：所有外部输入（config, request）必须经过 schema 校验
2. **错误结构化**：所有抛出的错误必须携带 `name` 和可选的 `details`
3. **Transport 隔离**：HTTP 调用必须通过 `transport/` 层
4. **边界清晰**：不向 engine 泄漏 provider 参数语义
5. **类型导出**：公开类型必须在 `index.ts` 中显式导出
