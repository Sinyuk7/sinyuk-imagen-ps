## Context

当前 Provider 以 `apiFormat` 为协议边界：`openai-images`、`openai-chat-completions` 和 `gemini-generate-content` 分别拥有 config/request validation、transport、response normalization 与错误映射。具体中转通常复用其中一种协议，但会拥有独立 endpoint、模型命名和附加能力；把每个中转建成新 Provider 会复制通用协议，把中转差异继续塞进通用 Provider 又会污染协议职责。

现有 `Provider.discoverModels()` 向远端 `/models` 请求裸 ID，Application 返回 runtime-only suggestion，Profile Models 页面再维护临时 suggestion state。结果不是 `UserModelConfig`，不能直接进入 selector 或生成；draft discovery、cache repository、host storage 和 UI wiring 又形成一条没有持久化产品价值的链。

本变更引入比 Provider 更小的 `ProviderExtension`。extension 属于 providers 层，因为它同时拥有具体中转识别、本地模型事实，以及未来可能出现的中转 transport 扩展；Application 只拥有 Profile 适配、extension 选择、Model Config 物化和持久化协调。

本次没有任何可信的真实中转模型表、endpoint 匹配规则或 model-status response contract，且明确禁止外部搜索。因此 change 只交付 extension contract、registry、Application integration 和 harness；builtin registry 初始为空，测试使用 fake extension。未来新增 `grsai` 或其他 extension 时，其全部模型数据收敛在自己的目录。

## Goals / Non-Goals

**Goals:**

- 保持 Provider 作为通用 `apiFormat` 协议实现，引入注册式 `ProviderExtension` 表达中转局部差异。
- 对一个 Profile 确定性解析零个或一个 extension；未命中时不做远端或 Official Catalog fallback。
- 让 extension 返回可 exact 物化的本地模型 seed，Application 按 `modelId` 采用本地优先、只补写缺失项的幂等流程。
- 让 Profile Models 和主界面只消费持久化 owned models，不再存在 suggestion 中间态。
- 删除通用 `/models` discovery、draft discovery、cache 和相关 host/UI 维护面。
- 在统一 extension contract 上声明 dormant `checkModelStatus()`，同时证明当前没有调用点和行为变化。

**Non-Goals:**

- 不搜索、推断或内置任何真实 `grsai`/其他中转 endpoint、模型列表或状态响应。
- 不实现 model-status transport，不新增状态 UI、cache、持久化、generation/admission 调用或阻塞逻辑。
- 不把 endpoint hint 的既有 Profile setup 精确路由误判为远端 discovery；该流程保持现状。
- 不重构 Provider 的生成协议、Official Model Preset、request strategy 或 capability matrix。
- 不引入旧 discovery cache 的迁移；项目采用 current-state，直接删除开发状态即可。
- 不引入 repository 批量事务或用户可见的 extension 选择器。

## Decisions

### 1. `ProviderExtension` 是 providers-owned 的统一中转扩展

新增独立 contract：

```ts
interface ProviderExtension<TConfig = unknown> {
  readonly id: string;
  readonly apiFormats: readonly ApiFormat[];

  match(context: ProviderExtensionMatchContext): boolean;

  listModels(
    context: ProviderExtensionMatchContext,
  ): readonly ProviderExtensionModel[];

  checkModelStatus?(
    config: TConfig,
    context: ProviderExtensionModelStatusContext,
    logger?: Logger,
  ): Promise<ProviderExtensionModelStatusResult>;
}
```

`ProviderExtensionMatchContext` 只包含 providers-owned、secret-free 的匹配事实，例如 `apiFormat`、connection mode、selected endpoint 和 enabled canonical endpoint URL；不得 import Application `ProviderProfile`。Application 从 Profile 创建该 context。

`ProviderExtensionModel` 只保存 `modelId`、`wireModelId`、`baseModelId`。`requestStrategyId`、`outputExposure` 和 `outputMatrix` 必须从同 `apiFormat` 的 Official Model Preset 派生，避免中转目录复制 capability 真相。

