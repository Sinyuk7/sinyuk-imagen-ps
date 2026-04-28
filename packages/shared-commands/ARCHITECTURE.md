# Architecture

## 系统定位

`@imagen-ps/shared-commands` 处于三层架构的中间层：

```
┌─────────────────────────────────────────┐
│  Surface Apps (apps/app, apps/cli)      │  ← 消费命令 API
├─────────────────────────────────────────┤
│  shared-commands                        │  ← 本包：use-case/command 层
├─────────────────────────────────────────┤
│  core-engine / providers / workflows    │  ← host-agnostic domain 层
└─────────────────────────────────────────┘
```

Surface App 仅通过本包暴露的命令函数与类型与底层交互，**不直接依赖** runtime 实例、store、dispatcher 等内部结构。

## 模块结构

```
src/
├── index.ts                      # 入口，re-export commands/
├── runtime.ts                    # Runtime 单例管理、adapter 注入点
└── commands/
    ├── index.ts                  # 公共 API 汇总导出
    ├── types.ts                  # 公共类型 (CommandResult, SubmitJobInput, ConfigStorageAdapter...)
    ├── submit-job.ts             # 提交 workflow 执行
    ├── get-job.ts                # 同步查询 job 快照
    ├── subscribe-job-events.ts   # 订阅 job 生命周期事件
    ├── list-providers.ts         # 列出已注册 providers
    ├── describe-provider.ts      # 获取 provider 元数据
    ├── get-provider-config.ts    # 读取持久化 provider 配置
    ├── save-provider-config.ts   # 验证并持久化 provider 配置
    └── retry-job.ts              # 用原始输入重执行 job
```

## 核心流程

### Job 提交流程

```
Surface App
  │  submitJob({ workflow, input })
  ▼
commands/submit-job.ts
  │  1. getRuntime() → 获取/创建单例
  │  2. enrichedInput = { ...input, _workflowName: workflow }
  │  3. runtime.runWorkflow(workflow, enrichedInput)
  ▼
core-engine (workflow dispatcher)
  │  → 选择 workflow → 调度 provider adapter → 执行
  ▼
返回 CommandResult<Job>
  │  ok: true → { value: Job }
  │  ok: false → { error: JobError }（异常被 toJobError() 转换）
```

### Config 持久化流程

```
Surface App
  │  setConfigAdapter(customAdapter)  ← 注入 surface-specific 存储
  │  saveProviderConfig(providerId, config)
  ▼
commands/save-provider-config.ts
  │  1. 查找 provider (providerRegistry.get)
  │  2. provider.validateConfig(config) → 校验
  │  3. adapter.save(providerId, validatedConfig) → 持久化
  ▼
CommandResult<void>
```

## 关键依赖

| 包 | 用途 |
|----|------|
| `@imagen-ps/core-engine` | Runtime 创建、Job/JobError/JobEvent 类型、错误工厂 |
| `@imagen-ps/providers` | ProviderRegistry、ProviderDescriptor、ProviderConfig、dispatch adapter |
| `@imagen-ps/workflows` | builtinWorkflows（初始化 Runtime 时注册） |

无外部三方依赖。

## 设计约束

1. **不可直接暴露 runtime** — 所有 runtime 交互封装在命令函数内部，防止 surface 层产生隐式耦合。
2. **不可引入 surface 依赖** — 禁止依赖 React、DOM、Photoshop/UXP、Node fs/path/os 等 surface-specific API。
3. **ConfigStorageAdapter 为唯一注入点** — 除初始化 workflows 外，本包对外的可配置性仅通过 `setConfigAdapter()` 暴露。
4. **CommandResult 为统一错误边界** — 所有可失败的异步命令返回 `CommandResult<T>`，不抛出异常到 surface 层。
5. **Workflow 名称通过联合类型约束** — `BuiltinWorkflowName` 类型确保编译期检查合法 workflow 名称。
