# 环境与构建

## 前提条件

| 依赖 | 版本要求 |
|------|----------|
| Node.js | >= 18.x |
| pnpm | 9.15.4（项目锁定版本） |

## 安装依赖

```bash
pnpm install
```

## 构建命令

```bash
# 构建所有 workspace
pnpm build

# 构建单个包 / app
pnpm --filter @imagen-ps/core-engine build
pnpm --filter @imagen-ps/providers build
pnpm --filter @imagen-ps/workflows build
pnpm --filter @imagen-ps/shared-commands build
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/cli build
```

构建产物输出到各 workspace 的 `dist/` 目录。

## 测试命令

```bash
# 运行所有测试
pnpm test

# 运行单个包测试
pnpm --filter @imagen-ps/core-engine test
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/workflows test
pnpm --filter @imagen-ps/shared-commands test
```

测试框架：Vitest。

## Workspace 结构

```text
apps/
  app/                  # Photoshop / UXP surface
  cli/                  # Node.js CLI surface
packages/
  shared-commands/      # 公共 command facade + runtime assembly
  core-engine/
  providers/
  workflows/
```

## 本地开发

### 包间联调

本项目使用 pnpm workspace，包间依赖通过 `workspace:*` 声明。开发时：

1. 修改底层包（如 `core-engine`、`providers`、`workflows`）代码
2. 执行 `pnpm build` 或对应 `pnpm --filter <package> build`
3. 上层包自动使用最新构建产物

### Surface 调用链路

Surface app 不直接组装 runtime，而是通过 `@imagen-ps/shared-commands` 调用业务能力：

```text
apps/app 或 apps/cli -> packages/shared-commands -> runtime packages
```

### Turborepo 任务依赖

`turbo.json` 配置了任务依赖关系：

- `build`：依赖上游包先构建（`dependsOn: ["^build"]`）
- `test`：依赖本包先构建（`dependsOn: ["build"]`）
- `dev`：无缓存，持久运行

## 其他命令

```bash
# 清理构建产物
pnpm clean

# 代码检查（如已配置）
pnpm lint
```

## 注意事项

- 当前项目处于早期阶段，部分 workspace 可能暂无测试文件
- `apps/app` 是 Photoshop / UXP surface，完整 UXP 调试方式待后续补充
- `apps/cli` 是 Node.js CLI surface，必须保持不依赖 `@imagen-ps/app`