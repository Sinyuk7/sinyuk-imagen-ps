# PRD.md — Provider 模块设计（Phase 1: OpenAI-compatible Baseline）

## 文档状态

* **Status:** Proposed
* **Last Updated:** 2026-04-23
* **Scope:** `packages/providers`
* **Phase:** Phase 1 / Phase 2 Baseline
* **Related Docs:** `IMPLEMENTATION_PLAN.md` 

---

## 1. 背景

当前 change 的优先验证链路是：

`surface -> shared commands -> runtime -> provider -> adapter`

当前阶段的重点不是 UI，也不是 Photoshop host action，而是先验证：

1. runtime 边界是否稳定
2. provider 语义是否能完整封装在 provider 层
3. facade 是否能统一暴露 provider 与 job 相关用例
4. CLI 是否能作为第一个 surface 跑通主业务链路 

同时，当前真实接入环境以 **relay / proxy / gateway / aggregator** 为主，而不是直接对接各家官方服务。
因此，`packages/providers` 的第一阶段设计不应从“官方厂商原生 API 全覆盖”展开，而应从**最稳定、最常见、最可验证的兼容接入面**展开。

---

## 2. 当前阶段结论

### 2.1 范围结论

**Phase 1 / Phase 2 只支持 `OpenAI-compatible provider profile`。**

当前不以“官方 OpenAI / Gemini / xAI 原生 provider”作为目标。
当前以“暴露 OpenAI-compatible HTTP 接口的 provider 实例”作为主要接入对象。

这意味着：

* 当前 provider family 只有一个：`openai-compatible`
* 当前不按厂商拆成 `OpenAIProvider` / `GeminiProvider` / `XAIProvider`
* `Nano Banana`、`gpt-image-2`、`Grok image` 等在当前阶段都只被视为某个 `openai-compatible` provider 实例上的 **model target**
* 当前不做 cross-provider 参数统一 

### 2.2 设计判断

当前项目最值得先证明的，不是“所有 provider 都能优雅接入”，而是：

* provider 边界本身是否成立
* runtime 是否不会被 provider 参数语义污染
* facade 是否能稳定暴露 provider 配置与任务入口
* CLI 是否能在无 UI 的前提下完成主链路验证  

因此，当前阶段的正确收敛方式不是“厂商优先”，而是“兼容协议优先”。

---

## 3. 产品目标

`packages/providers` 在当前阶段必须完成以下目标：

1. 提供一个可注册、可描述、可调用的 provider 模块边界
2. 提供一个 mock provider 用于 runtime / facade / CLI 验证
3. 提供一个真实的 `openai-compatible` provider
4. 支持 provider 配置校验与持久化模型
5. 支持 runtime 用统一方式提交 job、获取结果、处理失败
6. 不将 provider 参数语义泄漏到 `core-engine`
7. 不将 surface 交互格式反向污染 provider 或 runtime  

---

## 4. 非目标

当前阶段明确不做：

* 不做官方 Gemini native provider
* 不做官方 xAI native provider
* 不做 ComfyUI provider
* 不做 Midjourney / callback / webhook / websocket 型 provider
* 不做 provider 自动能力探测
* 不做复杂异步 polling provider family
* 不做 cross-provider 参数统一
* 不做 cancel / abandon / durable history
* 不做 UI 专属 provider view model
* 不做 provider 内部直接承担 secret storage / file system / host IO 责任 

---

## 5. 核心设计原则

### 5.1 统一的是内部契约，不是外部 HTTP 字段

runtime 不应直接理解外部 provider 的请求字段。
runtime 只依赖 provider contract。

provider 内部可以使用：

* OpenAI-compatible REST
* relay 特定 header
* relay 特定 model 路由规则
* relay 特定错误格式

这些都必须被限制在 provider 层内部。

### 5.2 当前只统一“最小意图”，不统一“完整参数语义”

当前阶段只保留一组最小 canonical request，用于表达：

* 这是 generate 还是 edit
* prompt 是什么
* 输入资产是什么
* 输出期望是什么
* provider 专属参数透传在哪里

当前阶段**不尝试**统一：

* quality 语义
* background 语义
* safety 语义
* 各家 relay 对 model / size / n / style 的差异解释

### 5.3 provider family 先按 profile，不按厂商

当前只有一个 family：

* `openai-compatible`

未来如果确实出现明显超出兼容层的原生能力，再新增：

* `gemini-native`
* `xai-native`
* `comfyui-workflow`
* `async-rest-job`

但这不属于当前阶段。

### 5.4 provider 实例优先于 provider 品牌

