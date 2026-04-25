# Setup — @imagen-ps/workflows

## 前提条件

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- 已克隆 `sinyuk-imagen-ps` monorepo

## 依赖配置

### 作为 monorepo 内部包使用

在需要使用 workflows 的包中添加依赖：

```json
// package.json
{
  "dependencies": {
    "@imagen-ps/workflows": "workspace:*"
  }
}
```

然后执行：

```bash
pnpm install
```

### 本模块依赖

本模块仅依赖 `@imagen-ps/core-engine`：

```json
{
  "dependencies": {
    "@imagen-ps/core-engine": "workspace:*"
  }
}
```

## 构建

```bash
# 在 monorepo 根目录
pnpm build

# 或只构建 workflows 包
cd packages/workflows
pnpm build
```

构建产物输出到 `dist/` 目录。

## 测试

```bash
# 在 monorepo 根目录
pnpm test

# 或只测试 workflows 包
cd packages/workflows
pnpm test
```

## 初始化

`@imagen-ps/workflows` 是 pure data 包，无需初始化过程。直接导入即可使用：

```typescript
import {
  builtinWorkflows,
  providerGenerateWorkflow,
  providerEditWorkflow,
} from '@imagen-ps/workflows';
```

### 与 core-engine 集成

```typescript
import { createRuntime } from '@imagen-ps/core-engine';
import { builtinWorkflows } from '@imagen-ps/workflows';

const runtime = createRuntime({
  initialWorkflows: builtinWorkflows,
  adapters: [/* your provider adapters */],
});
```

## 验证安装

```bash
# 编译检查
cd packages/workflows
pnpm build

# 运行测试
pnpm test
```

预期输出：所有测试通过，无类型错误。
