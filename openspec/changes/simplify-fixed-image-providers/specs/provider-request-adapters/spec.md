## ADDED Requirements

### Requirement: Provider 专属请求构建
每个 provider adapter MUST 将公共生成请求转换为自己的请求 payload；公共请求 MUST 不包含 provider wire 字段。

#### Scenario: GRSAI 生成请求
- **WHEN** 选择 GRSAI 模型并提交生成
- **THEN** adapter 发送模型、prompt、输入图片、声明参数和 `replyType: "async"`

#### Scenario: RunningHub 生成请求
- **WHEN** 选择 RunningHub 模型并提交生成
- **THEN** adapter 按 catalog 模型选择 endpoint，完成输入图片上传并发送 RunningHub 所需字段

### Requirement: 异步提交一次
系统 MUST 对一次逻辑 Job 只提交一次 provider 付费生成请求；提交结果不明确时 MUST 停止自动重提交并报告可恢复错误。

#### Scenario: 轮询异步任务
- **WHEN** provider 返回远程任务 ID
- **THEN** Application 负责调度后续 poll，adapter 只查询该远程任务并返回 pending/completed/failed

### Requirement: 统一 provider result
Provider adapter MUST 将成功响应归一化为统一图片 Asset 结果，并隐藏 provider-specific response shape。

#### Scenario: 成功返回图片
- **WHEN** GRSAI 或 RunningHub 返回可下载图片
- **THEN** adapter 返回统一 assets 列表、实际图片 metadata 和可选 diagnostics
