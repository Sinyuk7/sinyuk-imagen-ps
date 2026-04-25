# Setup

## 前提条件

- Node.js >= 18
- pnpm >= 8（monorepo 包管理）
- TypeScript >= 5.7

## 依赖配置

### 在 monorepo 内使用

`core-engine` 是 `@imagen-ps/core-engine` 内部包，在 monorepo 其他包中直接引用：

```json
// package.json
{
  "dependencies": {
    "@imagen-ps/core-engine": "workspace:*"
  }
}
```

### 依赖安装

```bash
# 在 monorepo 根目录
pnpm install
```

## 构建

```bash
# 构建 core-engine
cd packages/core-engine
pnpm build

# 或在 monorepo 根目录构建所有包
pnpm -r build
```

构建产物输出到 `dist/` 目录，包含：
- `dist/index.js` — ESM 格式主入口
- `dist/index.d.ts` — TypeScript 类型声明

## 测试

```bash
# 运行单元测试
pnpm test
```

测试使用 Vitest，配置在 `vitest.config.*` 或 `package.json` 中。

## 初始化

`core-engine` 通过 `createRuntime()` 函数创建运行时实例。初始化时机由上层应用决定。

```typescript
import { createRuntime } from '@imagen-ps/core-engine';

// 最简初始化
const runtime = createRuntime();

// 带初始 workflows 和 adapters 的初始化
const runtime = createRuntime({
  initialWorkflows: [/* workflow definitions */],
  adapters: [/* provider dispatch adapters */],
});
```

详细使用方式见 [USAGE.md](./USAGE.md)。