当前真正需要配置的是一个“可用接入实例”，而不是一个“官方品牌声明”。

例如当前系统更关心：

* `baseURL`
* `apiKey`
* `defaultModel`
* `extraHeaders`
* `capabilityHints`

而不是“这个实例是不是官方 Gemini”。

### 5.5 provider 不拥有 runtime 状态机

provider 负责：

* config 校验
* 请求构造
* 网络调用
* 结果归一化
* 错误映射

provider 不负责：

* job lifecycle 状态管理
* facade 命令编排
* settings 持久化策略
* surface-specific 输出格式 

---

## 6. 技术选型与依赖基线

当前阶段仅针对 `@imagen-ps/providers` 包，技术栈定为如下基线：

### 6.1 Runtime

* **Node 22 LTS**

Node 官方当前将 v22 标记为 LTS，并提供稳定的长期维护窗口；同时 Node 的 `fetch` 与相关 Web API 能力已经适合作为库层基础能力使用。

### 6.2 HTTP 请求层

* **Node 原生 `fetch`**
* 当前不引入 `axios` / `got`

Node 官方明确说明 Node 中的 `fetch` 由 **Undici** 提供支持；对 provider 包而言，这已经足够现代、稳定、轻量。当前阶段不额外引入独立 HTTP client，以减少依赖面与实现复杂度。

### 6.3 Schema / Config 校验

* **`zod@^4`**

Zod 官方已将 **Zod 4** 作为稳定版本发布，并强调其性能、体积和 TypeScript 体验改进。它适合承担 provider config schema、request schema、response schema 的校验职责。

### 6.4 TypeScript

* **`typescript@^5.9.0`**

TypeScript 官方已发布 5.9，当前起步阶段直接使用 5.9 更合理，不再停留在更旧版本。

### 6.5 Node 类型

* **`@types/node` 必须显式加入**

provider 包直接运行在 Node 环境中，会使用 `fetch`、`AbortController`、`URL`、`process` 等 Node / Web runtime 能力，因此必须提供 Node 类型定义。TypeScript 官方发布说明也明确提示升级过程中要关注 `@types/node` 配套更新。

### 6.6 测试框架

* **`vitest@^4`**

Vitest 官方已发布 4.x，provider 包作为纯 TypeScript / Node 库，继续使用 Vitest 是合理的，但不应继续停留在旧的大版本。

### 6.7 Retry

* 当前不引入专门 retry 依赖库
* provider 层只实现一个轻量 transport retry
* 仅对网络瞬时失败、429、5xx 做有限指数退避
* 不将 transport retry 与业务 retry / job retry 混用

### 6.8 Logging / Diagnostics

* 当前不引入重型日志框架作为 provider 核心依赖
* provider 只暴露极薄的诊断接口或结构化诊断对象
* 真正的日志落地由 runtime / facade / CLI 决定


要加，但**只加一段“技术立场 + 约束说明”**，不要写成情绪化 rant，也不要写成长篇分析。

我直接给你可以**无脑复制进 PRD 的最终版本**（已经收敛过、不会过度武断、也不会被未来打脸）👇

---

### **6.9 Provider HTTP Strategy（OpenAI-compatible baseline）**

在当前阶段，`packages/providers` 面向的主要对象是：

* OpenAI-compatible relay / proxy / gateway
* 非完全标准、存在字段差异与路由偏差的中转接口

因此，本项目将 OpenAI-compatible 视为：

> 一种“基于 HTTP 的 JSON 协议面”，而不是一个必须通过官方 SDK 调用的服务对象。

---

### **6.9.1 技术决策**

当前阶段 Provider 层采用以下基础技术方案：

* HTTP：**Node 原生 `fetch`**
* Schema：**Zod 4**
* 不引入任何官方 SDK（OpenAI / Gemini / xAI 等）

---

### **6.9.2 不采用官方 SDK 的原因**

当前阶段不使用官方 SDK 作为 Provider 基础依赖，原因如下：

#### **1. Provider 层需要协议级控制权**

Provider 的核心职责是：

* URL / route 拼接
* Header / Auth 控制
* 请求 body 构造
* 响应解析与归一化
* 错误映射与 retry

这些能力必须是**完全可控且可覆盖的**，而不是依赖 SDK 内部抽象。

---

#### **2. 中转站接口普遍存在非标准行为**

实际接入环境中常见问题：

* 非 `/v1` 路径结构
* 自定义鉴权头（如 `x-api-key` / `token`）
* 不完整的 OpenAI 字段支持
* 返回字段多/少/结构变化

Provider 层必须具备：

