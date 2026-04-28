## 1. Workspace 与目录准备

- [x] 1.1 创建顶层 `apps/` 目录，准备 `apps/app` 与 `apps/cli` surface 结构
- [x] 1.2 更新 `pnpm-workspace.yaml`，将 workspace 范围调整为 `apps/*` 与 `packages/*`
- [x] 1.3 检查并更新根 `package.json`、Turbo 配置与 TypeScript 根配置中的 workspace/filter/path 假设
- [x] 1.4 记录迁移前基线：当前 `pnpm build` / `pnpm test` 状态与已知失败项

## 2. 抽出 `packages/shared-commands`

- [x] 2.1 创建 `packages/shared-commands/package.json`，包名 `@imagen-ps/shared-commands`，依赖 `@imagen-ps/core-engine`、`@imagen-ps/providers`、`@imagen-ps/workflows`
- [x] 2.2 创建 `packages/shared-commands/tsconfig.json` 与必要的 build/test 配置
- [x] 2.3 将 `app/src/shared/commands/**` 迁移到 `packages/shared-commands/src/commands/**`
- [x] 2.4 将 `app/src/shared/runtime.ts` 迁移到 `packages/shared-commands/src/runtime.ts`
- [x] 2.5 创建 `packages/shared-commands/src/index.ts`，导出公开 commands、types 与 adapter injection API
- [x] 2.6 更新 shared commands 内部相对 import，确保不再引用 `app/` 路径
- [x] 2.7 确认 `packages/shared-commands` 不声明 React、ReactDOM、Photoshop、UXP、Node fs/path/os 生产依赖

## 3. 重连 Photoshop app 到 shared commands

- [x] 3.1 更新现有 app 中对本地 `src/shared/commands` 的引用，改为从 `@imagen-ps/shared-commands` 导入
- [x] 3.2 保留 app-local `plugin-app-model` 等 Photoshop surface 本地 model，不迁入 shared commands
- [x] 3.3 删除或停用旧的 `app/src/shared/commands/**` 与 `app/src/shared/runtime.ts`
- [x] 3.4 在移动目录前验证 `@imagen-ps/shared-commands` 与现有 app build/test 可运行

## 4. 迁移 `app/` 到 `apps/app/`

- [x] 4.1 将顶层 `app/` 目录移动到 `apps/app/`
- [x] 4.2 保持 `apps/app/package.json` 的 package name 为 `@imagen-ps/app`
- [x] 4.3 更新 `apps/app` 内部 tsconfig、package scripts 与相对路径引用
- [x] 4.4 更新仓库中指向旧 `app/` 路径的构建、测试、文档和 OpenSpec 引用
- [x] 4.5 验证 `pnpm --filter @imagen-ps/app build` 与相关测试

## 5. 调整 CLI surface 依赖方向

- [x] 5.1 更新 `openspec/changes/cli-surface` artifacts，删除 `CLI -> app -> packages` 决策
- [x] 5.2 将 CLI 设计改为依赖 `@imagen-ps/shared-commands`，不得依赖 `@imagen-ps/app`
- [x] 5.3 确认 `apps/cli` 的 FileConfigAdapter 作为 Node-only adapter 保留在 CLI surface 内
- [x] 5.4 明确 CLI `job get` / `job retry` 不承诺跨进程 job history

## 6. 架构守护验证

- [x] 6.1 增加或记录检查：`packages/shared-commands/src/**` 不得 import `react`、`react-dom`、`photoshop`、`uxp`、`@adobe/*`、`apps/app`
- [x] 6.2 增加或记录检查：`apps/cli/src/**` 与 `apps/cli/package.json` 不得依赖 `@imagen-ps/app`
- [x] 6.3 增加或记录检查：surface app 不直接 import `createRuntime` 或 `builtinWorkflows` 用于 command execution
- [x] 6.4 验证 `@imagen-ps/shared-commands` package exports 可被 `apps/app` 与 `apps/cli` 消费

## 7. 文档更新

- [x] 7.1 更新 `AGENTS.md`，描述 `apps/app`、`apps/cli` 与四个 shared packages
- [x] 7.2 更新 `ARCHITECTURE.md`，加入 `surface apps -> shared-commands -> runtime packages` 架构图与依赖规则
- [x] 7.3 更新 `docs/COMPONENT_REGISTRY.md`，登记 Photoshop app、CLI、shared-commands
- [x] 7.4 更新 `docs/CROSS_MODULE.md`，说明 surface 通过 shared commands 通信与 adapter injection 规则
- [x] 7.5 更新 `docs/BUILD_SYSTEM.md`，说明 `apps/*` / `packages/*` workspace 与 build graph
- [x] 7.6 更新 `docs/SETUP.md` 与 `docs/USAGE.md`，修正路径、filter 和运行命令

## 8. 回归与 OpenSpec 验证

- [x] 8.1 执行 `pnpm install` 或等价 lockfile 更新流程
- [x] 8.2 执行 `pnpm --filter @imagen-ps/shared-commands build`
- [x] 8.3 执行 `pnpm --filter @imagen-ps/app build`
- [x] 8.4 执行 `pnpm build` 与 `pnpm test`，记录并修复迁移引入的问题
- [x] 8.5 执行 `openspec validate refactor-surface-architecture --strict`
- [x] 8.6 执行 `openspec validate cli-surface --strict`