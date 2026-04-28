## 1. 项目结构搭建

- [ ] 1.1 确认 `pnpm-workspace.yaml` 已覆盖 `apps/*` 与 `packages/*`
- [ ] 1.2 创建 `apps/cli/package.json`：定义包名 `@imagen-ps/cli`，依赖 `@imagen-ps/shared-commands` 和 `commander`，不得依赖 `@imagen-ps/app`
- [ ] 1.3 创建 `apps/cli/tsconfig.json`：继承根 tsconfig，配置 CLI 特有编译选项
- [ ] 1.4 创建 `apps/cli/src/index.ts`：CLI 入口文件骨架

## 2. FileConfigAdapter 实现

- [ ] 2.1 创建 `apps/cli/src/adapters/file-config-adapter.ts`：实现 `ConfigStorageAdapter` 接口
- [ ] 2.2 实现 `get(providerId)` 方法：读取配置文件，返回对应 provider 配置
- [ ] 2.3 实现 `save(providerId, config)` 方法：原子写入配置文件
- [ ] 2.4 实现配置文件路径解析：`~/.imagen-ps/config.json`

## 3. CLI 命令框架

- [ ] 3.1 创建 `apps/cli/src/utils/output.ts`：统一输出工具（success/error）
- [ ] 3.2 创建 `apps/cli/src/utils/input.ts`：输入解析工具（支持 JSON 字符串和 `@` 文件路径）
- [ ] 3.3 实现 CLI 主程序：从 `@imagen-ps/shared-commands` 导入 commands 与 `setConfigAdapter`，注入 FileConfigAdapter，构建 commander 命令树
- [ ] 3.4 明确 CLI 定位为 lightweight automation surface：automation 命令默认非交互、JSON 输出，人工 shortcut 仅用于 provider/model bootstrap

## 4. Provider 命令组

- [ ] 4.1 创建 `apps/cli/src/commands/provider/list.ts`：`provider list` 命令
- [ ] 4.2 创建 `apps/cli/src/commands/provider/describe.ts`：`provider describe <providerId>` 命令
- [ ] 4.3 创建 `apps/cli/src/commands/provider/config-get.ts`：`provider config get <providerId>` 命令
- [ ] 4.4 创建 `apps/cli/src/commands/provider/config-save.ts`：`provider config save <providerId> <configJson>` 命令
- [ ] 4.5 创建 `apps/cli/src/commands/provider/config-interactive.ts`：实现 `provider config` 极简人工配置 shortcut，支持选择 provider 并输入 API key / base URL / default model 等基础配置
- [ ] 4.6 创建 `apps/cli/src/commands/provider/index.ts`：provider 命令组注册

## 5. Job 命令组

- [ ] 5.1 创建 `apps/cli/src/commands/job/submit.ts`：`job submit <workflow> <inputJson>` 命令
- [ ] 5.2 创建 `apps/cli/src/commands/job/get.ts`：`job get <jobId>` 命令，并在文档中明确仅查询当前进程 runtime store 中可见 job
- [ ] 5.3 创建 `apps/cli/src/commands/job/retry.ts`：`job retry <jobId>` 命令，并在文档中明确不承诺跨进程 job history
- [ ] 5.4 创建 `apps/cli/src/commands/job/index.ts`：job 命令组注册

## 6. 构建与测试

- [ ] 6.1 添加 `apps/cli/package.json` scripts：`build`、`dev`、`start`
- [ ] 6.2 验证 `pnpm install`、`pnpm --filter @imagen-ps/cli build` 和 `pnpm build` 通过
- [ ] 6.3 手动测试 `provider list` 命令
- [ ] 6.4 手动测试 `provider config save` + `provider config get` 流程
- [ ] 6.5 手动测试 `provider config` 极简人工配置 shortcut
- [ ] 6.6 手动测试 `job submit` + `job get` 当前进程语义
- [ ] 6.7 手动测试 `job retry` 当前进程语义
- [ ] 6.8 增加架构检查：`apps/cli` 不依赖也不 import `@imagen-ps/app`

## 7. 文档更新

- [ ] 7.1 创建 `apps/cli/README.md`：CLI 使用说明
- [ ] 7.2 更新 `docs/COMPONENT_REGISTRY.md`：添加 CLI 模块
- [ ] 7.3 更新 `STATUS.md`：标记 Phase 4 完成