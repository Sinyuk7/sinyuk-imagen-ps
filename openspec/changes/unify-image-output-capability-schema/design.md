## Context

当前 repo 有两份进行中的 image output 相关 change：

- `model-output-matrix-generation-settings`
- `redesign-model-config-output-capabilities`

它们都把 image output 的核心抽象建立在固定 `imageSize + ratio + outputFormat` matrix 上，只是在 UI 呈现和保存路径上做了不同封装。这个方向已经被新的产品约束否定：

- `gpt-image-2` 的真实输出几何能力不是有限 matrix，而是带约束的像素空间。
- Gemini 的真实输出几何能力是 provider 原生 `aspectRatio + resolution` 组合，`ratio` 不能被压扁成固定像素 option。
- `Use Input Size` 不是第二套 operation UI，也不是通用 provider wire 参数，而是一个 edit-only 的用户意图，需要在 builder 阶段结合当前输入图片上下文解析。
- `ModelConfigurationPage` 的真实职责不再是编辑“完整能力真相”，而是限制产品在 UI 中暴露哪些推荐入口和安全选项。

因此本 change 的目标不是继续补 matrix，而是把 image output 体系重新拆成三层边界，并明确推荐 preset 不是能力真相：

```text
Capability
  模型客观支持什么

Selection
  用户实际选择了什么意图

Builder
  如何把 Selection + Context 转成 provider request
```

其中：

- `Capability` 是 provider / catalog 拥有的数据真相，同时可附带 provider-owned 推荐 preset id 与尺寸值。
- `Selection` 是 application 持久化与调度的 canonical 用户意图。
- `Builder` 是 provider request strategy，把 `Selection + normalized input context` 映射为 exact provider payload。
- `apps/app` 拥有最终 label、hint、排序与具体控件布局；不单独建立跨包 `Presentation` contract。

## Goals / Non-Goals

**Goals:**

- 用统一 capability schema 覆盖 GPT、Gemini 以及未来 Qwen / Wan 一类具有不同输出几何语义的 image model。
- 停止把 provider wire `requestOutput` 放进 catalog capability；catalog 只表达能力、约束与推荐 preset。
- 让 MainPage、`GlobalGenerationSettingsPage` 与 `ModelConfigurationPage` 基于少数固定 UI archetype 渲染，而不是所有模型共享一套僵硬三字段 UI。
- 将 `Use Input Size` 合并为 `Output Size` 中的 edit-only 特殊项，并约定其在 `text_to_image` 上归一化为 `auto`，避免 UI 再扩张为双 operation 大块配置。
- 将 edit input capability 收敛为输入文件与 mask 协议能力，不混入 builder 私有行为。
- 让 `UserModelConfig` 从“matrix subset”转为“产品暴露入口限制”模型。
- 为当前两份进行中的旧 change 提供统一替代方案，后续实现只围绕新 schema 前进。

**Non-Goals:**

- 不在本 change 中引入用户自定义任意像素尺寸输入；产品入口仍只暴露 `Auto`、推荐 preset，以及必要时的 `Use Input Size`。
- 不试图在 capability 层完整穷举 GPT 这类连续像素空间的所有合法组合。
- 不在当前阶段设计大量抽象化 mask policy；首轮只表达真实存在的外部 `alpha-image` mask 输入。
- 不保留旧 `output matrix` 作为长期主数据模型；若实现过渡期需要兼容，仅作为迁移中的临时表示。

## Decisions

### Decision: 用 `GeometryCapability` discriminated union 取代固定 matrix 真相

首轮能力真相以几何 union 表达，而不是固定三维 matrix：

```text
flexible-pixels
ratio-resolution
```

- `flexible-pixels` 适用于 `gpt-image-2` 这类以合法 `WIDTHxHEIGHT` 空间表达能力的模型。
- `ratio-resolution` 适用于 Gemini 这类 provider 原生暴露 `aspectRatio + resolution` 的模型。

原因：不同 provider 的原生几何能力并不统一，继续围绕同一三维矩阵建模只会不断引入“伪统一”字段。

替代方案：保留 matrix，但允许不同模型自定义 option 意义。放弃该方案，因为这会让同名字段（如 `imageSize`、`ratio`）在不同模型间语义漂移，并继续把 GPT / Gemini 的真实能力扭曲成相同形状。

### Decision: capability 内保留推荐 preset，但不建立独立 `Presentation` contract

`Capability` 描述模型客观支持什么，也允许携带 provider-owned 推荐 preset id 与尺寸值。推荐项不是能力真相，也不要求穷举能力全集。最终 label、hint、排序与布局归 `apps/app`。

