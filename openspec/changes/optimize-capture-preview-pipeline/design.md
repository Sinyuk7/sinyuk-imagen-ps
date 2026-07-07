## Context

当前 Photoshop `Capture` 在单次点击内同步完成两类导出物：

- 用于 UI 的 preview
- 用于 `Send` 的正式 `provider-input` 资产

现状问题有两层：

- preview 先占用一次 Photoshop host modal 与一次读取/编码成本，导致用户在 `Capture` 主完成前先等待 preview；
- 正式 `provider-input` 资产继续在同一条同步链路内编码与落盘，使大图场景下 `Capture` 总耗时叠加。

同时，本次变更有几个明确约束：

- 正式发送图继续统一使用 `PNG`，避免引入发送链路格式复杂度；
- preview 不需要透明度；
- `selection preview` 不需要保留选区形状；
- preview drift 接受“纯视觉 best-effort，不保证严格同帧”；
- preview 虽可时间漂移，但不能身份漂移；后台任务必须固定 `Capture` 时的 `documentID`、`layerID / composite source`、`sourceBounds` 与 `targetSize`；
- `@jsquash/png` 仅作为中等大图的阈值内候选 encoder，超过 `64 MiB RGBA` 阈值，或 `import / initialize / encode` 失败时必须回退当前自写 encoder，避免 UXP / WASM whole-buffer 路线带来过高 RSS 峰值；
- `@jsquash/png` 是否更快必须以真实 UXP 中的 cold / warm encode、`encode + assetStore.put` 总耗时与输出 `PNG` 大小比较为准，不能在设计阶段预设其一定优于当前 encoder；
- 必须补 production UXP smoke，因为 `.wasm` 能否被当前 Vite 构建正确加载是项目自己的集成风险。

## Goals / Non-Goals

**Goals:**

- 让 `Capture` 主路径优先完成正式 `provider-input` 资产准备与落盘，不再被 preview 真图阻塞。
- 让 `Send` 继续直接复用 `Capture` 时已经准备好的 `storedRef`，不引入发送时二次转码。
- 将 preview 改为后台异步 JPEG thumbnail，并优先使用 Photoshop host `imaging.encodeImageData()` 路线，绕开 JS `RGBA -> PNG` 预览编码。
- 为正式 `PNG` 编码引入阈值内候选 encoder：`@jsquash/png` 尝试处理 `targetWidth * targetHeight * 4 <= 64 * 1024 * 1024` 的输出；超过阈值或运行时失败时回退现有 encoder。
- 用 contract tests 固化 preview、正式资产、阈值切换、失败回退与 `Send` 复用行为。
- 增加结构化 timing 观测与真实 UXP harness 对比，验证 preview 解耦与候选 encoder 是否真实改善链路。

**Non-Goals:**

- 不改变正式发送图统一为 `PNG` 的策略。
- 不保证 preview 与正式发送图严格同帧。
- 不在本次变更中重写超大图 `PNG` 流式编码器。
- 不为 preview 保留透明度、选区 mask 形状或额外交互状态。
- 不在本次变更中调整 provider input size policy 本身。
- 不为 preview 新建复杂调度系统、自动重试策略或动态阈值。

## Decisions

### 1. `Capture` 主路径只保证正式 `provider-input` ready

`Capture` 点击后，UI 先插入 pending attachment 与占位 preview。host 主路径继续同步完成：

- `captureRect` 解析
- 正式 `provider-input` 图读取
- 正式 `PNG` 编码
- `assetStore.put(...)`

主路径完成后，attachment 即进入可发送状态。`Send` 继续直接读取 `image.resource.derivatives.providerInput.storedRef`。

选择理由：

- 直接去掉 preview 对 `Capture` 主完成的阻塞；
- 不改变现有 `Send` 资源复用语义；
- 避免把正式图准备时机从 `Capture` 推迟到 `Send`。

备选方案：

- 同步 preview 后再做正式图：维持现状，无法解决体感阻塞。
- `Send` 时才生成正式图：会把等待转移到 `Send`，并改变现有 attachment ready 语义。

### 2. preview 改为后台异步 JPEG，并绑定 `Capture` 时 source identity

