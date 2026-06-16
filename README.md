# Sinyuk Imagen PS

Photoshop 图像生成插件 monorepo。包含两个 surface 应用和共享 runtime/domain packages。

## 当前结构

```
apps/
  app/     — Photoshop / UXP surface
  cli/     — Node.js CLI surface
packages/
  application/ — headless application/session layer
  core-engine/     — job execution kernel
  providers/       — provider adapter layer
```

## 先读哪里

- 项目入口与硬规则：`AGENTS.md`
- 工程上下文：`docs/ENGINEERING_CONTEXT.md`
- 当前 active loop 入口：`AGENTS.md`
- 测试说明：`docs/TESTING.md`
- 模块本地硬规则：各模块下的 `AGENTS.md`

## 命令

```bash
pnpm install          # 安装依赖
pnpm build            # 构建所有 workspace
pnpm test             # 运行所有测试
pnpm --filter <pkg> build   # 构建单个包
pnpm --filter <pkg> test    # 运行单个包测试
```

测试框架：Vitest。构建产物输出到 `dist/`。CLI smoke 测试产物会保留在 gitignored 的 `.test-output/smoke/`，用于复查真实图片和 sidecar。

## 文档使用规则

- 子模块优先，根目录只负责索引和范围
- 代码只作弱证据，不覆盖已写明的意图
- 测试入口统一维护在 `docs/TESTING.md`
- 不把解释性架构说明塞回 `AGENTS.md`
