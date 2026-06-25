# Sinyuk Imagen PS

Photoshop 图像生成插件 monorepo。包含两个 surface 应用和共享 runtime/domain packages。

## 当前结构

```
apps/
  app/     — Photoshop / UXP + Chrome dual-runtime surface
  cli/     — Node.js CLI surface
packages/
  application/ — headless application/session layer
  core-engine/ — job execution kernel
  providers/   — provider adapter layer
  foundation/  — host-agnostic shared utilities (logging, redaction, sinks)
```

## 先读哪里

- 项目入口与硬规则：`AGENTS.md`
- 工程上下文、当前限制与 open questions：`docs/ENGINEERING_CONTEXT.md`
- 测试与 Harness 总入口：`docs/TESTING.md`
- Loop 协作契约：`docs/agent/LOOP.md`
- 当前 active loop 入口：`AGENTS.md`（无 active loop 时 `docs/loops/` 为空）
- 稳定工程知识：`docs/dev-memory/`
- 仓库级 agent skills：`.agents/skills/`
- 模块本地硬规则：各模块下的 `AGENTS.md`

## 命令

本仓库声明 `packageManager: "pnpm@9.15.4"`。推荐用 repo-local mise
工具版本固定本地 pnpm：

```bash
mise install
```

```bash
pnpm bootstrap        # 首次初始化：安装依赖并跑完整默认验收
pnpm validate         # Default gate: build, tests, policy checks
pnpm check:policy     # Local architecture and policy validator
pnpm build            # 构建所有 workspace
pnpm test             # 运行默认测试，会按 Turbo pipeline 先构建
pnpm --filter <pkg> build   # 构建单个包
pnpm --filter <pkg> test    # 运行单个包测试，要求已完成 bootstrap 或相关 build
```

测试框架：Vitest。构建产物输出到 `dist/`。CLI smoke 测试产物会保留在 gitignored 的 `.test-output/smoke/`，用于复查真实图片和 sidecar。

## 文档使用规则

- 子模块优先，根目录只负责索引和范围
- 代码只作弱证据，不覆盖已写明的意图
- 测试入口统一维护在 `docs/TESTING.md`
- 不把解释性架构说明塞回 `AGENTS.md`