正式 `provider-input` ready 后，再后台发起 preview 派生任务。该任务使用：

- `imaging.getPixels({ targetSize, componentSize: 8, colorSpace: \"RGB\", applyAlpha: true })`
- `imaging.encodeImageData({ imageData, base64: false })`

preview 明确采用 `JPEG`，不保留透明度，也不读取 `selection mask`。若当前图像存在 alpha，`applyAlpha: true` 统一以白底返回 RGB。

后台 preview 请求必须固定在 `Capture` 完成时记录的 source identity：

- `documentID`
- `layerID` 或 composite source choice
- `sourceBounds`
- `targetSize`

本阶段不保存 `historyStateID`，因此允许时间漂移；但后台 preview 绝不能退回读取“当前 active document / active layer”。若原 `documentID` 或 `layerID` 已不可用，则 preview 直接失败，保留 placeholder。

选择理由：

- `preview` 不需要透明度与选区形状，host JPEG 路径满足需求；
- 可跳过 `imageData.getData() -> imageDataToRgba() -> rgbaToPngBytes()`；
- `targetSize` 小，容易命中 Photoshop pyramid cache；
- JPEG 对 UI 卡片展示足够，且字节更轻；
- 固定 source identity 可以避免用户切换文档后，把完全错误的 preview 回填到旧 attachment。

备选方案：

- 直接复用正式 `PNG` bytes 再做 thumbnail：会把 preview 派生绑定到 JS decode/resize/encode 成本，且不能使用 `imaging.encodeImageData()`。
- preview 使用 `WebP`：需要额外引入或验证 encoder，当前收益不如先落 JPEG 单一路径。
- preview 保留选区形状：需要继续走 `getSelection()` 与 mask 合成，和本次“去阻塞、去复杂度”目标冲突。
- 后台 preview 退回读取当前 active document：虽然实现简单，但会造成附件身份漂移，不可接受。

### 3. 正式发送图继续统一 `PNG`

正式发送图不引入 `JPEG` / `WebP` 分支。`Capture` 期间生成的 provider-input 资产继续统一为 `PNG`，并作为后续 provider request 的唯一本地输入格式。

选择理由：

- 保持现有 `ensurePlaceableImagePayload`、asset store、task snapshot、provider input derivative 语义不变；
- 避免引入“alpha 检测 -> 条件切格式”的额外 contract 分叉；
- 本次性能优化重点是 preview 解耦与 `PNG` 编码候选路径，不是发送格式重构。

备选方案：

- `opaque -> JPEG`、`alpha -> PNG`：发送链路复杂度上升，需补更多格式分支验证，不符合本次范围。

### 4. 正式 `PNG` 编码采用阈值化候选路径与运行时失败回退

正式 `provider-input` `PNG` 编码按最终输出尺寸选择 encoder：

- 当 `targetWidth * targetHeight * 4 <= 64 * 1024 * 1024` 时，尝试 `@jsquash/png`
- 当其超过阈值时，回退现有自写 encoder + stored deflate
- 当其未超过阈值，但 `@jsquash/png` 在 `import`、WASM initialize、或 encode 阶段失败时，也回退现有自写 encoder + stored deflate

阈值判断以最终输出 `targetSize` 为准，不以源图尺寸或单边像素为准。

选择理由：

- `64 MiB RGBA` 与 `4096 x 4096` 等价，首版是合理硬阈值；
- 允许在中等大图场景里尝试更快 encoder，但不预设其一定胜出；
- 超大图继续保留现有低风险路径，避免 `WASM whole-buffer` 内存峰值失控。
- 运行时失败回退可把 `.wasm` 加载、bundling 或 UXP 环境差异控制为性能降级，而不是功能失败。

备选方案：

- 全量切到 `@jsquash/png`：对高像素图 RSS 风险过高。
- 只按单边 `4096` 判断：会误伤如 `8192 x 2048` 这类同样落在 `64 MiB RGBA` 内的输出。
- 直接重写流式 `PNG` 编码器：价值高，但超出本次范围。

### 5. preview placeholder 仅保留在 UI / 会话态，不扩张 durable truth