> “宽容输入 + 强控制输出”的能力

SDK 抽象会增加适配复杂度，而不是降低复杂度。

---

#### **3. 避免运行时环境耦合**

本项目 provider 模块未来需要运行在：

* Node（CLI / backend）
* Web（dev harness）
* UXP（Photoshop）

官方 SDK 虽支持多运行时，但**并未覆盖 UXP 环境**。

当前阶段不应将：

* polyfill
* runtime 兼容
* 打包体积

这些不确定性引入 provider 基座。

---

#### **4. 降低抽象层级，保证边界清晰**

当前项目的核心目标是验证：

`runtime -> provider -> adapter` 边界是否成立

引入 SDK 会带来额外抽象层：

```txt
runtime -> provider -> SDK -> HTTP
```

这会削弱 provider 作为“防腐层”的作用。

---

### **6.9.3 使用原生 fetch 的约束**

为了避免“失控的裸 HTTP 调用”，Provider 层必须遵守以下约束：

#### **统一 HTTP 封装**

所有请求必须通过内部封装：

```ts
transport/openai-compatible/http.ts
```

禁止在 provider 内部直接调用裸 `fetch`。

---

#### **统一 Retry 策略**

仅允许以下情况触发 retry：

* 网络错误
* 429
* 502 / 503 / 504

必须：

* 支持 `AbortSignal`
* 使用指数退避
* 限制最大重试次数（2~3 次）

---

#### **统一 Error Mapping**

所有 provider 错误必须映射为：

* `auth_failed`
* `rate_limited`
* `upstream_unavailable`
* `timeout`
* `network_error`
* `invalid_response`
* `unknown_provider_error`

禁止将原始 HTTP 错误直接抛给 runtime。

---

#### **统一 Response Normalization**

所有 provider 响应必须转换为：

```ts
Asset[]
```

禁止将 provider 原始响应结构暴露到 runtime。

---

### **6.9.4 未来扩展策略（重要）**

当前不使用官方 SDK **不等于永久禁止 SDK**。

未来允许：

* 在**单独 provider adapter 内部**使用 SDK
* 前提是该 provider：

  * 明显偏离 OpenAI-compatible
  * 且 SDK 能显著降低复杂度

但必须保证：

> SDK 不得进入 `core-engine` 或通用 provider contract 层

---

## 7. package.json 目标基线

`@imagen-ps/providers` 当前建议升级为：

```json
{
  "name": "@imagen-ps/providers",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc --project tsconfig.build.json",
    "test": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@imagen-ps/core-engine": "workspace:*",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.9.0",
    "vitest": "^4.1.0"
  }
}
```

---

## 8. 模块职责边界

### 8.1 `packages/providers` 负责什么

* provider contract
* provider registry
* provider config schema
* provider capability descriptor
* mock provider
* openai-compatible provider
* request build / invoke / normalize / map error
* provider-level transport helper

### 8.2 `packages/providers` 不负责什么

* runtime lifecycle
* engine store
* facade command orchestration
* config persistence adapter
* secret storage adapter
* host API
* file system ownership
* surface-specific input / output formatting 

---

## 9. 目录结构

建议目录结构如下：

