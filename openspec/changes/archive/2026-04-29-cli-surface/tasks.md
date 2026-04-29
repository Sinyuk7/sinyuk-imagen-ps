## 1. 项目结构搭建

- [x] 1.1 确认 `pnpm-workspace.yaml` 已覆盖 `apps/*` 与 `packages/*`
- [x] 1.2 创建 `apps/cli/package.json`：定义包名 `@imagen-ps/cli`，依赖 `@imagen-ps/shared-commands` 和 `commander`，不得依赖 `@imagen-ps/app`
- [x] 1.3 创建 `apps/cli/tsconfig.json`：继承根 tsconfig，配置 CLI 特有编译选项
- [x] 1.4 创建 `apps/cli/src/index.ts`：CLI 入口文件骨架

## 2. FileConfigAdapter 实现

- [x] 2.1 创建 `apps/cli/src/adapters/file-config-adapter.ts`：实现 `ConfigStorageAdapter` 接口
- [x] 2.2 实现 `get(providerId)` 方法：读取配置文件，返回对应 provider 配置
- [x] 2.3 实现 `save(providerId, config)` 方法：原子写入配置文件
- [x] 2.4 实现配置文件路径解析：使用 Node.js `os.homedir()` 解析 `~/.imagen-ps/config.json`
- [x] 2.5 实现文件系统错误传播：权限不足、磁盘空间不足、配置目录路径被文件占用等错误由 adapter 抛出，并由 CLI 层转为 stderr JSON 与非零 exit code
- [x] 2.6 实现残留临时文件清理：下次 `save()` 前检测并删除 `config.json.tmp`

## 3. CLI 命令框架

- [x] 3.1 创建 `apps/cli/src/utils/output.ts`：统一输出工具（success/error）
- [x] 3.2 创建 `apps/cli/src/utils/input.ts`：输入解析工具（支持 JSON 字符串和 `@` 文件路径）
- [x] 3.3 实现 CLI 主程序：从 `@imagen-ps/shared-commands` 导入 commands 与 `setConfigAdapter`，注入 FileConfigAdapter，构建 commander 命令树
- [x] 3.4 明确 CLI 定位为 lightweight automation surface：automation 命令默认非交互、JSON 输出，人工 shortcut 仅用于 provider/model bootstrap

## 4. Provider 命令组

- [x] 4.1 创建 `apps/cli/src/commands/provider/list.ts`：`provider list` 命令
- [x] 4.2 创建 `apps/cli/src/commands/provider/describe.ts`：`provider describe <providerId>` 命令
- [x] 4.3 创建 `apps/cli/src/commands/provider/config-get.ts`：`provider config get <providerId>` 命令
- [x] 4.4 创建 `apps/cli/src/commands/provider/config-save.ts`：`provider config save <providerId> <configJson>` 命令
- [x] 4.5 创建 `apps/cli/src/commands/provider/config-interactive.ts`：实现 `provider config` 极简人工配置 shortcut，支持选择 provider 并输入 API key / base URL / default model 等基础配置
- [x] 4.6 创建 `apps/cli/src/commands/provider/index.ts`：provider 命令组注册

## 5. Job 命令组

- [x] 5.1 创建 `apps/cli/src/commands/job/submit.ts`：`job submit <workflow> <inputJson>` 命令
- [x] 5.2 创建 `apps/cli/src/commands/job/get.ts`：`job get <jobId>` 命令，并在文档中明确仅查询当前进程 runtime store 中可见 job
- [x] 5.3 创建 `apps/cli/src/commands/job/retry.ts`：`job retry <jobId>` 命令，并在文档中明确不承诺跨进程 job history
- [x] 5.4 创建 `apps/cli/src/commands/job/index.ts`：job 命令组注册

## 6. 自动化测试、构建与手动验证

- [x] 6.1 添加 `apps/cli/package.json` scripts：`build`、`dev`、`start`、`test`
- [x] 6.2 为 `FileConfigAdapter` 添加 Vitest 单元测试：首次保存、更新已有配置、读取不存在配置、目录创建、原子写入、残留 tmp 清理、文件系统错误传播
- [x] 6.3 为 input/output utils 添加 Vitest 单元测试：JSON 字符串解析、`@file` 读取、JSON parse 失败、stdout/stderr JSON 格式、exit code 映射
- [x] 6.4 为 provider/job 命令处理函数添加轻量集成测试：mock shared-commands 调用，覆盖成功与失败路径，不要求真实网络或 Photoshop 环境
- [x] 6.5 验证 `pnpm install`、`pnpm --filter @imagen-ps/cli build`、`pnpm --filter @imagen-ps/cli test` 和 `pnpm build` 通过
- [x] 6.6 手动测试 `provider list` 命令
- [x] 6.7 手动测试 `provider config save` + `provider config get` 流程
- [x] 6.8 手动测试 `provider config` 极简人工配置 shortcut
- [x] 6.9 手动测试 `job submit` + `job get` 当前进程语义
- [x] 6.10 手动测试 `job retry` 当前进程语义
- [x] 6.11 增加架构检查：`apps/cli` 不依赖也不 import `@imagen-ps/app`

## 7. 文档更新

- [x] 7.1 创建 `apps/cli/README.md`：CLI 使用说明
- [x] 7.2 更新 `docs/COMPONENT_REGISTRY.md`：添加 CLI 模块
- [x] 7.3 更新 `STATUS.md`：标记 Phase 4 完成