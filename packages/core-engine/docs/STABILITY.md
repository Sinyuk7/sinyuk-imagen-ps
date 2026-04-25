# Stability

## 稳定性要求

### 核心质量红线

| 指标 | 要求 | 说明 |
|------|------|------|
| 状态一致性 | 100% | Job 状态迁移必须合法，不允许出现非法状态 |
| 数据完整性 | 100% | Job input/output/error 必须保持 serializable 和 immutable |
| 错误可追踪 | 100% | 所有失败必须产生标准 `JobError`，包含 category 和 message |

### 性能基线

| 指标 | 基线 | 说明 |
|------|------|------|
| `submitJob` 延迟 | < 1ms | 纯内存操作，不应阻塞 |
| `getJob` 延迟 | < 1ms | Map 查找 + snapshot 复制 |
| Event emit 延迟 | < 1ms | mitt 同步广播 |

> TODO: 具体数值需在真实集成后通过 benchmark 确认。

## 异常处理策略

### 错误分类

| Category | 触发场景 | 处理方式 |
|----------|---------|---------|
| `validation` | 输入不合法、job 不存在、状态不匹配 | 立即抛出，阻止操作继续 |
| `runtime` | 状态迁移非法、内部逻辑错误 | 立即抛出，标记 job 为 failed |
| `workflow` | Workflow 未找到、step 执行失败 | 标记 job 为 failed，记录错误详情 |
| `provider` | Provider adapter 调用失败 | 标记 job 为 failed，记录 provider 返回的错误 |
| `unknown` | 未预期的异常 | 包装为 `JobError`，标记 job 为 failed |

### 关键路径错误处理

#### Job 提交

```
submitJob(input)
├─ assertSerializable(input) → 失败抛 ValidationError
├─ 创建 job record
└─ 返回 immutable snapshot
```

#### Workflow 执行

```
executeWorkflow(job, workflowName)
├─ registry.getWorkflow(name) → 未找到抛 WorkflowError
├─ controller.markRunning(job.id)
├─ 遍历 steps
│   └─ dispatcher.dispatch() → 失败抛 ProviderError
├─ 成功 → controller.markCompleted(job.id, output)
└─ 失败 → controller.markFailed(job.id, error)
```

#### 状态迁移

```
markRunning(id) / markCompleted(id) / markFailed(id)
├─ job 不存在 → 抛 ValidationError
├─ 状态迁移非法 → 抛 RuntimeError
└─ 更新状态，返回 snapshot
```

## 兜底策略

### 未捕获异常包装

所有未预期的异常在进入 `markFailed` 前，必须包装为标准 `JobError`：

```typescript
try {
  await executeStep(step);
} catch (e) {
  const error = e instanceof Error
    ? createUnknownError(e.message, { stack: e.stack })
    : createUnknownError('Unknown error occurred');
  controller.markFailed(job.id, error);
}
```

### 状态兜底

- Job 一旦进入 `completed` 或 `failed`，不允许再次迁移
- 重复调用 `markCompleted` 或 `markFailed` 会抛 `RuntimeError`
- 这确保 job 状态不会被意外覆盖

### Event Bus 兜底

- Event listener 抛出的异常不会影响其他 listener
- Event listener 抛出的异常不会影响 job 状态
- mitt 默认行为：listener 异常会被静默忽略

## 监控与告警

### 关键指标

| 指标 | 采集方式 | 告警条件 |
|------|---------|---------|
| Job 失败率 | 统计 `failed` 事件数 / 总事件数 | TODO: 需确定阈值 |
| 状态迁移异常 | 捕获 `RuntimeError` with category | 任何出现即告警 |
| Provider 错误分布 | 按 `providerName` 聚合 `ProviderError` | TODO: 需确定阈值 |

> TODO: 具体监控实现依赖上层 surface 接入，当前 core-engine 只提供标准错误结构。

### 日志点

| 事件 | 日志级别 | 内容 |
|------|---------|------|
| Job created | info | `{ jobId, input }` |
| Job running | info | `{ jobId, workflowName }` |
| Job completed | info | `{ jobId, duration }` |
| Job failed | error | `{ jobId, error }` |
| Illegal transition | error | `{ jobId, from, to }` |

> TODO: 日志输出方式依赖上层 surface 注入的 logger adapter。

## 当前刻意省略

以下能力不在当前阶段实现：

- Job cancel / abandon
- Job queue / 并发控制
- Durable history / 持久化
- Background recovery / 断点恢复
- 自动重试策略

这些能力如需添加，应通过独立 change 引入，不在当前 `core-engine` 稳定性范围内。