本次不把 `placeholder / failed` 写入 durable task truth。正式可发送性仍只由 `providerInput.storedRef` 决定；preview 仅在后台成功时写入可选 preview 资源，失败时继续显示 placeholder。

如果现有内存态或 view-model 需要显式区分 placeholder / failed，可在 UI-local 或 session-local state 中表达；但 preview 失败不应污染 task snapshot、provider input contract 或 send 语义。

后台 preview 完成回填时必须检查：

- attachment 仍然存在；
- 当前 capture generation / version 仍然匹配；
- 结果未 stale。

不满足时直接丢弃结果。

选择理由：

- preview 非关键派生物，不值得扩大 durable domain 面；
- 可避免旧 preview 覆盖新 attachment 或已删除 attachment。

备选方案：

- 在 durable `ImageResource` 中显式保存 pending / failed：表达更完整，但会把非关键 UI 状态带入持久真相层。

### 6. 复用现有 host queue，并将 preview 视为最低优先级后台任务

当前 host modal 已有统一串行 queue。本次不新建调度系统。preview 任务必须复用现有 queue，并遵守以下约束：

- 单 attachment 最多一个 preview task；
- 不自动重试；
- stale result 丢弃；
- 后台异常全部吞掉并记录；
- foreground `Capture` / `Send` / placement 不得被 preview 语义性抢占。

首版若现有 queue 无廉价 priority hook，则保持单队列实现，但必须通过真实 UXP 观测验证“`Capture ready` 后立即 `Send`”不会引入不可接受的附加延迟。

选择理由：

- 复用现有 queue 风险最小；
- preview 本质是可丢弃后台任务，应该以 foreground host 操作为先。

备选方案：

- 新建独立优先级调度系统：复杂度过高，不适合首版。

### 7. 结构化 timing 是本次变更的交付物之一

本次不是只交 correctness。实现必须产出结构化 timing，至少覆盖：

- `providerInput.getPixelsMs`
- `providerInput.getDataMs`
- `providerInput.transformMs`
- `providerInput.encodeMs`
- `providerInput.storeMs`
- `providerInput.encoder`
- `providerInput.rgbaBytes`
- `providerInput.pngBytes`
- `preview.getPixelsMs`
- `preview.encodeMs`
- `capture.readyMs`

这些 timing 不作为 CI 性能断言，而是供真实 UXP harness 比较：

- `2048 x 2048`
- `4096 x 4096`
- 一个超过 `64 MiB RGBA` 的样本

选择理由：

- 否则无法证明 preview 解耦或阈值内候选 encoder 真正改善了链路；
- 结构化 timing 比主观体感更适合作为后续是否提升阈值的依据。

## Risks / Trade-offs

- [后台 preview 仍会进入 Photoshop modal] → 将其从 `Capture` 主完成后异步触发，确保不阻塞正式发送资产 ready。
- [preview 与正式发送图不严格同帧] → 明确将 preview 定义为视觉 best-effort，不作为 placement 或 send 语义来源，同时固定 capture-time identity，避免身份漂移。
- [`@jsquash/png` 在 UXP 环境下存在峰值内存或 bundling 风险] → 使用 `64 MiB RGBA` 硬阈值；`import / initialize / encode` 任一失败立即回退现有 encoder，并补 production UXP smoke。
- [preview 改为 JPEG 后不再保留透明度] → 明确 preview 仅承担小图可视反馈，不承担像素真值表达。
- [后台 preview 与立即 `Send` 争抢 host queue] → 不新建调度系统；先复用现有 queue、限制任务数量、丢弃 stale，并用真实 UXP timing 验证争抢成本。

## Migration Plan

- 先引入 preview placeholder 与正式资产优先完成语义。
- 再接入 capture-time identity 固定的后台 JPEG preview 派生。
- 再接入 `@jsquash/png` 阈值内候选路径与运行时失败回退。
- 再补 production UXP smoke 与结构化 timing。
- 最后补齐 contract tests，并以测试锁定 `Capture`/`Send`/preview 三条链。

## Open Questions

- 无阻塞性问题继续通过真实 UXP harness 观测，不再额外扩张设计。
