# SETUP.md

## 前提条件

| 要求 | 版本 |
|------|------|
| Node.js | ≥ 20 |
| pnpm | ≥ 9 |

本模块是 monorepo 的一部分，需要从根目录安装依赖。

## 依赖配置

`@imagen-ps/providers` 是 workspace 内部包，在 monorepo 内其他包中引用：

```json
{
  "dependencies": {
    "@imagen-ps/providers": "workspace:*"
  }
}
```

关键依赖：

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@imagen-ps/core-engine` | workspace | JobError、ProviderDispatchAdapter 类型 |
| `zod` | ^4.3.6 | Schema 校验 |

## 安装

从 monorepo 根目录执行：

```bash
pnpm install
```

## 构建

从 monorepo 根目录执行：

```bash
pnpm build
```

或仅构建本模块：

```bash
cd packages/providers
pnpm build
```

构建产物输出到 `dist/` 目录。

## 测试

```bash
# 从 providers 目录
pnpm test

# 或从根目录
pnpm --filter @imagen-ps/providers test
```

## 清理

```bash
pnpm clean
```

## TypeScript 配置

本模块使用双配置模式：

- `tsconfig.json` - 开发时 IDE 使用
- `tsconfig.build.json` - 构建时使用，排除测试文件
