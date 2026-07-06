## Context

当前仓库已经将 provider profile 持久化为 canonical `apiFormat + connection + paths` 结构，且 UI 中只有一个 `测试连接` 按钮。现有问题不在 UI 数量，而在 command/provider contract：`testConnection` 仍然把“连通性”与 `discoverModels` 绑定，导致只支持真实调用面、但不支持模型列表接口的 provider 或兼容中转被误报为失败。

该问题是 cross-cutting 变更，涉及 application command contract、provider contract、Gemini provider 实现、UI 状态呈现以及测试基线，因此需要在实现前先明确统一语义。

## Goals / Non-Goals

**Goals:**
- 保持设置页只有一个 `测试连接` 按钮。
- 将 `测试连接` 收敛为 application 公共层拥有的统一能力，而不是各 provider 各写一套业务语义。
- 保证 `测试连接` 不生成图片、不隐藏消费。
- 引入三态结果：`verified`、`partial`、`failed`。
- 将 `discoverModels` 从连接判定链路中完全移出。
- 为 `gemini-generate-content` 增加基于 `countTokens` 的无生成探针。

**Non-Goals:**
- 不新增 `Test endpoint`、`Validate config` 或其他新按钮。
- 不在本次设计里改动真实 `试生成` 的 smoke generate 语义。
- 不要求所有 provider 共享同一个 HTTP endpoint 或请求体。
- 不在本次设计里引入复杂的多级 probe fallback 编排。

## Decisions

### 1. `测试连接` 由 application 公共层统一编排

application 层提供唯一入口，执行顺序固定为：

```text
local validate
  -> provider safeProbe
  -> normalize to verified | partial | failed
```

这样可以把“什么时候测试、如何解释结果、是否允许保存 profile”的产品语义集中到公共层，而不是散落到每个 provider。

备选方案：
- 继续保留每个 provider 自己实现完整 `testConnection`：会重复产品语义，且继续放大协议差异。
- 直接复用 `discoverModels`：已被真实故障证明语义错误。

### 2. provider 只暴露可选 `safeProbe` 能力

provider 层不再拥有整套连接测试业务流程，只提供可选无副作用探针：

```text
safeProbe(config, context) -> normalized probe result
```

`context` 至少需要允许公共层传入已解析的 `modelId`，因为某些协议的安全探针必须命中精确 model 路径。

这样仍然保留协议差异的合理落点：
- 通用编排在公共层
- 具体安全探针在 provider 层

备选方案：
- 全部 provider 使用同一种通用探针：无法覆盖 Gemini、OpenAI-compatible 与只支持真实调用面的兼容中转差异。

### 3. 连接测试结果统一为三态，而不是布尔 reachable

公共层对外只暴露：

```text
verified | partial | failed
```

语义：
- `verified`：无生成探针成功，足以证明该 profile 已命中正确 provider 调用面。
- `partial`：服务可达，但无法在无生成前提下完成完整验证，或服务暂时受限。
- `failed`：本地配置错误、认证失败、网络不可达、或协议明显不匹配。

三态是最小且可解释的结果模型。继续使用 `supported/reachable` 会把“安全探针不支持”与“彻底失败”混在一起。

### 4. `discoverModels` 保持独立能力，不参与连接成功判定

`discoverModels` 继续只表达“是否能列出远端模型候选清单”。它的失败不能再覆盖 `测试连接` 的成功，也不能阻塞 profile 保存。

这里的产品边界是：

```text
Test connection != Discover models
```

用户可以拥有：
- 连接已验证，但模型发现不可用
- 连接部分验证，后续通过真实使用再完成闭环

### 5. `gemini-generate-content` 默认使用 `countTokens`

对 `gemini-generate-content`，默认安全探针为：

```text
POST /v1beta/models/{model}:countTokens
```

最小请求体：

```json
{
  "contents": [{
    "role": "user",
    "parts": [{ "text": "test" }]
  }]
}
```

理由：
- 不生成图片
- 命中精确 model 路径
- 验证 Gemini `contents` 请求结构
- 比 `GET /models` 更贴近真实调用面

明确不采用“故意发错 `generateContent` body，把 400 当成功”的方案，因为那依赖上游实现细节，不能稳定证明 auth、model 路径或真实 provider 面。

### 6. `gemini-generate-content` 的状态映射收敛为公共规则

对于 `countTokens` 结果，公共层按以下规则归一化：

- `2xx` -> `verified`
- `401/403` -> `failed`
- `404/405/501` -> `partial`
- `429` -> `partial`
- `500/503/504` -> `partial`
- DNS/TLS/timeout -> `failed`
- 本地 URL、模板、`modelId` 不完整 -> `failed`，且不发请求

这里刻意不把 `404/405/501` 直接判死，因为对未知兼容中转来说，它更接近“服务可达，但不支持无生成验证”。

## Risks / Trade-offs

- `[Risk]` 三态结果会影响现有 UI notice、假数据和测试断言。  
  `-> Mitigation` 在 application types 与 UI notice 层先完成状态模型替换，再同步更新 harness 与测试。

- `[Risk]` 某些 provider 暂时没有可用 `safeProbe`。  
  `-> Mitigation` 允许 provider 返回 `partial`，并保持 profile 可保存，不要求一次性补齐所有 provider。

- `[Risk]` `modelId` 解析来源不稳定会影响 `safeProbe`。  
  `-> Mitigation` 在公共层固定解析顺序，例如 `defaultModelId -> selectedModelIds -> imported/parsing context`，并在缺失时明确返回 `failed` 或产品认可的文案。

- `[Risk]` `countTokens` 成功只能证明无生成调用面，不证明真实图片生成成功。  
  `-> Mitigation` 在文案与 contract 中明确 `测试连接` 不等于 `试生成`。

- `[Risk]` 旧 `testProviderProfile(... connect ...)` 仍把 connect 语义写成 `discoverModels`。  
  `-> Mitigation` 同步修改旧注释、Result 结构与测试，避免仓库内部继续传播错误心智模型。