选择统一 extension 而非 `ModelCatalogInterceptor` + `ModelStatusAdapter`：中转身份、模型目录和未来附加能力属于同一概念，拆成多个同 ID registry 会制造同步成本。选择放在 providers 而非 Application：未来状态请求的 URL、auth、response parsing 属于 provider transport；Application 不得拥有这些语义。

### 2. Registry 是唯一来源 router，不聚合 extension

`createProviderExtensionRegistry()` 提供 `register/get/list/resolve`，`registerBuiltinProviderExtensions()` 显式注册 builtins，不允许模块顶层自注册。

解析规则：

- duplicate extension `id` 在注册时失败。
- registry 先按 `apiFormats` 限定候选，再调用 `match()`。
- 零个命中返回 `undefined`。
- 一个命中返回该 extension。
- 多个命中返回确定性 registry error；不得按注册顺序、priority 或 first-success 静默选择。

一个 Profile 的模型来源只能是唯一命中的 extension。没有 extension 时 source models 为 `[]`；不调用 `/models`，不做 official exact mapping，不从 Provider descriptor default models 兜底。

### 3. 每个中转目录完全内聚自身数据

未来 extension 使用以下结构：

```text
packages/providers/src/extensions/
  contract.ts
  registry.ts
  builtins.ts
  index.ts
  grsai/
    extension.ts
    models.ts
    index.ts
```

`models.ts` 保存小型 readonly authored mapping；`extension.ts` 保存 match 与 extension 组装；顶层 `builtins.ts` 只负责显式注册。catalog validation 在测试或静态 checker 中保证 `id` 唯一、字段非空、`baseModelId` exact 命中同 `apiFormat` Official Model Preset。

本次 builtin 集合为空，不创建假的 `grsai` 数据。新增真实 extension 是独立后续 change，必须使用用户提供的权威本地事实。

### 4. Application 只做本地 `modelId` 优先的补写

用新 command 替换 `refreshProfileModels()` 的网络 suggestion 语义。command：

1. 读取 Profile 和现有 `UserModelConfig[]`。
2. 创建 secret-free `ProviderExtensionMatchContext`，解析唯一 extension。
3. 无 extension 时直接返回当前 owned model list。
4. 调用 `listModels()`，在任何写入前验证全部 seed 与 Profile `apiFormat`、Official Model Preset 和非空字段。
5. 以现有配置的 `modelId` 建立 lookup；同 `modelId` 永远保留本地完整配置。
6. 只物化并保存 source 中本地缺失的 `modelId`；local-only 配置保持不变。
7. 返回持久化后的完整 owned model list。

不以 `wireModelId` 作为覆盖键：`modelId` 是当前 Profile-local ownership/repository identity，`wireModelId` 是远端 transport identity。重复执行必须幂等，不覆盖、不更新、不删除。

Application 应提取共享的纯物化/校验 helper，复用 `saveUserModelConfig()` 的 preset、strategy、exposure 和 matrix 规则。setup Profile 的批次先完成纯校验，再保存缺失配置，并在写入结束后执行一次 promotion；写入中断时 setup 仍不可见且重试可补齐缺失项。ready Profile 的 storage failure 允许保留已成功补写项，重试仍幂等。本变更不扩大 repository 为跨 host 事务。

### 5. UI 只展示 owned models

Profile Models 页面 mount 和显式 Load/Refresh 都只接收 command 返回的持久化列表。删除 `suggestions`、`onSuggestion`、suggestion row/section/i18n 和 suggestion-to-editor route；保留手动 Add 与 owned model Edit。

无 extension、extension 返回空模型或所有 source model 均已存在时，页面保持当前 owned list。command 失败显示 toast，并保留当前 rows；不恢复 suggestion 错误/空态。`ProfileModelItem` 删除仅服务 suggestion 的 `discovered` 字段；`configured` 等仍被主界面 readiness 消费的 owned projection 保持现状，不借本变更扩大重构。

