# Stability

## 稳定性要求

作为 surface app 与 domain 层之间的唯一桥梁，本包的稳定性直接影响上层所有消费者。

| 指标 | 要求 |
|------|------|
| 命令函数可用性 | 100%（不可因内部异常导致命令不可调用） |
| API 兼容性 | v1 命令签名冻结，不允许 breaking change |
| 错误可恢复性 | 所有异常必须被 CommandResult 捕获，不泄露到 surface |

## 异常处理策略

### 统一错误转换

所有异步命令在 `try/catch` 中捕获异常，通过 `toJobError()` 转换为结构化的 `JobError`：

```typescript
try {
  // 业务逻辑
} catch (error) {
  return { ok: false, error: toJobError(error) }
}
```

**转换规则：**
- `JobError` 实例 → 原样保留（保持 category）
- `Error` 实例 → 转为 `runtime` category，附带 name/stack 元数据
- 非 Error 值 → 转为 `runtime` category，`cause: String(error)`

### 错误分类

| Category | 含义 | 消费方处理建议 |
|----------|------|----------------|
| `validation` | 输入/配置校验失败 | 提示用户修改输入 |
| `provider` | Provider 请求/响应错误 | 可重试或切换 provider |
| `runtime` | 未预期的系统异常 | 记录日志，通知用户联系支持 |

## 兜底策略

| 场景 | 兜底措施 |
|------|----------|
| Runtime 初始化失败 | `getRuntime()` 抛出异常被命令层捕获，返回 `CommandResult { ok: false }` |
| Provider 不可用 | Provider dispatch adapter 返回错误，命令层包装为 `provider` category 的 JobError |
| Config adapter 异常 | `get/save` 的异常被命令层捕获并转为 `runtime` category |
| 未知 workflow 名称 | TypeScript 编译期拒绝；运行时由 core-engine 抛出并被捕获 |

## 性能基线

| 操作 | 预期耗时 |
|------|----------|
| 同步查询 (`getJob`, `listProviders`) | < 1ms |
| Runtime 首次初始化 | TODO: 待基准测试确认 |
| Config 读写（内存 adapter） | < 1ms |
| `submitJob` 端到端 | 取决于 provider 响应时间，非本包瓶颈 |

## 监控与告警

本包为纯函数库，不自带监控基础设施。消费方（surface app）应在以下场景记录日志：

1. `CommandResult.ok === false` 时记录 `error.category` + `error.message`
2. `subscribeJobEvents` 的 `job:failed` 事件记录失败原因
3. Runtime 初始化异常（首次命令调用失败）应以 ERROR 级别上报
