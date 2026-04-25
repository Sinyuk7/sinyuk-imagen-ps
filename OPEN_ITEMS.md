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
- **evidence**: 当前 `core-engine` 测试均为独立单元测试，无跨包集成测试；`core-engine/OPEN_ITEMS.md` 已记录
- **impact**: 真实集成中可能出现序列化边界、类型不匹配或 event 传播问题
- **next_action**: 待 `workflows` builtin specs 补齐后，创建端到端集成验证

## 模块债务

### `providers` 基础模块测试覆盖不足

- **type**: confirmed debt
- **evidence**: `packages/providers/OPEN_ITEMS.md` 已记录；原 Change 4 仅部分完成
- **impact**: 缺乏回归保护，重构时易引入破坏
- **next_action**: 补充 contract、registry、mock 的单元测试

### `workflows` builtin specs 尚未落地

- **type**: confirmed debt
- **evidence**: `packages/workflows/STATUS.md` 已记录；`src/index.ts` 当前无导出
- **impact**: `core-engine` 无法消费真实 workflow spec，集成验证受阻
- **next_action**: 补齐最小 builtin workflow specs 并导出

### `shared commands` 与 `CLI` 尚未启动

- **type**: follow-up cleanup
- **evidence**: `STATUS.md` 与 `IMPLEMENTATION_PLAN.md` 均标记为待启动
- **impact**: 当前 surface 验证缺失，业务链路未闭合
- **next_action**: 待 `workflows` 稳定后，按 Phase 3-4 启动
