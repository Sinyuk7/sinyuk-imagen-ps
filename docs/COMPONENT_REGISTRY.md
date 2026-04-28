# 模块注册表

> 数据来源：各 `package.json` 和源码扫描（2026-04-28）

## 应用层

| 模块 | 包名 | 职责 |
|------|------|------|
| app | `@imagen-ps/app` | 唯一应用，承接 Photoshop / UXP、React UI 和应用侧薄桥接 |

**app/shared/commands 导出（v1）**：

| 命令 | 签名 | 职责 |
|------|------|------|
| `submitJob` | `(input: SubmitJobInput) → Promise<CommandResult<Job>>` | 提交 workflow 执行 |
| `getJob` | `(jobId: string) → Job \| undefined` | 查询 job 快照 |
| `subscribeJobEvents` | `(handler: JobEventHandler) → Unsubscribe` | 订阅 lifecycle 事件 |

**app/shared/commands 导出（v2）**：

| 命令 | 签名 | 职责 |
|------|------|------|
| `listProviders` | `() → ProviderDescriptor[]` | 列出所有已注册 provider |
| `describeProvider` | `(providerId: string) → ProviderDescriptor \| undefined` | 获取单个 provider 描述 |
| `getProviderConfig` | `(providerId: string) → Promise<CommandResult<ProviderConfig>>` | 获取 provider 配置 |
| `saveProviderConfig` | `(providerId: string, config: unknown) → Promise<CommandResult<void>>` | 保存 provider 配置 |
| `retryJob` | `(jobId: string) → Promise<CommandResult<Job>>` | 重试指定 job |

**app/shared/commands 类型**：

| 类型 | 用途 |
|------|------|
| `CommandResult<T>` | 命令执行结果统一包装 |
| `SubmitJobInput` | submitJob 输入参数 |
| `JobEventHandler` | 事件处理器类型 |
| `ConfigStorageAdapter` | Config 持久化 adapter 接口 |
| `ProviderDescriptor` | Provider 元数据（re-export） |
| `ProviderConfig` | Provider 配置（re-export） |

**app/shared/commands DI 接口**：

| 函数 | 用途 |
|------|------|
| `setConfigAdapter` | 注入自定义 config storage adapter |

## 共享包

### packages/core-engine

| 包名 | `@imagen-ps/core-engine` |
|------|--------------------------|
| 职责 | 共享 runtime 层：job lifecycle、workflow 执行、provider dispatch 边界、运行时状态管理 |
| 状态 | 已实现完整 runtime / engine 基础能力 |

**导出模块**：

| 模块 | 文件 | 职责 |
|------|------|------|
| runtime | `src/runtime.ts` | runtime 入口与装配 |
| runner | `src/runner.ts` | workflow 执行器 |
| registry | `src/registry.ts` | workflow 注册表 |
| store | `src/store.ts` | in-memory job store |
| events | `src/events.ts` | 事件总线 |
| dispatch | `src/dispatch.ts` | provider dispatch 抽象 |
| errors | `src/errors.ts` | 错误分类与工厂 |
| invariants | `src/invariants.ts` | 边界守卫（assertSerializable, deepFreeze） |
| types | `src/types/` | 类型定义（Job, Workflow, Asset, Provider, Events） |

---

### packages/providers

| 包名 | `@imagen-ps/providers` |
|------|------------------------|
| 职责 | provider 语义层：配置校验、请求校验、调用、响应归一化、错误映射 |
| 状态 | contract、registry、mock provider、openai-compatible provider 已落地 |

**导出模块**：

| 模块 | 目录/文件 | 职责 |
|------|-----------|------|
| contract | `src/contract/` | provider 契约定义（capability, config, request, result, diagnostics） |
| registry | `src/registry/` | provider 注册表与 builtin providers |
| bridge | `src/bridge/` | dispatch adapter（桥接 core-engine） |
| transport | `src/transport/` | HTTP 传输层 |
| shared | `src/shared/` | 共享工具（asset normalizer, id generator） |

**已实现 Providers**：

| Provider | 目录 | 职责 |
|----------|------|------|
| mock | `src/providers/mock/` | 测试用 mock provider |
| openai-compatible | `src/providers/openai-compatible/` | OpenAI 兼容 API provider |

---

### packages/workflows

| 包名 | `@imagen-ps/workflows` |
|------|------------------------|
| 职责 | declarative workflow spec 定义 |
| 状态 | 已导出 provider-generate、provider-edit 最小 builtin workflow spec |

**导出 Workflows**：

| Workflow | 文件 | 职责 |
|----------|------|------|
| provider-generate | `src/builtins/provider-generate.ts` | 图像生成 workflow |
| provider-edit | `src/builtins/provider-edit.ts` | 图像编辑 workflow |

---

## 依赖关系

```
app
├── @imagen-ps/core-engine
├── @imagen-ps/providers
└── @imagen-ps/workflows

packages/workflows
└── @imagen-ps/core-engine

packages/providers
└── @imagen-ps/core-engine

packages/core-engine
├── mitt (外部)
└── zod (外部)
```

## 更新说明

此注册表基于源码自动扫描生成。如有变动，请同步更新此文件。