```txt
packages/providers/
├── src/
│   ├── contract/
│   │   ├── provider.ts
│   │   ├── capability.ts
│   │   ├── config.ts
│   │   ├── request.ts
│   │   ├── result.ts
│   │   └── diagnostics.ts
│   ├── registry/
│   │   ├── provider-registry.ts
│   │   └── builtins.ts
│   ├── transport/
│   │   └── openai-compatible/
│   │       ├── http.ts
│   │       ├── build-request.ts
│   │       ├── parse-response.ts
│   │       ├── retry.ts
│   │       └── error-map.ts
│   ├── providers/
│   │   ├── mock/
│   │   │   ├── descriptor.ts
│   │   │   └── provider.ts
│   │   └── openai-compatible/
│   │       ├── descriptor.ts
│   │       ├── config-schema.ts
│   │       ├── model-policy.ts
│   │       └── provider.ts
│   ├── shared/
│   │   ├── asset-normalizer.ts
│   │   ├── id.ts
│   │   └── utils.ts
│   └── index.ts
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

---

## 10. 核心契约

### 10.1 Provider Capability

```ts
export interface ProviderCapabilities {
  imageGenerate: boolean;
  imageEdit: boolean;
  multiImageInput: boolean;
  transparentBackground: boolean;
  customSize: boolean;
  aspectRatio: boolean;
  syncInvoke: boolean;
}
```

说明：

* 当前 capability 是**描述性声明**
* 当前不要求自动探测
* 当前允许通过 config 或 descriptor 给出 hint

### 10.2 Canonical Request

```ts
export interface CanonicalImageJobRequest {
  operation: "generate" | "edit";
  prompt: string;
  inputAssets?: AssetRef[];
  maskAsset?: AssetRef;
  output?: {
    count?: number;
    width?: number;
    height?: number;
    aspectRatio?: string;
    background?: "auto" | "transparent" | "opaque";
    qualityHint?: "speed" | "balanced" | "quality";
  };
  providerOptions?: Record<string, unknown>;
}
```

说明：

* 这是内部最小意图模型
* 不等于外部 OpenAI-compatible 请求字段
* `providerOptions` 保留透传空间
* 当前不做更激进的统一

### 10.3 Provider Config

```ts
export interface OpenAICompatibleProviderConfig {
  providerId: string;
  displayName: string;
  baseURL: string;
  apiKey: string;
  defaultModel?: string;
  extraHeaders?: Record<string, string>;
  capabilityHints?: Partial<ProviderCapabilities>;
  timeoutMs?: number;
}
```

说明：

* 当前配置的是“provider instance”
* 不是“官方品牌身份”
* 一个 relay 就是一个 provider instance

### 10.4 Provider Result

```ts
export interface ProviderInvokeResult {
  assets: Asset[];
  raw?: unknown;
  diagnostics?: ProviderDiagnostics[];
}
```

说明：

* `assets` 是 runtime 看到的主结果
* `raw` 只用于调试或内部观察
* `diagnostics` 用于非阻塞诊断信息

---

## 11. Provider 接口

```ts
export interface Provider<TConfig, TRequest> {
  readonly id: string;
  readonly family: "openai-compatible";

  describe(): ProviderDescriptor;

  validateConfig(input: unknown): TConfig;

  validateRequest(input: unknown): TRequest;

