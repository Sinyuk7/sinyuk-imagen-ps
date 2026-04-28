## Context

Phase 3 已交付 shared commands 层的 8 个命令，覆盖 provider 发现、配置、job 提交/查询/重试。随着 surface 架构重构，shared commands 已从 Photoshop app 中抽离为公共包 `@imagen-ps/shared-commands`，可被 `apps/app` 与 `apps/cli` 共同使用。

CLI 作为独立 lightweight automation surface，需要：
1. 调用 `@imagen-ps/shared-commands` 暴露的函数
2. 注入文件系统 `ConfigStorageAdapter` 以持久化 provider 配置
3. 将 automation 命令结果格式化为 JSON 输出，便于脚本、AI Skill、MCP wrapper 与 CI 消费
4. 提供少量人工可用的基础 shortcut（例如 `provider config`）帮助完成 provider/model bootstrap 配置

新的 monorepo surface 结构为 `apps/app` 与 `apps/cli`，共享应用层位于 `packages/shared-commands`。

## Goals / Non-Goals

**Goals:**
- 通过 CLI 验证 `surface -> shared-commands -> runtime -> provider` 完整链路
- 实现 7 个 automation-friendly CLI 命令，覆盖 Phase 4 退出标准
- 实现极简 `provider config` shortcut，允许人工选择 provider 并输入 API key / base URL / default model 等基础配置
- 实现文件系统 `ConfigStorageAdapter`，配置持久化到 `~/.imagen-ps/config.json`
- automation 命令输出统一为 JSON 格式，便于脚本、AI Skill、MCP wrapper 与 CI 消费

**Non-Goals:**
- 不实现 pretty print 或 table 格式输出
- 不实现复杂交互式 TUI 或多步骤 wizard；仅允许 provider/model bootstrap 所需的极简 prompt
- 不实现 `--verbose` / `--quiet` 等日志控制
- 不实现 shell completion
- 不做 CI/CD 集成或 npm 发布

## Decisions

### D1: CLI 目录放置 `apps/cli`

**决策**：创建 `apps/cli/` 作为 CLI 应用目录，与 `apps/app` 并列。

**理由**：
- `apps/` 目录约定用于可执行 surface application（Photoshop app、CLI、web server 等）
- 与 `packages/` 区分：packages 是被引用的库，apps 是入口点
- 便于未来扩展（如 `apps/web`）

**替代方案**：
- 放入 `packages/cli`：模糊了"包"与"应用"边界，不符合约定

### D2: 使用 `commander` 作为命令行框架

**决策**：使用 `commander` 库处理命令解析和帮助生成。

**理由**：
- 成熟稳定，TypeScript 支持好
- 子命令（`provider list`、`job submit`）语法自然
- 社区广泛使用，文档丰富

**替代方案**：
- `yargs`：功能类似，但 API 较为冗长
- `cac`：更轻量，但子命令支持不如 commander 直观
- 手写解析：不必要的复杂度

### D3: CLI 依赖 `@imagen-ps/shared-commands`，不得依赖 `@imagen-ps/app`

**决策**：`apps/cli` 的 `package.json` 依赖 `@imagen-ps/shared-commands` 与 `commander`。CLI 不依赖 `@imagen-ps/app`，也不从 `apps/app` 或旧 `app/` 路径导入代码。

**理由**：
- shared commands 是 app 与 CLI 的公共 application/use-case 层
- `@imagen-ps/app` 是 Photoshop/UXP surface，CLI 依赖它会把 Node CLI 绑到 Photoshop runtime 语义上
- 保持依赖单向性：`apps/* -> packages/shared-commands -> runtime packages`
- CLI surface 只负责命令行解析、stdout/stderr、exit code、极简 bootstrap prompt 与 Node-only adapter 注入

**替代方案**：
- CLI 依赖 `@imagen-ps/app`：会形成 `CLI -> Photoshop app -> packages` 的错误边界，已废弃
- CLI 直接依赖所有 runtime packages：破坏 shared commands 作为应用入口的分层，增加耦合

### D4: 文件系统 ConfigStorageAdapter 实现在 CLI 内部

**决策**：`FileConfigAdapter` 实现在 `apps/cli/src/adapters/file-config-adapter.ts`，不放入 `apps/app` 或 `packages/shared-commands`。

**理由**：
- 文件系统 IO 是 CLI 特有的能力，不属于 UXP 环境
- UXP UI 将来会有自己的 storage adapter（UXP Storage API）
- adapter 实现属于 surface 职责，不属于 shared commands

**替代方案**：
- 放入 `apps/app/src/shared/adapters/`：UXP 无法使用 Node.js fs，不通用
- 放入 `packages/shared-commands`：会污染 host-agnostic package，引入 Node-only 依赖

### D5: 配置文件路径使用 `~/.imagen-ps/config.json`

**决策**：provider 配置存储在用户 home 目录下 `~/.imagen-ps/config.json`。

**理由**：
- 遵循 CLI 工具惯例（`.config`、`.cache` 等）
- 跨项目共享配置（不随项目目录变化）
- 便于手动查看和编辑

**替代方案**：
- XDG 规范（`~/.config/imagen-ps/`）：更规范，但增加复杂度
- 当前目录 `.imagen-ps.json`：不便于跨项目复用

### D6: Automation 命令输出格式固定为 JSON

**决策**：automation 命令输出 JSON 到 stdout，错误输出到 stderr。极简人工 shortcut（如 `provider config`）可以在交互过程中输出 prompt，但最终成功/失败结果仍应使用机器可解析的 JSON 摘要或明确 exit code。

**理由**：
- 便于脚本解析和自动化
- 避免格式化逻辑的复杂度
- CLI 定位是 lightweight automation surface，不是复杂终端用户界面

**替代方案**：
- 支持 `--format json|table|plain`：增加复杂度，当前不需要
- 将 `provider config` 做成完整 wizard：会扩大交互面，当前仅保留极简 bootstrap shortcut

## Risks / Trade-offs

### R1: shared commands 导出边界不完整

**风险**：如果 `@imagen-ps/shared-commands` 导出的命令或类型不完整，CLI 可能倾向于绕过 shared commands 直接引用 runtime packages。

**缓解**：
- 优先补齐 `@imagen-ps/shared-commands` 的 barrel exports
- CLI 不直接组装 runtime，不直接 import `createRuntime` / `builtinWorkflows`
- 通过架构检查确认 `apps/cli` 不依赖 `@imagen-ps/app`

### R2: 配置文件格式演进

**风险**：`config.json` 的 schema 未来可能变化，需要迁移。

**缓解**：
- 首版简单存储：`{ version: 1, providers: { [providerId]: ProviderConfig } }`
- 预留 `version` 字段便于未来迁移
- 当前阶段不做复杂的 schema 迁移

### R3: job history 仅限进程内 runtime store

**风险**：CLI 每次执行是新进程，`job get` / `job retry` 无法查询前一次 CLI 进程内存中的 job。

**缓解**：
- 在 CLI README 与命令文档中明确：首版不承诺跨进程 job history
- 后续如需要，可单独设计 job store persistence，而不是混入本次 CLI surface 变更