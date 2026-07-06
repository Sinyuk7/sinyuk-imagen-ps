## Context

当前实现中，`UserModelConfig` 只有 `modelId`、`baseModelId`、`requestStrategyId`、`outputExposure`、`outputMatrix`。其中：

- `baseModelId` 在 `saveUserModelConfig()` 中被强制要求命中 `getOfficialModelPreset()`，因此它本质上是官方 preset 锚点。
- `modelId` 同时被用作 repository key、profile `selectedModelIds/defaultModelId`、generation preference key，以及 dispatch 最终写入 provider request 的 `model`。
- transport / contract 层的 `ProviderModelExecution.modelId` 文档已经明确为“实际发送给上游的 wire model ID”。

这导致“能力模板 identity”和“wire model identity”发生耦合。只要用户为了中转站兼容去改 `modelId`，就会连带改变 config identity、preference key 与 profile selection identity。

同时，relay 私有 model 名经常包含路由语义，而不是官方能力事实。例如：

- `gpt-image-2-vip`、`gpt-image-2-svip` 可能代表不同渠道、稳定性或成本。
- `nano-banana-2-cl`、`nano-banana-2-2k-cl`、`nano-banana-2-4k-cl` 可能直接把 1K / 2K / 4K 路由拆成不同名字。

因此 `baseModelId` 只能表达官方 capability preset anchor 与能力上限，不能代表当前 wire route 的完整能力担保。

## Goals / Non-Goals

**Goals:**

- 允许单个 model config 声明独立 `wireModelId`。
- 保持 `baseModelId` 继续作为能力矩阵、输出矩阵和策略锚点。
- 保持 `modelId` 继续作为稳定 config identity，以最小 blast radius 保持 profile 选择和 generation preference key 稳定。
- 让 provider request 最终发送确定性的 `wireModelId`。
- 将 UI 上的“请求模型 ID”暴露为低频高级入口，而不是主路径字段。
- 让 runtime 中不再出现含糊的裸 `modelId` 语义。

**Non-Goals:**

- 不引入新的 `displayName/alias` 持久字段。
- 不把 provider 私有 `*-vip` / `*-svip` 名称批量纳入 repo 级全局 catalog `aliases/prefixes/patterns`。
- 不重做 profile `selectedModelIds/defaultModelId` 的整体数据模型。
- 不改变官方 preset 的 `baseModelId` 规则，也不允许用私有 wire model 替换官方 preset 主键。
- 不让 `wireModelId` 自动扩展官方 preset 的能力上限。

## Decisions

### 1. 持久化模型改为 `modelId` / `baseModelId` / `wireModelId` 三分语义

决策：

- 持久化结构第一轮收敛为：
  - `modelId`: 稳定 config identity，不可变逻辑 identity
  - `baseModelId`: 官方 capability preset anchor
  - `wireModelId`: 最终发给上游的 selector
- 创建时允许 `modelId` 与 `wireModelId` 初始值相同，但它们只是值相同，不再是同一个概念。

原因：

- 继续复用 `modelId` 会让 provider 私有 wire 名成为 repository key 与 preference key 的一部分，导致 rename/identity 语义污染整个系统。
- 对于 `gpt-image-2-vip` 这类场景，用户真正要改的是执行层 wire 值，不是 config identity。

替代方案：

- 继续把 `*-vip` 写进 catalog `aliases/prefixes/patterns`。缺点是会持续扩大 repo 级全局规则维护面，而且 profile 私有中转站别名会被误建模成全局模型事实。

### 2. `ResolvedModelConfig` 输出三个无歧义 model 字段

决策：

- runtime 归一化结果第一轮采用平铺结构，而不是嵌套 execution 对象：
  - `configModelId`
  - `capabilityModelId`
  - `wireModelId`
  - `apiFormat`
  - `requestStrategyId`
  - `outputExposure`
  - `outputMatrix`

原因：

- 平铺字段可以强制调用方在类型层面面对三种 model 语义，避免继续传递含糊的裸 `modelId`。
- 第一轮不需要上 branded type，但应先消除 runtime 里的命名歧义。

替代方案：

- 仅在现有 `ResolvedModelConfig` 上加 optional override 字段。缺点是 runtime 依旧存在“当前这个 `modelId` 到底是哪一种”的歧义。

### 3. `resolveConfiguredModel()` 需要改，`generation preference key` 不改

决策：

- `resolveConfiguredModel()` 返回的已解析 config 需要输出：
  - `configModelId`
  - `capabilityModelId = baseModelId`
  - `wireModelId`
- generation preference key 继续保持 `{profileId, apiFormat, modelId, operation}`。

原因：

- preference 与 profile selection 语义属于“这个 config 是谁”，而不是“这次请求最终发什么 model string”。
- 只改 wire override 不应导致已保存的输出偏好丢失或变成另一套 key。

替代方案：

