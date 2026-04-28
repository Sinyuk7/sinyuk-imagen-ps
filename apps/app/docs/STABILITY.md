# 稳定性规范

## 稳定性要求

### 当前阶段

当前模块处于早期占位阶段（`stage: "placeholder"`），尚未进入生产使用。以下稳定性要求适用于后续正式实现阶段。

### 质量红线

TODO: 以下指标待后续正式实现阶段确定具体数值：

- 插件崩溃率
- UI 响应时间
- host 操作成功率

## 异常处理策略

### 层级边界异常

| 层级 | 异常处理方式 |
|------|-------------|
| `ui/` | 使用 React Error Boundary 捕获渲染异常，显示友好错误提示 |
| `host/` | 捕获所有 UXP/Photoshop API 异常，转换为标准错误结构 |
| `shared/` | 透传共享模块的错误，不吞掉也不过度包装 |

### 错误传播原则

1. **不吞异常**：所有异常必须被捕获并处理或向上传播
2. **保留上下文**：错误信息应包含足够的上下文用于调试
3. **用户可理解**：面向用户的错误提示应清晰说明问题和下一步操作

### host 层异常处理示例

```typescript
// src/host/document-adapter.ts
export async function getActiveDocument(): Promise<Result<Document, HostError>> {
  try {
    const doc = await app.activeDocument;
    return { ok: true, value: doc };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "HOST_DOCUMENT_ACCESS_FAILED",
        message: "无法访问当前文档",
        cause: error
      }
    };
  }
}
```

## 兜底策略

### UI 渲染失败

当 React 组件渲染失败时：

1. Error Boundary 捕获异常
2. 显示简化的错误视图
3. 提供「重试」和「报告问题」选项
4. 记录错误详情用于调试

### host 操作失败

当 Photoshop/UXP API 调用失败时：

1. 返回标准化错误结构
2. UI 显示操作失败提示
3. 提供重试选项（如适用）
4. 不阻塞其他功能的使用

### 共享模块调用失败

当 `core-engine`、`providers` 或 `workflows` 返回错误时：

1. `shared/` 层透传错误
2. `ui/` 层根据错误类型显示对应提示
3. 提供相关的用户操作建议

## 性能基线

TODO: 以下性能指标待后续正式实现阶段确定具体数值：

| 指标 | 目标值 |
|------|--------|
| 插件启动时间 | TODO |
| UI 首次渲染时间 | TODO |
| host 操作响应时间 | TODO |
| 内存占用上限 | TODO |

## 监控与告警

### 关键指标

TODO: 以下监控点待后续正式实现阶段建立：

- 插件加载成功率
- UI 渲染错误率
- host API 调用失败率
- 用户操作完成率

### 日志规范

| 级别 | 使用场景 |
|------|----------|
| `error` | 影响用户操作的异常 |
| `warn` | 可恢复的异常或性能问题 |
| `info` | 关键业务流程节点 |
| `debug` | 开发调试信息 |

## 与共享模块的稳定性关系

`app` 模块的稳定性依赖于共享模块的稳定性：

- `core-engine`：runtime 生命周期管理
- `providers`：provider 调用可靠性
- `workflows`：workflow 执行正确性

当共享模块出现稳定性问题时，`app` 模块应：

1. 正确处理并显示错误
2. 不因共享模块问题导致整体崩溃
3. 提供适当的降级体验
