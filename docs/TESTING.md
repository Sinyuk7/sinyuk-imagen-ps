# 测试规范

## 测试策略

### 测试层次

| 层次 | 覆盖范围 | 工具 |
|------|----------|------|
| 单元测试 | 单个函数/模块的逻辑 | Vitest |
| 集成测试 | 跨模块交互 | Vitest |
| 契约测试 | 包间接口稳定性 | Vitest + 类型检查 |

### 各包测试范围

#### core-engine

| 测试目标 | 文件 | 状态 |
|----------|------|------|
| dispatch | `src/dispatch.test.ts` | ✅ 已有 |
| registry | `src/registry.test.ts` | ✅ 已有 |
| runner | `src/runner.test.ts` | ✅ 已有 |
| runtime | `src/runtime.test.ts` | ✅ 已有 |

重点测试方向：
- failure taxonomy
- `assertSerializable`
- `deepFreeze`
- lifecycle state transitions
- workflow binding resolution

#### providers

| 测试目标 | 文件 | 状态 |
|----------|------|------|
| openai-compatible HTTP | `tests/openai-compatible-http.test.ts` | ✅ 已有 |
| openai-compatible provider | `tests/openai-compatible-provider.test.ts` | ✅ 已有 |

重点测试方向：
- schema validation
- mock provider invoke contract
- real provider boundary transform

#### workflows

| 测试目标 | 文件 | 状态 |
|----------|------|------|
| builtins | `tests/builtins.test.ts` | ✅ 已有 |

重点测试方向：
- workflow spec 结构正确性
- builtin workflow 与 runtime 集成

## 测试工具与框架

### Vitest

所有包使用 Vitest 作为测试框架。

```typescript
import { describe, it, expect } from 'vitest';

describe('feature', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});
```

### 配置

各包在 `package.json` 中配置测试脚本：

```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

## 运行测试

### 运行所有测试

```bash
pnpm test
```

### 运行单个包测试

```bash
pnpm --filter @imagen-ps/core-engine test
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/workflows test
```

### 监视模式

```bash
pnpm --filter @imagen-ps/core-engine test -- --watch
```

## 覆盖率要求

TODO: 覆盖率门槛待定义。

当前阶段优先保证：
- 关键共享边界有测试覆盖
- 核心 happy path 可验证
- 错误处理路径有基本覆盖

## 测试命名约定

```
{module}.test.ts          # 单元测试
{module}.integration.ts   # 集成测试（如需要）
```

## 测试最佳实践

1. **测试公开 API**：优先测试导出的公开接口，不测试内部实现细节
2. **独立可运行**：每个测试文件应能独立运行
3. **清晰的断言**：使用明确的 expect 语句，避免隐式断言
4. **mock 外部依赖**：网络请求、文件系统等外部依赖应 mock

## 暂不进入正式测试门槛

- UXP 页面交互测试
- Photoshop writeback 测试
- cancel / abandon 测试
- queued jobs / eviction 测试
- durable history recovery 测试
- web route-level product flows 测试
