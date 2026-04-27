# providers Open Items

> 仅记录当前仍有效的未解决事项，不包含已完成 planned changes 或历史愿景。

## 1. ProviderDescriptor.configSummary 长期形态未定 ✅ resolved

- **decision**: **移除** `ProviderDescriptor.configSummary`。
- **rationale**:
  - 类型定义存在但**零填充**（`mockDescriptor` / `openaiCompatibleDescriptor` 均未提供）；
  - 全代码库**零消费**（`provider-registry.list()` 仅返回 `describe()` 静态结果，无任何上层读取 `configSummary`）；
  - "针对某份运行时 config 的动态摘要"与"静态 descriptor"语义不同，混在一起会让 share_command / settings UI 设计时被迫吸收两类不一致的关注点；
  - 如未来确实需要展示已配置参数，应另起独立 API（如 `provider.summarizeConfig(config)`），把静态描述与运行时摘要分离。
- **commit_scope**: `packages/providers/src/contract/provider.ts`（删除字段、补充 JSDoc 决策注释）。
- **follow_up**: 无（已闭环）。

## 2. ProviderInvokeResult.raw 是否作为稳定公开字段 ✅ resolved

- **decision**: **保留**字段但**降级为非稳定面**（"调试可观测开口"）。
- **rationale**:
  - 内置 provider 已实质填充（mock 写入操作元数据、openai-compatible 写入原始 HTTP body），现有测试也直接断言 `result.raw`；
  - 删除会破坏既有调试能力，且对故障排查、回归测试有真实价值；
  - 但 `unknown` 类型无法在编译期约束 shape，若纳入 SemVer 稳定面会让 provider 升级被迫维持 raw shape 兼容；
  - 折中方案：保留字段，在 `contract/result.ts` JSDoc 中**显式声明**：(a) shape 不稳定，可能随 provider 版本变化；(b) 生产代码（share_command / UI 主路径）只能消费 `assets` 与 `diagnostics`；(c) `raw` 仅供测试断言、本地调试、故障排查使用。
- **commit_scope**: `packages/providers/src/contract/result.ts`（升级 JSDoc，明确稳定性边界）。
- **follow_up**: share_command 在设计 facade 时若涉及"展示原始响应"的能力，应将 `raw` 显式标注为"调试模式专用"，并提供"non-debug 路径完全不依赖 raw"的等价数据来源。

## 3. contract / registry / mock 测试覆盖不足 ⏸ deferred

- **type**: confirmed debt
- **status**: 已**显式延后**到 share_command PRD/SPEC/TASK 完成之后。
- **rationale**: 当前阶段聚焦"先稳契约边界 → 再设计 share_command 三件套"，回归测试与覆盖加固按规划放在 share_command 落地之后统一处理（详见根目录 `STATUS` 或 share_command TASK 文档"加固阶段"章节）。
- **next_action**: 进入加固阶段时，按 contract / registry / mock 三个层次补充单元测试，并联动 workflows 跨包测试中先前因 OI-1/OI-2/OI-3/OI-4 修复后需更新断言的用例。