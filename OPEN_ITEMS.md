# Open Items

> 仅记录当前仍有效的未解决事项。历史规划文档不具备权威性。

## 文档对齐

### 根级 `IMPLEMENTATION_PLAN.md` 与 `STATUS.md` 的持续对齐

- **type**: necessary doc gap
- **evidence**: `IMPLEMENTATION_PLAN.md` 的 Phase 计划与 `STATUS.md` 的模块完成状态可能在后续迭代中再次脱节
- **impact**: Agent 读取时会得到矛盾的项目进度信息，可能做出错误判断
- **next_action**: 每次完成一个 phase 后，同步更新 `STATUS.md` 中的模块完成状态，并检查 `IMPLEMENTATION_PLAN.md` 是否仍需要引用最新状态

## 跨模块集成

### `core-engine` 与 `providers`、`workflows` 的真实集成尚未验证

- **type**: verification gap
- **evidence**: `workflows` 已补齐 builtin specs、稳定最小 request contract，并验证了 `mock provider` dispatch adapter happy path；但仍缺少覆盖更多边界、错误路径和真实 provider 场景的跨包集成测试
- **impact**: 真实集成中仍可能出现序列化边界、类型不匹配、deep-freeze 兼容性或 event 传播问题
- **next_action**: 基于 `add-provider-bridge-compatibility-tests` 补更完整的跨包验证，再决定是否需要进一步的 end-to-end harness

## 模块债务

### `providers` 基础模块测试覆盖不足

- **type**: confirmed debt
- **evidence**: `packages/providers/OPEN_ITEMS.md` 已记录；原 Change 4 仅部分完成
- **impact**: 缺乏回归保护，重构时易引入破坏
- **next_action**: 补充 contract、registry、mock 的单元测试

### `workflows` 更完整跨包兼容验证仍不足

- **type**: confirmed debt
- **evidence**: `packages/workflows` 已落地最小 builtin workflow contract，但当前只覆盖 runtime happy path 与最小 `mock provider` bridge happy path
- **impact**: 更复杂的 provider bridge 边界、错误路径和真实 provider 场景仍可能在后续 surface 接入时暴露问题
- **next_action**: 补充 `add-provider-bridge-compatibility-tests`，扩大跨包验证范围

### `shared commands` 与 `CLI` 尚未启动

- **type**: follow-up cleanup
- **evidence**: `STATUS.md` 与 `IMPLEMENTATION_PLAN.md` 均标记为待启动
- **impact**: 当前 surface 验证缺失，业务链路未闭合
- **next_action**: 待 `workflows` 稳定后，按 Phase 3-4 启动