  invoke(args: {
    config: TConfig;
    request: TRequest;
    signal?: AbortSignal;
  }): Promise<ProviderInvokeResult>;
}
```

### 11.1 `describe()`

返回 provider descriptor，包括：

* id
* family
* displayName
* config schema 摘要
* capabilities
* supported operations

### 11.2 `validateConfig()`

* 负责 config parse / validation
* 使用 Zod 实现
* 不负责持久化

### 11.3 `validateRequest()`

* 负责 canonical request parse / validation
* 当前阶段只校验最小意图结构

### 11.4 `invoke()`

* 构造真实请求
* 发起网络调用
* 执行有限 transport retry
* 解析响应
* 归一化为 `Asset[]`
* 将 provider 错误映射为标准 error

---

## 12. Registry 设计

当前 registry 必须支持：

* 注册 built-in providers
* 根据 id 获取 provider
* 列出 providers
* 为 facade 暴露 `listProviders` / `describeProvider` 所需元数据

```ts
export interface ProviderRegistry {
  register(provider: Provider<any, any>): void;
  get(providerId: string): Provider<any, any> | undefined;
  list(): ProviderDescriptor[];
}
```

说明：

* registry 不持有 runtime state
* registry 不做 config persistence
* registry 不做 dynamic package loading

---

## 13. OpenAI-compatible Provider 设计

### 13.1 当前定位

`openai-compatible` provider 是当前阶段唯一真实 provider family。

它负责：

* 吃下 relay / proxy / gateway 差异
* 组装 OpenAI-compatible HTTP 请求
* 映射 headers / auth / model
* 解析响应中的 image 结果
* 映射 transport / API error

### 13.2 当前支持范围

只要求支持最小 happy path：

* `generate`
* 可选 `edit`
* 同步 HTTP 调用
* image 结果解析
* 基础错误映射

当前不要求：

* 流式返回
* callback
* polling
* websocket
* batch
* fine-grained vendor-native features

### 13.3 Model Policy

当前 model 只作为运行时参数处理，不作为 provider 类型。

例如：

* `gpt-image-2`
* `nano-banana`
* `grok-image`
* 其他 relay 暴露出的 image model name

在当前阶段，这些都只是：

* 同一个 `openai-compatible` provider family 下的不同 model target

---

## 14. Mock Provider 设计

mock provider 是 Phase 2 验收核心之一。

其职责：

* 用 `setTimeout` 模拟网络延迟
* 输出最小标准 `Asset[]`
* 可配置失败模式
* 可用于 runtime lifecycle、facade、CLI smoke test

建议能力：

* 默认返回成功
* 支持固定失败
* 支持按概率失败
* 支持故意返回 schema-invalid payload 以验证边界守卫

---

## 15. 错误模型

provider 层必须负责将外部错误转换为 engine 可识别的失败类型。

当前至少区分：

* invalid_config
* invalid_request
* auth_failed
* rate_limited
* upstream_unavailable
* upstream_invalid_response
* timeout
* network_error
* unknown_provider_error

说明：

* provider 层只做映射
* 不在 provider 层决定 job lifecycle
* engine 如何消费这些错误，属于 `core-engine` 责任

---

## 16. Retry 策略

当前 provider 内部只允许有限 transport retry：

### 可以重试

* 短暂网络错误
* 429
* 502 / 503 / 504

### 不可以重试

* config 错误
* schema 错误
* auth 失败
* 明确业务拒绝
* 非幂等的复杂多阶段提交

### 策略

* 最多 2~3 次
* 指数退避
* 支持 `AbortSignal`
* 记录 diagnostics

---

## 17. 测试要求

当前阶段 provider 包必须覆盖如下测试方向：

### 17.1 Contract Tests

* config schema validation
* request schema validation
* capability descriptor shape
* invoke result normalization

### 17.2 Mock Provider Tests

* happy path
* forced failure
* diagnostics output

### 17.3 OpenAI-compatible Provider Tests

* request build
* auth header injection
* timeout handling
* retry on 429 / 5xx
* error map
* response parse

### 17.4 Integration Baseline

配合 runtime / facade / CLI，完成：

* provider list
* provider describe
* config validate
* submit happy path
* invalid config failure
* retry failure path 

---

## 18. 与 facade 的交互面

当前 facade 需要的 provider 相关命令面已经在实施计划中明确：

* `listProviders`
* `describeProvider`
* `getProviderConfig`
* `saveProviderConfig`
* `submitJob`
* `getJob`
* `retryJob` 

provider 包必须支持其中与 provider 相关的最小读写需求：

* 能被列出
* 能被描述
* 能校验 config
* 能执行 invoke

但 provider 包本身**不直接实现**：

* `saveProviderConfig`
* `getProviderConfig`

这两个命令属于 facade + adapter 组合结果，而不是 provider 包自身的持久化责任。

---

## 19. Phase 1 / Phase 2 实施范围

### Phase 1 — Provider Foundation

交付：

* contract
* registry
* mock provider
* openai-compatible provider descriptor
* config schema
* request schema
* transport helper

退出标准：

* provider 可以被 registry 注册与列出
* mock provider 可独立 invoke
* openai-compatible provider 可完成 config / request 校验

### Phase 2 — Runtime Validation

交付：

* mock provider 接入 runtime
* 一个真实 openai-compatible provider 跑通 happy path
* provider error map 与 runtime failure taxonomy 对齐

退出标准：

* mock provider end-to-end 跑通
* 一个真实 provider 通过 shared runtime 跑通
* provider 差异未污染 engine contract 

---

## 20. Deferred

以下内容延期，不属于当前 gate：

* Gemini native provider
* xAI native provider
* ComfyUI workflow provider
* async polling provider family
* webhook / callback provider
* streaming image job
* provider auto-discovery
* dynamic provider plugin loading
* advanced vendor-specific feature surfaces

---

## 21. 验收标准

以下全部满足，当前 provider 模块才算完成：

1. `packages/providers` 提供稳定 contract 与 registry
2. mock provider 可被 runtime 调用并返回标准结果
3. 一个真实 `openai-compatible` provider 可跑通 happy path
4. provider config 与 request 都能通过 schema 校验
5. provider 错误能映射到统一 failure taxonomy
6. provider 层不泄漏 surface 语义，不拥有 runtime 状态机
7. provider 包技术栈基线已固定为：

   * Node 22 LTS
   * native fetch
   * Zod 4
   * TypeScript 5.9
   * Vitest 4

---

## 22. 附：当前最小文件清单

第一批建议先落这些文件：

```txt
src/contract/provider.ts
src/contract/capability.ts
src/contract/config.ts
src/contract/request.ts
src/contract/result.ts

src/registry/provider-registry.ts
src/registry/builtins.ts

src/providers/mock/descriptor.ts
src/providers/mock/provider.ts

src/providers/openai-compatible/descriptor.ts
src/providers/openai-compatible/config-schema.ts
src/providers/openai-compatible/model-policy.ts
src/providers/openai-compatible/provider.ts

src/transport/openai-compatible/http.ts
src/transport/openai-compatible/build-request.ts
src/transport/openai-compatible/parse-response.ts
src/transport/openai-compatible/retry.ts
src/transport/openai-compatible/error-map.ts

src/index.ts
```