- 把 generation preference key 也迁移到 wire model 维度。缺点是一次 provider 私有 route 变化就会打碎同一 config 下的既有偏好，不符合“override 是高级执行细节”的语义。

### 4. capability resolver 必须显式改签名，不保留模糊 `modelId` 入口

决策：

- `resolveImageModelRule()` 与 `resolveProviderResolvedOutput()` 改为显式对象参数，至少区分 `capabilityModelId`。
- transport / runtime 不再允许把 wire model 直接传入 capability resolver。
- request body 的 `model` 只来自 `ResolvedModelConfig.wireModelId`。

原因：

- 现有模糊签名正是错误根源；继续保留会鼓励调用方误传 wire model。
- 这类 contract helper 调用点集中，改参数名和调用形式的成本低于后续再修第二轮歧义。

替代方案：

- 保留旧签名，仅靠调用约定区分 capability model 与 wire model。缺点是边界仍然模糊，属于错误的 blast-radius 优化。

### 5. capability 语义采用“官方上限 ∩ 用户收窄”，wire route 不自动扩展能力

决策：

- effective capability 定义为：
  - `official preset upper bound`
  - ∩ `UserModelConfig.outputExposure/outputMatrix`
- `wireModelId` 不自动扩展官方 preset 能力。
- relay route 能力更少时，由用户配置继续收窄 `outputMatrix`。
- relay route 有官方 preset 不具备的额外能力时，必须新增新的独立 capability 类型，而不是让 wire route 反向扩展 preset。

原因：

- 中转站私有 route 名经常表达渠道、稳定性、分辨率限制或成本，不应被默认视为“和官方 preset 完全等价”。
- 让 `wireModelId` 仅负责路由选择，可以避免凭 wire 名把额外能力误注入系统。

替代方案：

- 把 `wireModelId` 当作 capability 事实来源。缺点是会再次回到 catalog alias 爆炸和 runtime 语义耦合。

### 6. UI 主路径不再让用户直接编辑 config identity

决策：

- model config 编辑页主路径继续围绕 `Preset` 与能力子集。
- 原“Model ID”位置改为高级字段，文案改为“请求模型 ID”，并默认折叠在 `Advanced settings`。
- 字段说明明确为“仅修改发送给接口的模型，不改变能力配置。”
- 列表至少展示轻量 meta：当 `wireModelId !== modelId` 时，显示“请求模型：<wireModelId>”。
- 空字符串与纯空格统一归一化；`wireModelId === modelId` 时不制造无意义 dirty state。

原因：

- 这与“override 是低频高阶用法”一致，也能避免用户把高级执行参数当作普通命名字段来改。
- 轻量 meta 是低成本高价值反馈，用户可在失败时确认 override 是否真正生效。

替代方案：

- 完全隐藏 override。缺点是中转站兼容场景无法表达。

## Risks / Trade-offs

- [Risk] `modelId`、`baseModelId`、`wireModelId` 三分后，调用方可能仍误用字段。 → Mitigation：在 `ResolvedModelConfig` 中输出三个显式字段，删除模糊裸 `modelId` 入口，并增加 dispatch 日志字段。
- [Risk] transport 层如果仍有隐藏 callsite 直接拿 `wireModelId` 去做能力解析，会出现 capability mismatch。 → Mitigation：统一修改 capability resolver 参数签名，并补 provider contract tests。
- [Risk] 不兼容旧存储数据会让现有旧 config 直接失效或不可读。 → Mitigation：将该行为明确标记为 breaking，并统一按“schema 非法即丢弃”处理，避免半兼容状态。
- [Risk] relay route 实际能力可能弱于官方上限。 → Mitigation：要求用户通过 `outputExposure/outputMatrix` 显式收窄，不允许 `wireModelId` 自动提升能力。

## Migration Plan

1. 扩展 `StoredUserModelConfig` / `UserModelConfig` / `SaveUserModelConfigInput` / storage schema / test fixtures，引入必写 `wireModelId`。
2. 调整 `ResolvedModelConfig`，输出 `configModelId`、`capabilityModelId`、`wireModelId` 三个确定字段。
3. 修改 `resolveImageModelRule()`、`resolveProviderResolvedOutput()` 与相关 callsite，按显式 capability 参数解析能力。
4. 调整 runtime dispatch 与日志，使 request body 发送 `wireModelId`，并记录 `configModelId` / `capabilityModelId` / `wireModelId` / `reportedModelId`。
5. 调整 storage 读取逻辑：缺少 `wireModelId` 的旧 config 直接视为非法并忽略，不做兼容读取。
6. 调整 UI 编辑页与列表 meta，将“请求模型 ID”放入 `Advanced settings`，并处理 dirty-state 归一化。
7. 运行 command、storage、UI、provider contract 回归测试，确认 preference key 和 profile 选择仍绑定稳定 config identity。

## Open Questions

- `wireModelId` 在 UI 层是允许完全自由输入，还是需要最小格式校验但不做 provider-specific 规范化。
