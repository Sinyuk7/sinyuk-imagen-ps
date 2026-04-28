# app 状态

- 状态：`shared/commands` 已完成 v1 三命令 + v2 五命令，作为 UI ↔ runtime 的唯一合规通路
- 更新时间：2026-04-28

## 当前已确认存在

- `package.json`
- `AGENTS.md`
- `README.md`
- `SPEC.md`
- `STATUS.md`
- `vitest.config.ts`
- `src/index.tsx`
- `src/ui/app-shell.tsx`
- `src/host/create-plugin-host-shell.ts`
- `src/shared/plugin-app-model.ts`
- `src/shared/runtime.ts` — Runtime 单例管理 + Provider Registry + Config Adapter
- `src/shared/commands/` — UI ↔ runtime 命令层
  - `index.ts` — barrel 导出
  - `types.ts` — 公开类型
  - `submit-job.ts` — v1 `submitJob` 命令
  - `get-job.ts` — v1 `getJob` 命令
  - `subscribe-job-events.ts` — v1 `subscribeJobEvents` 命令
  - `list-providers.ts` — v2 `listProviders` 命令
  - `describe-provider.ts` — v2 `describeProvider` 命令
  - `get-provider-config.ts` — v2 `getProviderConfig` 命令
  - `save-provider-config.ts` — v2 `saveProviderConfig` 命令
  - `retry-job.ts` — v2 `retryJob` 命令
- `tests/commands.test.ts` — 命令层单元测试（21 个用例）

## shared/commands 公开 API

### v1 命令

| 命令 | 签名 | 用途 |
|------|------|------|
| `submitJob` | `(input: SubmitJobInput) → Promise<CommandResult<Job>>` | 提交 workflow 执行 |
| `getJob` | `(jobId: string) → Job \| undefined` | 查询 job 快照 |
| `subscribeJobEvents` | `(handler: JobEventHandler) → Unsubscribe` | 订阅 lifecycle 事件 |

### v2 命令

| 命令 | 签名 | 用途 |
|------|------|------|
| `listProviders` | `() → ProviderDescriptor[]` | 列出所有已注册 provider |
| `describeProvider` | `(providerId: string) → ProviderDescriptor \| undefined` | 获取单个 provider 描述 |
| `getProviderConfig` | `(providerId: string) → Promise<CommandResult<ProviderConfig>>` | 获取 provider 配置 |
| `saveProviderConfig` | `(providerId: string, config: unknown) → Promise<CommandResult<void>>` | 保存 provider 配置 |
| `retryJob` | `(jobId: string) → Promise<CommandResult<Job>>` | 重试指定 job |

### 导出类型

| 类型 | 用途 |
|------|------|
| `CommandResult<T>` | 命令执行结果统一包装 |
| `SubmitJobInput` | submitJob 输入参数 |
| `JobEventHandler` | 事件处理器类型 |
| `ConfigStorageAdapter` | Config 持久化 adapter 接口 |
| `ProviderDescriptor` | Provider 元数据（re-export） |
| `ProviderConfig` | Provider 配置（re-export） |

### DI 接口

| 函数 | 用途 |
|------|------|
| `setConfigAdapter` | 注入自定义 config storage adapter |

## 边界约束

- UI 层只能通过 `shared/commands` 与 runtime 交互
- 禁止 UI 层直接 import `runtime` / `getRuntime` / `store` / `dispatcher` / `providerRegistry`
- v1 workflow 限制：`'provider-generate' | 'provider-edit'`

## 当前已知偏差

- 旧文档和旧记忆仍可能保留 `ps-uxp` 或多应用口径
- `host/` 与 adapter 边界仍未完全稳定

## 当前仍未稳定

- host / adapter 的最终边界
- 何时进入真正的 UI / writeback 实现阶段

## 测试状态

- `tests/commands.test.ts` 包含 21 个测试用例
- 覆盖 v1 三命令 + v2 五命令 + setConfigAdapter
- 使用 vitest 作为测试框架