例如：

- `gpt-image-2` 的 `flexible-pixels` capability 可以声明合法像素约束与若干推荐 preset。
- Gemini 的 `ratio-resolution` capability 可以声明完整原生 ratio / resolution 选项，`apps/app` 再决定 UI 上如何排序或隐藏某些非主流项。

原因：当前需求确实需要“真能力”与“推荐入口”分离，但还没有必要为此建立新的跨包 DTO 与所有权层级。概念上区分已足够。

替代方案：建立完整 `Presentation` contract。放弃该方案，因为首轮只会增加包边界歧义与实现成本。

### Decision: `Selection` 保存 canonical 用户意图，而不是 fixed matrix cell 或 wire payload

新的用户选择 contract 首轮至少支持：

```text
provider-default
pixels
ratio-resolution
input-derived
```

其中 `input-derived` 首轮只允许：

```text
exact-size
```

原因：`Use Input Size`、Gemini ratio / resolution、GPT exact pixel size 都是用户意图，不是同一类字段。`provider-default` 比裸 `auto` 更准确，因为不同 provider 的 wire 表达可能分别是 `size: "auto"` 或省略 geometry 字段，但用户意图相同。保存 canonical selection 可以让 builder 在运行时结合最新 catalog 与当前请求上下文解析真实 payload。

替代方案：继续保存固定 `cellId + imageSize + ratio + outputFormat`。放弃该方案，因为它把旧 matrix 语义永久固化到 preference / UI / dispatch 三层，不适合新的能力模型。

selection contract 还必须显式包含 `outputFormat`。首轮应采用：

```text
ImageOutputSelection {
  geometry
  outputFormat
}
```

不能让 geometry 走新 contract、`outputFormat` 继续走旧 matrix / preference 路径，否则会重新形成双状态源。

### Decision: 区分 `storedSelection` 与 `effectiveSelection`

operation 归一化是运行时投影，不得静默覆盖用户原始偏好。系统需要区分：

```text
storedSelection
effectiveSelection
```

例如：

- 用户在 `image_edit` 中保存 `Use Input Size`
- 切到 `text_to_image`
- `effectiveSelection` 归一为 `provider-default`
- 但 `storedSelection` 仍保留 `exact-size`

只有用户主动修改选项时，新的选择才会覆盖已保存 preference。

原因：如果归一化直接回写持久化，用户切回 `image_edit` 时会永久丢失原始偏好；而不同页面若各自实现“归一后是否写回”，也会造成状态漂移。

### Decision: `Builder` 才拥有 provider wire 映射

catalog capability 中不再出现 provider-specific `requestOutput`。builder 根据：

```text
Selection + current operation + normalized input context + request strategy
```

生成真实 provider payload。

例如：

- GPT `exact-size` -> `size: "1152x2048"`
- Gemini `ratio-resolution` -> `aspectRatio + imageSize`

原因：provider wire contract 属于 request strategy / builder，而不是 catalog capability。把 wire 值放回 capability 会造成 catalog 泄漏 provider request 模板，也会让 `outputFormat` 等字段在多个层级重复定义并产生冲突。

替代方案：维持 catalog cell 直接挂 `requestOutput`。放弃该方案，因为它会让 catalog 成为 provider payload 仓库，并继续迫使 UI 与 capability 理解 wire 层细节。

### Decision: `Use Input Size` 合并进 `Output Size` 组，且固定排第一

当模型支持 edit-derived exact input size 时，UI 在 `image_edit` 操作的 `Output Size` 组首位显示：

```text
Use Input Size
```

它不是单独 section，也不是第二套 `Edit-only Output` 组件。

在 `text_to_image` 上：

- 不显示 `Use Input Size`
- 若已保存选择来自该值，UI visible state 与 dispatch 都按 `provider-default` 归一化；对用户显示为 `Auto`

`Use Input Size` 本身不拥有第二条尺寸计算链。它必须复用现有 input normalization chain 的产物：

```text
input asset
  -> input normalization
  -> normalized input geometry
  -> if Output Size = Use Input Size
     use normalized input geometry as output geometry
```

对于 `gpt-image-2` 首轮，这意味着最终参与 `Use Input Size` 的 normalized input geometry 必须已经满足输入链路的可上传约束；`exact-size` resolver 只负责读取并校验，不再做第二次几何改写。输出侧校验至少包括：

- 宽高为 16 的倍数
- 最长边不超过 3840
- 总像素位于合法范围
- 比例超过 3:1 时直接报错

