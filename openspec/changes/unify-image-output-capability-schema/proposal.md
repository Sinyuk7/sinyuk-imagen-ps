## Why

当前两份进行中的 image output 相关 change 都建立在固定 `imageSize + ratio + outputFormat` matrix 假设上，但这个假设已经被新的产品结论推翻：`gpt-image-2` 的真实输出几何能力是受约束的像素空间，Gemini 的真实输出几何能力是 `aspectRatio + resolution` 原生组合。继续围绕统一 matrix 扩展，只会让 catalog、UI 与 builder 的边界越来越混乱。

现在需要把 image output 体系统一重构为更通用的能力模型，明确区分 `Capability`、推荐 preset、`Selection` 与 builder 映射规则，并把 `Use Input Size` 作为 `Output Size` 中的 edit-only 特殊选项纳入统一 UI。`Use Input Size` 的尺寸来源与合法性校验必须复用现有 input normalization chain，避免残留第二条独立尺寸链路。

## What Changes

- **BREAKING**：废弃“固定 `imageSize + ratio + outputFormat` output matrix 是能力真相”的设计前提，改为以 geometry capability union 描述模型真实输出几何能力。
- **BREAKING**：停止把 provider wire `requestOutput` 作为 catalog capability 数据的一部分保存；catalog 只描述能力、约束与推荐 preset，builder 负责把 `Selection + normalized input context` 转成真实 provider payload。
- **BREAKING**：重写 `Generation Settings`、MainPage output controls 与 `ModelConfigurationPage` 的 UI 语义，不再强制所有模型都显示独立 `Aspect Ratio` 字段，也不再因为 `Use Input Size` 这一项差异拆成两套 operation 配置界面。
- 新增统一 image output capability schema，首轮只覆盖两类 geometry：
  - `flexible-pixels`：以像素约束空间表达真实能力，并允许少量 UI 推荐 preset。
  - `ratio-resolution`：以原生 `aspectRatio × resolution` 组合表达真实能力。
- 新增约束：推荐 preset 不是能力真相；UI 必须根据 geometry kind 渲染少数固定 archetype，而不是把所有模型压成同一组字段。
- 新增 selection contract，明确保存的是用户意图而不是 provider wire 值；selection 必须同时包含 geometry 与 `outputFormat`，其中 geometry 至少支持：
  - `provider-default`
  - `pixels`
  - `ratio-resolution`
  - `input-derived`（首轮仅 `exact-size`）
- 明确区分 `storedSelection` 与 `effectiveSelection`：operation 归一化是运行时投影，不得静默覆盖已保存偏好。
- 将 `Use Input Size` 定义为 `Output Size` 组内的 edit-only 首位特殊选项；在 `text_to_image` 上不显示，已保存该值切换到 `text_to_image` 时按 `auto` 归一化，不向用户暴露额外的 operation 分裂 UI。
- 重写 edit input capability，只保留输入格式、最大图片数、最大字节数与外部 `alpha-image` mask 协议能力；像 `input_fidelity` 这类 request 行为归入 builder / strategy 规则，不混入 capability。
- 明确 `Use Input Size` 在多图编辑中始终读取 `primary edit input` 的 normalized geometry；首轮规定 `primary edit input = first input`。
- 明确 `exact-size` resolver 只校验 normalized input geometry 是否满足 output capability，不得为满足输出约束而静默 round、crop 或 resize 输入尺寸。
- 重新定义 `UserModelConfig` 的限制目标：页面编辑的是“产品暴露的推荐输出入口与限制规则”，不是无限几何能力空间本身的逐点枚举子集。
- 对现有两份进行中的 change 做统一收敛：新 change 作为后续实现的唯一规格基础；旧 change 仅补 superseded note，不再在本 change 中创建伪 `REMOVED` delta spec。

## Capabilities

### New Capabilities
- `image-output-capability-schema`: 定义模型输出能力、几何 union、推荐 preset、edit input capability，以及 catalog 与 builder 的边界。
- `image-output-selection-and-builder`: 定义用户输出选择的 canonical contract、`storedSelection/effectiveSelection` 关系、operation 归一化规则，以及 builder 如何把 `Selection + normalized input context` 映射为 provider 请求。
- `image-output-ui-archetypes`: 定义 MainPage、`GlobalGenerationSettingsPage` 与 `ModelConfigurationPage` 的固定 UI archetype、字段显隐规则、`Use Input Size` 合并显示规则，以及共享/分裂的产品行为。
- `user-model-output-exposure`: 定义用户模型配置如何限制产品暴露入口、如何处理 `Use Input Size` 等 edit-only 选项，以及如何替代旧的 matrix subset 页面语义。

### Modified Capabilities
- 无。当前 repo 还没有归档到 `openspec/specs/` 的 image output 主 spec；本 change 以新的 consolidated capabilities 取代两份进行中的 matrix-oriented change 方向。

## Impact

- `packages/providers`：image catalog、capability contract、request contract、builder / strategy 边界、catalog validation。
- `packages/application`：selection contract、preference save/load、context-aware normalization、dispatch 前 builder 输入解析。
- `apps/app`：MainPage output controls、`GlobalGenerationSettingsPage`、`ModelConfigurationPage`、shared controller / hooks、fake data 与 storage validators。
- 进行中的 `model-output-matrix-generation-settings` 与 `redesign-model-config-output-capabilities` change 需要被新 change 替代性收敛，避免继续围绕旧 matrix 假设实现。
- Tests：provider capability tests、application selection/builder tests、app UI archetype tests、`Use Input Size` operation normalization tests、用户模型配置暴露限制 tests。
