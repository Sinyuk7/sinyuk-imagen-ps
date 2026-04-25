# Stability — @imagen-ps/workflows

## 稳定性要求

### 模块定位

`@imagen-ps/workflows` 是 pure data 模块，不包含可执行逻辑。稳定性要求聚焦于：

1. **类型契约稳定性** — 导出的 workflow shape 必须与 `core-engine` 的 `Workflow` 类型兼容
2. **数据不可变性** — 所有导出的 workflow spec 必须是深度冻结的
3. **向后兼容性** — 已发布的 workflow name 和稳定字段不应破坏性变更

### 质量指标

| 指标 | 目标 | 说明 |
|------|------|------|
| 类型检查通过率 | 100% | `pnpm build` 无类型错误 |
| 测试覆盖 | 关键路径 100% | 导出、immutability、registry 注册、runtime 兼容性 |
| 依赖违规 | 0 | 不引入 `providers` 或 `app` 依赖 |

## 异常处理策略

### 类型不兼容

**场景**：`core-engine` 更新 `Workflow` 类型定义后，本模块编译失败。

**处理方式**：
1. 优先升级本模块以适配新类型定义
2. 若涉及破坏性变更，在 STATUS.md 中记录并评估影响范围
3. 必要时协调 `core-engine` 提供过渡方案

### Registry 注册失败

**场景**：workflow spec 不满足 `createWorkflowRegistry()` 的最小约束。

**处理方式**：
1. 测试必须覆盖 registry 注册成功场景
2. 若 registry 约束变更，同步更新本模块的 workflow spec

## 兼容性策略

### 稳定字段

以下字段已收敛为稳定 contract，不应破坏性变更：

**provider-generate**:
- `name: 'provider-generate'`
- `steps[0].input.provider: '${provider}'`
- `steps[0].input.request.operation: 'generate'`
- `steps[0].input.request.prompt: '${prompt}'`
- `steps[0].outputKey: 'image'`

**provider-edit**:
- `name: 'provider-edit'`
- `steps[0].input.provider: '${provider}'`
- `steps[0].input.request.operation: 'edit'`
- `steps[0].input.request.prompt: '${prompt}'`
- `steps[0].input.request.inputAssets: '${inputAssets}'`
- `steps[0].outputKey: 'image'`

### Tentative 字段

以下字段为 tentative，可能在后续版本变更：

- `maskAsset`
- `output`
- `providerOptions`

使用这些字段的消费方应做好兼容性处理。

## 性能基线

作为 pure data 模块，性能关注点较少：

| 指标 | 基线 | 说明 |
|------|------|------|
| 构建时间 | TODO: 待测量 | `pnpm build` 耗时 |
| 包体积 | TODO: 待测量 | `dist/` 输出大小 |
| 导入耗时 | < 10ms | 模块 import 耗时（pure data，应极快） |

## 监控与告警

### CI 检查项

| 检查 | 触发条件 | 处理方式 |
|------|----------|----------|
| 类型检查 | `pnpm build` 失败 | 修复类型错误 |
| 单元测试 | `pnpm test` 失败 | 修复测试或更新预期 |
| Immutability 测试 | 冻结检查失败 | 确保所有导出使用 `Object.freeze()` |

### 人工审查触发点

| 场景 | 审查重点 |
|------|----------|
| 新增 workflow | 命名规范、类型兼容、immutability |
| 修改稳定字段 | 向后兼容性影响评估 |
| 升级 core-engine | 类型契约兼容性 |

## 降级方案

由于本模块是 pure data 包，不涉及运行时降级。若 workflow spec 不可用：

1. **消费方责任**：runtime 层应处理 workflow 查询失败（`registry.get()` 返回 `undefined`）
2. **版本锁定**：消费方可锁定 `@imagen-ps/workflows` 版本避免升级风险
3. **自定义 workflow**：消费方可绕过 builtin workflows，直接定义自己的 workflow spec
