## Why

Phase 3 Shared Commands 已完成 8 个命令（`listProviders`、`describeProvider`、`getProviderConfig`、`saveProviderConfig`、`submitJob`、`getJob`、`subscribeJobEvents`、`retryJob`），但尚无可执行的 surface 验证业务链路。CLI 是一个独立的 lightweight automation surface：它通过命令行入口在无 Photoshop / UXP 环境下验证并复用 `surface -> shared-commands -> runtime -> provider -> adapter` 完整链路。

CLI 首要服务脚本、AI Skill、MCP wrapper、CI 与开发自动化；同时允许人工手动执行少量基础命令（如 `imagen provider list`、`imagen provider config`）完成 provider/model bootstrap 配置。它不是复杂的交互式终端 UI 产品。

## What Changes

- 新建 `apps/cli` 目录结构，作为独立 CLI 应用（与 `apps/app` 同属 surface apps）
- 实现 7 个 automation-friendly CLI 命令：`provider list`、`provider describe`、`provider config get`、`provider config save`、`job submit`、`job get`、`job retry`
- 支持一个极简人工配置 shortcut：`provider config`，用于选择 provider 并输入 API key / base URL / default model 等基础配置
- 引入 `commander` 作为命令行解析框架
- 实现文件系统 `ConfigStorageAdapter`，将 provider 配置持久化到本地 `~/.imagen-ps/config.json`
- CLI 通过 `@imagen-ps/shared-commands` 调用 shared commands，不依赖 `@imagen-ps/app` 或 Photoshop/UXP surface

## Non-goals

- 不实现复杂交互式 TUI；仅允许 provider/model bootstrap 所需的极简 prompt
- 不实现 output 格式选项；automation 命令固定使用 JSON 输出
- 不实现 `job watch` 或实时 streaming
- 不实现身份认证或多用户配置
- 不实现 job 历史跨进程持久化；`job get` / `job retry` 仅覆盖当前 CLI 进程 runtime store 中可见的 job
- 不暴露 `subscribeJobEvents` 为 CLI 命令；当前不支持 `job watch` 或实时 streaming
- 不做 npm 发布配置

## Capabilities

### New Capabilities

- `cli-commands`: lightweight automation CLI 命令入口与参数解析（7 个 automation 命令 + 1 个极简配置 shortcut）
- `cli-config-adapter`: 文件系统 ConfigStorageAdapter 实现

### Modified Capabilities

_无需修改现有 specs_

## Impact

- 新建 `apps/cli/` 目录
- `apps/cli/package.json`：CLI 包定义，依赖 `@imagen-ps/shared-commands` 和 `commander`
- `apps/cli/src/index.ts`：CLI 入口
- `apps/cli/src/commands/`：各命令实现
- `apps/cli/src/adapters/file-config-adapter.ts`：文件系统 config adapter
- 更新 CLI 相关文档与组件注册表