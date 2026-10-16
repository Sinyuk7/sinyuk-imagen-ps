## ADDED Requirements

### Requirement: Remote output and local asset are separate
系统 MUST 先持久化 provider 返回的远程结果 URL，再执行下载和 AssetStore 物化。正常执行期间 MUST 自动尝试下载；下载失败 MUST 保留远程结果记录，并不得重新生成。`completed` 表示 provider 结果已记录，不保证每个 output 都已有本地 Asset。

#### Scenario: Result URL is recorded before download
- **WHEN** poll 返回成功图片 URL
- **THEN** Task 先写入 remote output record，再开始下载图片

#### Scenario: Normal execution downloads automatically
- **WHEN** poll 返回 provider 成功结果且本地 Task 仍为 `running`
- **THEN** 系统记录 remote outputs 后自动尝试下载每个 URL，并把成功下载的资源写入 AssetStore

#### Scenario: Result URL has expired
- **WHEN** 用户主动置入时下载 URL 返回 403、404 或不可解码内容
- **THEN** 系统保留 Task 历史并显示资源不可用，不自动重新 submit

### Requirement: Restart recovery is lightweight and internal
插件重启后 MUST 读取已有 Task、remote output 和 local Asset 引用，并对有 remote task ID 的持久化 `running` Task 尽力启动一次既有 poll/download 流程。Recovery MUST 不重新 submit、不自动置入、不调用 provider cancel，且启动后的 executor MUST 计入 active slot。系统 MUST 不提供手动 remote status refresh 入口；无 remote ID 的 `submission-unknown` 不自动恢复。用户点击置入时，系统最多针对该 Task 执行一次 remote query 或 URL download 尝试。

#### Scenario: Recovery resumes a known remote task
- **WHEN** 插件启动并读取一个有 remote task ID 的持久化 `running` Task
- **THEN** 系统最多启动一次原 remote task 的 poll/download 流程，继续记录 remote outputs 和 AssetStore 结果，不重新 submit 或置入

#### Scenario: Recovery does not resume unknown submission
- **WHEN** 插件启动并读取没有 remote task ID 的 `submission-unknown` Task
- **THEN** 系统保留 `failed` 历史，不自动 submit、不启动 poll，并保留错误说明

#### Scenario: Recovery failure remains traceable
- **WHEN** Recovery 因 provider running、URL 过期、下载失败或容量不足而结束
- **THEN** 系统保留 Task、remote facts 和最近错误，不创建 pending queue，也不显示手动 refresh 控件

#### Scenario: Local asset already exists
- **WHEN** 用户点击置入且 Task 已有可解析的 StoredAssetRef
- **THEN** 系统跳过 provider 查询和远程下载，直接读取 AssetStore

#### Scenario: Only remote task ID exists at placement time
- **WHEN** 用户点击置入且没有本地 Asset、没有 remote URL、但存在 remote task ID
- **THEN** 系统查询一次原 remote task；如果返回 URL 则记录 URL 并尝试一次下载，否则显示不可用

#### Scenario: No recoverable remote reference
- **WHEN** Task 没有 local Asset、remote URL 或 remote task ID
- **THEN** 系统显示资源不可恢复，并保留原 Task 记录

### Requirement: Outputs are independently actionable
同一 Task 的多个 remote outputs MUST 保持独立的下载和置入可用性。用户 MUST 可以针对单个 output 主动置入；某个 output 的下载或置入失败 MUST NOT 删除或阻止同一 Task 的其他 output。

#### Scenario: Place one of multiple outputs
- **WHEN** 一个 Task 有多个已记录的 remote outputs，用户选择其中一个 output 置入
- **THEN** 系统只解析并置入被选择的 output，不要求其他 output 可下载或可置入

#### Scenario: One output fails independently
- **WHEN** 多个 output 中一个 URL 过期或下载失败
- **THEN** 该 output 保存最近一次失败信息，其他 output 仍可继续下载或置入
