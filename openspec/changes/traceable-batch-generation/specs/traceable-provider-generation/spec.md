## ADDED Requirements

### Requirement: Provider execution facts are durable
每个 provider child Task MUST 在 submit、poll 和结果解析边界保存 secret-free 的执行事实，包括 providerId、modelId、remote task ID（如果收到）、最近 remoteStatus、时间戳、结果索引和结果 URL。保存结果 URL 后，后续下载失败 MUST NOT 删除该记录。

#### Scenario: Submit accepted
- **WHEN** GRSAI 或 RunningHub submit 返回远程任务 ID
- **THEN** 系统立即将 remote task ID 和 provider response 摘要写入对应 child Task，再继续 poll

#### Scenario: Submit response is lost
- **WHEN** submit 请求超时或连接中断且没有收到 remote task ID
- **THEN** 系统将 child Task 标记为 `failed` 并记录 `submission-unknown`，且不得自动再次 submit

#### Scenario: Remote result contains multiple URLs
- **WHEN** poll 返回 `results[]` 中的多个图片 URL
- **THEN** 系统按稳定结果索引逐项记录 URL 和 provider metadata，不假定只有一张图片；UI 可按 output 单独展示和置入

### Requirement: Provider protocol stays fixed and bounded
Provider adapter MUST 使用 GRSAI `/v1/api/generate` 与 `/v1/api/result`，以及 RunningHub Standard Model `/openapi/v2/...`、`/openapi/v2/query` 和 `/openapi/v2/media/upload/binary`；adapter MUST NOT 自动切换到传统 RunningHub `/task/openapi/...` 或重试付费 submit。

#### Scenario: RunningHub request construction
- **WHEN** child Task 使用 RunningHub model catalog entry
- **THEN** adapter 使用 entry endpoint、`imageUrls`、必要的 `maskUrl` 和 catalog parameters 构造 Standard Model 请求

#### Scenario: Poll timeout
- **WHEN** 已知 remote task ID 的 poll 请求超时
- **THEN** 系统保留同一 remote task ID 并允许后续继续查询，不重新 submit

#### Scenario: RunningHub upload is reused within an active batch
- **WHEN** 同一 active batch 的多个 child Task 使用相同输入内容
- **THEN** adapter 可以复用同一个 in-memory upload promise/URL，但不得把临时 upload URL 当作长期 Task resource 或跨重启恢复依据

### Requirement: Submission uncertainty is explained without retry
submit 超时且没有 remote task ID 时，Task MUST 使用 `failed` 公共状态并保存 `submission-unknown`；UI MUST 明确提示服务端可能已经创建任务，系统不会自动重试，且该 Task 不支持 remote refresh。

#### Scenario: Unknown submit result
- **WHEN** submit 请求超时且客户端没有收到 provider task ID
- **THEN** Task 显示提交结果未知的解释，不被误导为已确认的 provider generation failure

#### Scenario: Cancellation races with submit response
- **WHEN** 用户取消本地 Task 后迟到的 submit response 携带 remote task ID
- **THEN** 系统可以把 remote task ID 写入 `discarded` Task，但不得继续 poll 或 download
