# Open Items

> Current unresolved items only. Historical planning documents are not authoritative.

## Decisions Needed

### 默认 workflow 的长期形态

- **evidence**: `SPEC.md` 暂定信息；开发期已标记为 tentative，尚未收敛。
- **impact**: 影响 `workflows` 包与 `core-engine` 的默认注册契约；如果默认 workflow 发生结构变化，可能需要调整 runner 的 input binding 或 registry 初始化方式。
- **owner_or_next_action**: 待与 `workflows` 模块负责人或用户确认默认 workflow 的 stable shape。
- **source**: `STATUS.md` §2 Open Questions（已归档）。

### runtime 与 facade / CLI 的最终装配位置

- **evidence**: `SPEC.md` 暂定信息；`createRuntime()` 当前提供组装入口，但 facade / CLI 的最终装配方式尚未确定。
- **impact**: 影响 `app` 层如何消费 `core-engine`；是否封装、暴露哪些接口仍待决策。
- **owner_or_next_action**: 待 `app` 层设计确定后评估是否需要调整 `Runtime` / `RuntimeOptions` 接口。
- **source**: `STATUS.md` §2 Open Questions（已归档）。

## Verification Gaps

### 与 providers、workflows 的真实集成尚未验证

- **evidence**: 当前 `core-engine` 测试均为独立单元测试，无跨包集成测试；`SPEC.md` 已标记此缺口。
- **impact**: 真实集成中可能出现序列化边界、类型不匹配或 event 传播问题。
- **owner_or_next_action**: 待 `providers` 和 `workflows` 模块就绪后，创建端到端集成验证。
- **source**: `STATUS.md` §2 Open Questions（已归档）。
