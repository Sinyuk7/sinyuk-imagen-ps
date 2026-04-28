# 环境与构建

## 前提条件

| 要求 | 版本 |
|------|------|
| Node.js | ≥ 18.x（ESM 原生支持） |
| pnpm | ≥ 8.x |
| TypeScript | ^5.4.0（由 monorepo 统一管理） |

## 依赖配置

CLI 作为 monorepo workspace 成员，依赖通过 pnpm workspace 协议解析：

```json
// apps/cli/package.json
{
  "dependencies": {
    "@imagen-ps/shared-commands": "workspace:*",
    "commander": "^12.1.0"
  }
}
```

安装所有依赖：

```bash
# 在 monorepo 根目录
pnpm install
```

## 构建

```bash
# 仅构建 CLI
pnpm --filter @imagen-ps/cli build

# 监听模式开发
pnpm --filter @imagen-ps/cli dev

# 全量构建（含上游依赖）
pnpm build
```

构建输出位于 `apps/cli/dist/`，入口为 `dist/index.js`。

## 运行

```bash
# 直接运行
node apps/cli/dist/index.js <command>

# 通过 pnpm start
pnpm --filter @imagen-ps/cli start -- <command>
```

## 测试

```bash
pnpm --filter @imagen-ps/cli test
```

使用 Vitest 运行，无需真实网络或 Photoshop 环境。

## 配置文件位置

CLI 使用 `~/.imagen-ps/config.json` 存储 provider 配置。首次运行 `provider config save` 时自动创建。