### 6. 通用 discovery 与 cache 整体删除

删除：

- `Provider.discoverModels()`、`DiscoveredModel` 和 root exports。
- image endpoint、chat image、Gemini `/models` provider methods 与 parser。
- `refreshDraftProfileModels`、deprecated draft hook、CommandsPort/harness fake。
- `ModelDiscoveryCache`、repository、runtime singleton、UXP JSON adapter、Chrome IndexedDB store/wiring。
- Provider descriptor 中只服务旧 discovery fallback 且无其他消费者的 `defaultModels`/`ProviderModelInfo`。
- Profile Models suggestion UI、i18n 与 tests。

保留 Official Model Preset 和 endpoint hint exact setup route；它们分别是 capability 真相和显式 URL hint orchestration，不是远端 discovery。

### 7. `checkModelStatus()` 只定义 dormant advisory contract

状态结果统一为 `available | unavailable | unknown`，并携带 bounded reason/message；只有上游明确返回不可用才能产生 `unavailable`，未实现、协议不支持和未来请求失败都归一为 `unknown`。

本次没有任何 extension 实现该方法，也没有 caller。不得新增 Provider descriptor capability、Application command、UI、cache 或持久化。静态验收要求生产代码中 `.checkModelStatus(` 调用点为零。

未来接入必须在生成 dispatch 后作为并行 advisory sidecar：正常 `invoke()` 不等待状态检查，结果只能产生提示/诊断，不能参与 readiness/admission、取消或拒绝 Job、改变 Job status、修改 endpoint health 或影响生成错误语义。该未来约束写入 contract JSDoc 和 spec，但不在本次实现 wiring。

## Risks / Trade-offs

- [没有 builtin extension 时自动模型来源恒为空] → 这是明确的 current-state；未注册 Profile 继续手动创建 Model Config，未来用独立 change 添加权威中转数据。
- [两个 extension 匹配同一 Profile] → registry fail-fast，测试覆盖多重命中；不得用顺序隐藏配置错误。
- [extension seed 指向错误 preset] → 全批次写入前 exact validation，catalog checker 覆盖每个 mapping。
- [ready Profile 补写时 storage 中途失败] → 现有配置不受影响，成功补写项保持有效，下一次执行按 `modelId` 幂等补齐；不为小型目录扩展跨 host 事务契约。
- [删除 cache storage 遗留开发文件/store] → current-state 直接停止读写并删除 adapter/schema，不引入迁移；开发环境可重置。
- [dormant status method 被未来错误接成 gate] → contract 明确 advisory-only，当前以零调用搜索门槛锁定；未来 wiring 必须另立 change。
- [UI refresh 行为从网络发现变成本地补写] → 更新 tooltip/copy 和 focused UI tests，保持失败时现有 rows 不被替换。

## Migration Plan

1. 先增加 extension contract/registry 与纯 fake harness，验证 0/1/>1、duplicate id 和 catalog validation。
2. 增加 Application context adapter、seed materialization 和本地优先 command tests；保持旧 UI 未切换。
3. 切换 Profile Models/UI/ports 到新 command，删除 suggestion route 和 projection 字段。
4. 删除 Provider `/models`、draft discovery、cache adapters/runtime 和 dead descriptor fallback。
5. 更新 canonical `docs/ENGINEERING_CONTEXT.md`、`docs/TESTING.md` 与匹配 module `AGENTS.md`（如新增稳定 ownership 规则），运行 focused harness、policy、visual 和 repo validation。

回滚时恢复旧 change 前代码即可；没有生产用户或迁移合同。删除的 discovery cache 不是 ownership 数据，回滚不需要重建缓存内容。

## Open Questions

无。首个真实中转 extension 的 endpoint、模型目录和 status protocol 明确留给后续基于用户提供事实的 change。
