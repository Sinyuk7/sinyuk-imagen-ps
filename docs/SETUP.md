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
# 构建所有包
pnpm build

# 构建单个包
pnpm --filter @imagen-ps/core-engine build
pnpm --filter @imagen-ps/providers build
pnpm --filter @imagen-ps/workflows build
pnpm --filter @imagen-ps/app build
```

构建产物输出到各包的 `dist/` 目录。

## 测试命令

```bash
# 运行所有测试
pnpm test

# 运行单个包测试
pnpm --filter @imagen-ps/core-engine test
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/workflows test
```

测试框架：Vitest

## 其他命令

```bash
# 清理构建产物
pnpm clean

# 代码检查（如已配置）
pnpm lint
```

## 本地开发

### 包间联调

本项目使用 pnpm workspace，包间依赖通过 `workspace:*` 声明。开发时：

1. 修改底层包（如 `core-engine`）代码
2. 执行 `pnpm build` 重新构建
3. 上层包自动使用最新构建产物

### Turborepo 任务依赖

`turbo.json` 配置了任务依赖关系：

- `build`：依赖上游包先构建（`dependsOn: ["^build"]`）
- `test`：依赖本包先构建（`dependsOn: ["build"]`）
- `dev`：无缓存，持久运行

## 注意事项

- 当前项目处于早期阶段，部分包可能无测试文件
- `app/` 当前是入口占位，完整 UI 尚未实现
- UXP 插件的本地调试方式待后续补充
