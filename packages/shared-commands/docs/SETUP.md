# Setup

## 前提条件

- Node.js ≥ 18
- pnpm ≥ 8（monorepo 管理）
- 本包为 monorepo 内部包，不单独发布

## 依赖配置

本包已在 monorepo workspace 中声明，消费方通过 workspace 协议引用：

```json
{
  "dependencies": {
    "@imagen-ps/shared-commands": "workspace:*"
  }
}
```

## 构建

```bash
# 在 monorepo 根目录
pnpm --filter @imagen-ps/shared-commands build

# 或直接在包目录
cd packages/shared-commands
pnpm build
```

构建产物输出到 `dist/`，包含 `.js`（ESM）和 `.d.ts` 类型声明。

## 初始化

本包在首次调用任何命令函数时 **自动初始化** Runtime 单例（lazy init），无需显式初始化步骤。

唯一需要在使用前配置的是 **ConfigStorageAdapter**（若需要 provider 配置持久化）：

```typescript
import { setConfigAdapter } from '@imagen-ps/shared-commands'

// 在应用启动时注入 surface-specific 存储适配器
setConfigAdapter({
  async get(providerId) { /* 从存储读取 */ },
  async save(providerId, config) { /* 写入存储 */ },
})
```

若不调用 `setConfigAdapter()`，默认使用内存存储（进程退出后配置丢失）。

## 测试

```bash
cd packages/shared-commands
pnpm test
```

使用 Vitest 运行单元测试。
