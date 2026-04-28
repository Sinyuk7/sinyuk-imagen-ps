# 环境与构建

## 前提条件

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- TypeScript >= 5.7.0

### Monorepo 依赖

本模块是 `sinyuk-imagen-ps` monorepo 的一部分，需要先完成根级依赖安装：

```bash
# 在 monorepo 根目录执行
pnpm install
```

## 依赖配置

### package.json 配置

```json
{
  "name": "@imagen-ps/app",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@imagen-ps/core-engine": "workspace:*",
    "@imagen-ps/providers": "workspace:*",
    "@imagen-ps/workflows": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

### Workspace 依赖说明

- `workspace:*`：使用 pnpm workspace 协议链接本地包
- 共享包会自动从 `packages/` 目录解析

## 初始化

### 插件入口初始化

```typescript
import { createPluginHostShell, AppShell } from "@imagen-ps/app";

// 创建 host shell 实例
const pluginHost = createPluginHostShell();

// 在 React 中使用
<AppShell host={pluginHost} />
```

### 初始化时机

- 在 UXP 插件加载时调用 `createPluginHostShell()`
- host shell 实例创建后即可传递给 `AppShell` 组件

## 构建命令

```bash
# 在 app/ 目录执行
pnpm build          # TypeScript 编译
pnpm test           # 运行测试
pnpm clean          # 清理构建产物

# 在 monorepo 根目录执行
pnpm build          # 构建所有模块
pnpm test           # 测试所有模块
```

### 构建输出

- 输出目录：`dist/`
- TypeScript 配置：`tsconfig.build.json`

## 开发环境

### TypeScript 配置

本模块使用两个 TypeScript 配置文件：

- `tsconfig.json`：开发时 IDE 使用
- `tsconfig.build.json`：构建时使用，排除测试文件

### 与 UXP 的集成

TODO: UXP 插件打包和调试流程待后续阶段补充。

## 常见问题

### 依赖解析失败

如果出现 workspace 依赖解析失败，确保：

1. 在 monorepo 根目录执行过 `pnpm install`
2. 共享包已成功构建：`pnpm build`
3. `pnpm-workspace.yaml` 配置正确