多图编辑场景下，`Use Input Size` 必须始终读取 `primary edit input` 的 normalized geometry。首轮明确规定：

```text
primary edit input = first input image
```

这与当前外部 mask 作用于第一张输入图的语义保持一致，也避免 UI、application 与 builder 在多图尺寸来源上各自猜测。

原因：如果 `Use Input Size` 再单独建立一条输出尺寸派生逻辑，就会和现有 `providerInputSizePreset` / input 处理链形成双概念、双链路残留。

原因：用户心智里它就是一种“尺寸来源”，不是另一个 operation 配置模块。把它并入 `Output Size` 可以最小化界面扩张，同时避免再把 `Text to Image` / `Edit Image` 大块拆开。

替代方案：

- 单独做 `Edit-only Output` section。放弃，因为只为一个选项扩张一整块 UI，不符合当前产品需求。
- 在 `ModelConfigurationPage` 强制拆成 `text_to_image` / `image_edit` 两套视图。放弃，因为真实差异只有这一项，不值得破坏共享配置心智。

### Decision: UI 使用少数固定 archetype，而不是 per-model 定制页面

UI 不是每个模型一套页面，而是基于 `geometry.kind` 选择有限 archetype：

```text
A. Size + Format
B. Size + Aspect Ratio + Format
C. Geometry + Format
```

规则：

- `flexible-pixels` -> `Size + Format`
- `ratio-resolution` -> `Size + Aspect Ratio + Format`

`Use Input Size` 如果存在，只是在 `Size` 组内 prepend，不改变 archetype。

原因：产品需要统一、可预测的 UI，而不是每个模型长出不同页面；但统一不等于所有模型都强制共用 `size / ratio / format` 三字段。

替代方案：所有模型继续共用三字段。放弃，因为 GPT 会显示假的 `Aspect Ratio` 字段。另一替代方案是 per-model 完全手写 UI，也放弃，因为维护成本过高。

### Decision: `ModelConfigurationPage` 编辑“暴露入口限制”，不是无限能力空间的逐点子集

对于 `flexible-pixels` 这类无限或超大能力空间，`UserModelConfig` 不再尝试保存“完整能力真相子集”，而是保存产品暴露的推荐入口与限制规则，例如：

- 暴露哪些推荐 `Output Size` preset
- 是否允许 `Use Input Size`
- 暴露哪些 `Output Format`
- 对 `ratio-resolution` 模型暴露哪些 ratio / resolution 入口

原因：继续以 matrix subset 理解 `ModelConfigurationPage`，会迫使 repo 把无限能力空间伪装成有限 cell 列表，这与新的 capability 真相冲突。

替代方案：仍然把页面理解为官方 matrix subset editor。放弃，因为它对 GPT 一类模型不成立，也会让 UI 无法诚实表达“推荐入口”和“能力真相”的区别。

### Decision: `exact-size` resolver 只校验，不静默修改输入几何

`Use Input Size` 名义上是 exact-size。它读取的是 normalized input geometry，但 resolver 自身不能为了满足 output capability 再偷偷修改几何，例如：

- 自动 round 到 16 倍数
- 自动 crop 超宽比例
- 自动进一步 resize

边界应固定为：

```text
input normalization
  -> 产出最终实际输入 metadata

exact-size resolver
  -> 读取 metadata
  -> 按 output capability 校验
  -> 合法: 通过
  -> 非法: fail closed 或禁用选项
```

原因：一旦 resolver 自己再做几何修正，`Use Input Size` 就不再表示“使用输入尺寸”，而变成“使用某个系统猜测后的接近尺寸”。

### Decision: `Use Input Size` 复用现有 input normalization 链，而不是再发明第二个输入尺寸概念

`Use Input Size` 的尺寸来源不是新的独立 provider output preset，也不是单独的 builder 内部策略。它必须直接消费现有 generation settings / input processing 链已经产出的 normalized input geometry。

这意味着：

- `providerInputSizePreset` 或其后继 input 处理配置继续属于 input normalization 概念
- `Use Input Size` 只是 output selection 对这份 normalized geometry 的一次引用
- 不允许再引入第二条“原图尺寸 -> 输出尺寸”的并行派生逻辑

原因：如果 input 处理链和 output exact-size 各自维护尺寸来源，后续一定会出现 UI 展示、validation、builder payload 三方不一致。

### Decision: edit input capability 只保留输入与 mask 协议事实

edit input capability 首轮仅包含：

- `inputFormats`
- `maxImages`
- `maxBytesPerImage`
- `mask`

`mask` 使用最小但可校验的 shape：

