# ARCHITECTURE.md

## 架构概述

`@imagen-ps/providers` 是 provider 语义层，位于 `core-engine` 与外部 AI 服务之间。它将外部 provider API 的差异封装在统一契约之下，使 engine 无需理解各家 provider 的参数语义和调用细节。

```
┌─────────────┐      ┌─────────────────┐      ┌──────────────────┐
│ core-engine │ ──── │    providers    │ ──── │  External APIs   │
│ (runtime)   │      │ (semantic layer)│      │ (OpenAI, etc.)   │
└─────────────┘      └─────────────────┘      └──────────────────┘
       │                     │
       │  ProviderDispatch   │  Provider.invoke()
       │  Adapter            │
       └─────────────────────┘
```

## 模块结构

```
src/
├── contract/           # 类型契约层
│   ├── capability.ts   # ProviderFamily, ProviderOperation, ProviderCapabilities
│   ├── config.ts       # ProviderConfig 联合类型
│   ├── diagnostics.ts  # 结构化诊断信息
│   ├── provider.ts     # Provider 主契约与 bridge 契约
│   ├── request.ts      # CanonicalImageJobRequest 标准请求
│   └── result.ts       # ProviderInvokeResult 结果契约
│
├── registry/           # Provider 注册表
│   ├── provider-registry.ts  # 内存级 registry 实现
│   └── builtins.ts     # 内置 provider 注册
│
├── providers/          # Provider 实现
│   ├── mock/           # 测试用 mock provider
│   │   ├── config-schema.ts
│   │   ├── descriptor.ts
│   │   ├── provider.ts
│   │   └── request-schema.ts
│   └── openai-compatible/  # OpenAI 兼容 provider
│       ├── config-schema.ts
│       ├── descriptor.ts
│       └── provider.ts
│
├── bridge/             # Engine bridge 适配层
│   └── create-dispatch-adapter.ts  # Provider -> ProviderDispatchAdapter
│
├── transport/          # HTTP transport 层
│   └── openai-compatible/
│       ├── http.ts         # 带 retry 的统一 HTTP 封装
│       ├── build-request.ts
│       ├── parse-response.ts
│       ├── error-map.ts
│       └── retry.ts
│
├── shared/             # 共享工具
│   ├── asset-normalizer.ts  # Asset 归一化
│   └── id.ts           # ID 生成
│
└── index.ts            # 公开 API 入口
```

## 核心流程

### 1. Provider 注册

```
createProviderRegistry()
  └── registry.register(createMockProvider())
  └── registry.register(createOpenAICompatibleProvider())
```

### 2. Provider Dispatch（engine 调用路径）

```
engine.submitJob(request)
  └── createDispatchAdapter({ provider, config })
        └── adapter.dispatch(params)
              ├── provider.validateRequest(rawRequest)
              └── provider.invoke({ config, request, signal })
                    └── httpRequest() [for openai-compatible]
                          └── parseResponse()
```

### 3. 错误流转

```
provider 层抛出错误
  └── toJobError() 收敛为 JobError { category: 'validation' | 'provider' }
        └── engine 消费统一错误结构
```

## 关键依赖

| 依赖 | 用途 |
|------|------|
| `@imagen-ps/core-engine` | JobError、ProviderDispatchAdapter 类型契约 |
| `zod` | config/request schema 校验 |

## 设计约束

1. **Engine 不理解 provider 语义**：所有 provider 特有的参数、capabilities、error mapping 必须在本模块内封装完毕。

2. **统一错误契约**：所有 provider 层错误必须收敛为 `JobError { category: 'validation' | 'provider' }`。

3. **Schema 优先**：config 和 request 必须通过 Zod schema 校验，不允许运行时隐式类型假设。

4. **Transport 隔离**：provider 不直接调用裸 fetch，必须通过 `transport/` 层统一处理 retry、timeout、error mapping。

5. **纯逻辑包**：本模块不包含副作用，不直接访问文件系统或环境变量。

6. **当前 family 限制**：当前只支持 `openai-compatible` family，不扩写未来 provider 矩阵。
