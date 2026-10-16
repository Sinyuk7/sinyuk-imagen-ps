## ADDED Requirements

### Requirement: Public lifecycle has minimal states
统一图片生成 Task 的公共状态 MUST 仅包含 `running`、`completed`、`failed` 和 `discarded`。`completed` MUST 表示 provider 成功结果已经完整记录，不等于输出已有本地 Asset 或一定可置入。Provider-specific status MUST 作为 remoteStatus 或 diagnostics 保存，不得成为公共状态枚举。

#### Scenario: Provider reports queued state
- **WHEN** RunningHub 返回 `QUEUED` 或 GRSAI 返回 `pending`
- **THEN** Task 公共状态保持 `running`，并保存原始 remoteStatus

#### Scenario: Provider completes before local download
- **WHEN** provider 返回成功 URL 但本地下载尚未完成
- **THEN** Task 仍可保存远程结果事实；下载错误不得伪装为 provider generation failure

#### Scenario: Download fails after provider success
- **WHEN** provider 已返回成功结果但某个 URL 下载失败
- **THEN** Task 公共状态仍可为 `completed`，该 output 保存最近一次下载失败，用户之后可手动尝试置入或重新下载一次

### Requirement: Generation request does not expose protocol fields
公共 GenerationRequest MUST 不包含 provider endpoint、replyType、上传 URL、轮询 token 或 raw response；这些字段只由 adapter 和 remote result record 管理。

#### Scenario: GRSAI request
- **WHEN** Application 提交 GRSAI GenerationRequest
- **THEN** adapter 内部添加 `replyType: "async"`，公共请求保持 provider-neutral

#### Scenario: RunningHub upload
- **WHEN** Application 提交带 source image 的 RunningHub GenerationRequest
- **THEN** adapter 负责上传并生成 `imageUrls`，公共请求不保存临时 upload URL