```text
alpha-image
```

至少需要能够表达：

- `target = first-input`
- `formats = ['png']`
- `maxBytes = 4MB`
- `requiresSameDimensions = true`

像 `input_fidelity` 这种 provider request 行为不进入 capability；它属于 builder / strategy 规则。

原因：用户 capability 要表达“允许什么输入”和“mask 如何提供”，不该混入“某 provider 调用时必须省略哪个参数”这类实现细节。

替代方案：继续把 `inputFidelityPolicy` 等行为塞进 capability。放弃，因为它会把 request builder 规则错误地提升为用户可感知输入能力。

### Decision: `ratio-resolution` 的 exposure 首轮只做维度级限制

对于 `ratio-resolution` 模型，`ModelConfigurationPage` 首轮只允许分别限制：

- `aspectRatio`
- `resolution`
- `outputFormat`

不支持关闭特定 `aspectRatio × resolution` 组合异常。

原因：Gemini 当前原生就是独立 `aspectRatio` 与 `imageSize` 字段，维度级限制更符合其真实语义，也明显比组合级 exception 简单。

这不是 open question。首轮实现必须按该结论落地，tasks 与 specs 也只覆盖维度级限制。

### Decision: 新 change 取代两份旧 change 的方向，而不是在其上继续局部修补

本 change 作为后续实现的唯一规格基础。`model-output-matrix-generation-settings` 与 `redesign-model-config-output-capabilities` 中凡是建立在“固定三维 output matrix 真相”上的 requirement / design，后续都应被新 schema 替换，而不是继续迭代。

原因：继续在旧 change 上修补只会把错误假设扩散到更多文件和测试里，最后提高重构成本。

替代方案：保留旧 change，另起一个小 change 修补 GPT 细节。放弃，因为问题不是某个模型特例，而是能力抽象本身错误。

### Decision: builder 只消费 normalized input metadata，不负责读取图片尺寸

builder 必须保持纯函数边界：

```text
Selection + normalized input metadata -> provider payload
```

图片尺寸、mime、byteLength 等输入事实，应在 asset / input normalization 阶段就解析并附着到 request context。builder 不直接读取文件、不依赖 UXP runtime，也不解析图片字节。

原因：若 builder 自己读取图片尺寸，会把 provider 层和 host / CLI / UXP 环境耦合在一起，也会重新制造第二条 input size 解析链。

替代方案：让 GPT builder 自行读取输入图。放弃该方案，因为这会破坏纯函数边界并增加测试复杂度。

## Risks / Trade-offs

- [Risk] 从 matrix 真相切到 capability/selection/builder 三层后，短期内理解成本上升。→ Mitigation：在 design 与 specs 中强制明确每层边界，并让任务按包落地，避免一次性混改。
- [Risk] 旧实现已经广泛依赖 `imageSize + ratio + outputFormat`，迁移成本会高于局部 patch。→ Mitigation：明确旧 change 废弃方向，先稳定 schema 和 UI archetype，再按 provider/application/app 分层改造。
- [Risk] `ModelConfigurationPage` 从“真实能力子集”转为“暴露入口限制”后，命名与文案可能需要同步调整。→ Mitigation：在 UI spec 中明确用户可见文案，必要时把页面定位为 exposure / output profile editor。
- [Risk] `Use Input Size` 在 `text_to_image` 上归一到 `auto` 可能让极少数高级用户察觉不到内部差异。→ Mitigation：这是刻意的产品收敛；测试只验证行为一致，不暴露内部术语。
- [Risk] 将 wire mapping 下沉到 builder 后，若 capability 与 builder 约束不同步，可能出现运行时 validation failure。→ Mitigation：增加 provider capability -> selection -> builder 的端到端测试，并让 builder 对非法选择 fail closed。

## Migration Plan

- 新 change 先输出完整 proposal / design / specs / tasks，作为后续实现唯一依据。
- 现有两份旧 change 暂不立即删除，但实现阶段不得再按其 matrix 假设继续扩展；需要同步更新其状态或补充“被新 change 替代”的说明。
- 实现时按分层迁移：
  1. `packages/providers` 先落 capability schema 与 builder 边界。
  2. `packages/application` 落 selection contract 与 normalization。
  3. `apps/app` 改成 UI archetype 渲染。
- 如果过渡期需要兼容旧测试或旧 DTO，只允许做短期桥接，目标是最终删除 matrix-as-truth 路径。

## Open Questions

- `ModelConfigurationPage` 用户可见命名是否继续叫 `Model Configuration`，还是需要更明确地改成 output profile / exposed output editor。
