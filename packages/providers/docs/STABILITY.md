# STABILITY.md

## 稳定性要求

本模块作为 provider 语义层，承担外部 API 调用的稳定性保障。

### 错误率约束

| 指标 | 要求 |
|------|------|
| Schema 校验通过率 | 对于合法输入，100% |
| Transport 层错误映射覆盖率 | 已知 HTTP 错误码 100% |

### 性能基线

| 操作 | 预期 | 备注 |
|------|------|------|
| `validateConfig()` | < 5ms | 纯 schema 校验，无 IO |
| `validateRequest()` | < 5ms | 纯 schema 校验，无 IO |
| `registry.list()` | < 1ms | 内存操作 |
| `registry.get()` | < 1ms | Map 查询 |

> HTTP 调用耗时取决于外部服务，不在本模块性能基线范围内。

## 异常处理策略

### 校验失败

```typescript
// validateConfig / validateRequest 失败时
// 抛出 ProviderValidationError，携带结构化 issues
{
  name: 'ProviderValidationError',
  message: 'Config validation failed: ...',
  details: {
    issues: [{ path: 'apiKey', message: 'Required' }]
  }
}
```

**上层处理**：bridge 将其转换为 `JobError { category: 'validation' }`。

### 调用失败

```typescript
// invoke() 失败时
// 抛出 ProviderInvokeError
{
  name: 'ProviderInvokeError',
  message: 'HTTP 401: Unauthorized',
  details: { statusCode: 401 }
}
```

**上层处理**：bridge 将其转换为 `JobError { category: 'provider' }`。

### Transport 层错误映射

| HTTP 状态码 | 错误 kind | 是否可重试 |
|------------|----------|----------|
| 400 | `bad_request` | 否 |
| 401 | `unauthorized` | 否 |
| 403 | `forbidden` | 否 |
| 404 | `not_found` | 否 |
| 429 | `rate_limited` | 是 |
| 500 | `server_error` | 是 |
| 502/503/504 | `gateway_error` | 是 |
| 网络错误 | `network_error` | 是 |
| 超时 | `timeout` | 是 |

## 降级策略

### Mock Provider 降级

当真实 provider 不可用时，可使用 mock provider 作为功能降级：

```typescript
const provider = registry.get(providerId) ?? registry.get('mock');
```

**注意**：mock provider 仅用于开发和测试，不应在生产环境作为真正的降级方案。

### Transport Retry 策略

默认 retry 策略：

| 配置项 | 默认值 |
|-------|-------|
| 最大重试次数 | 3 |
| 初始延迟 | 1000ms |
| 延迟增长 | 指数退避 |
| 可重试错误 | 网络错误、超时、5xx、429 |

## 监控与告警

### 关键指标

| 指标 | 说明 |
|------|------|
| `provider.invoke.duration` | 单次调用耗时 |
| `provider.invoke.error.rate` | 调用错误率 |
| `provider.validation.error.rate` | 校验错误率 |
| `transport.retry.count` | 重试次数分布 |

### 诊断信息

`ProviderInvokeResult` 携带 `diagnostics` 字段，记录调用过程中的诊断信息：

```typescript
interface ProviderDiagnostic {
  code: string;       // 诊断码，如 'http.retry'
  message: string;    // 人类可读消息
  level: 'info' | 'warning' | 'error';
  details?: Record<string, unknown>;
}
```

## 待定项

- TODO: 具体性能基线数值需要基于压测确定
- TODO: 生产环境监控接入方案待定
