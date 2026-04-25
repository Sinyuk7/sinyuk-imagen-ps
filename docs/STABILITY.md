# 稳定性规范

## 稳定性要求

### 质量红线

| 指标 | 要求 |
|------|------|
| 崩溃率 | TODO: 待定义 |
| 成功率 | TODO: 待定义 |
| P99 响应时间 | TODO: 待定义 |

> 当前项目处于早期阶段，具体数值待后续定义。

## 异常处理策略

### 错误分类

本项目采用统一的错误分类体系（定义于 `core-engine`）：

| 错误类型 | 说明 | 是否可重试 |
|----------|------|------------|
| `ValidationError` | 输入校验失败 | 否 |
| `ProviderError` | provider 调用失败 | 视具体错误 |
| `NetworkError` | 网络请求失败 | 是 |
| `TimeoutError` | 请求超时 | 是 |
| `InternalError` | 内部错误 | 否 |

### 关键路径错误捕获

1. **runtime 层**：捕获 workflow 执行异常，更新 job 状态为 `failed`
2. **provider 层**：捕获 API 调用异常，归一化为标准错误结构
3. **app 层**：捕获未处理异常，显示用户友好提示

### 错误传播规则

- 底层错误向上传播时保留原始信息
- 不吞掉异常，不静默失败
- 用户可见的错误信息必须包含下一步操作建议

## 兜底策略

### provider 调用失败

| 场景 | 兜底行为 |
|------|----------|
| 网络超时 | 支持用户手动重试 |
| API 返回错误 | 显示错误原因，支持重试 |
| provider 不可用 | 提示检查配置或切换 provider |

### runtime 异常

| 场景 | 兜底行为 |
|------|----------|
| workflow 执行失败 | job 状态标记为 `failed`，记录错误详情 |
| 状态存储异常 | TODO: 待定义 |

### 当前阶段限制

- `v1` 不支持 job cancel / abandon
- 不支持 durable job history
- 不支持多任务队列和后台恢复

## 性能基线

| 指标 | 基线值 |
|------|--------|
| runtime 初始化时间 | TODO: 待测量 |
| job 状态更新延迟 | TODO: 待测量 |
| provider 调用超时 | TODO: 待定义 |

## 兼容性要求

### Node.js

- 最低版本：18.x

### 浏览器 / UXP

- TODO: 待定义具体兼容性要求

### Photoshop

- TODO: 待定义支持的 Photoshop 版本范围

## 不变式守卫

`core-engine` 提供以下边界守卫：

### assertSerializable

确保数据结构可序列化，用于跨边界传输的数据校验。

### deepFreeze

冻结对象防止意外修改，用于 immutable 语义的强制保证。

## 监控与告警

TODO: 当前阶段暂无监控系统，待后续补充。
