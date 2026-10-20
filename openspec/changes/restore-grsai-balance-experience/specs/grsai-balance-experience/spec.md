## ADDED Requirements

### Requirement: GRSAI 余额凭据与接口选择

系统 SHALL 支持 GRSAI Profile 保存可选 `Token` secret；API Key SHALL 继续作为 GRSAI 生成所需 secret。余额刷新时，Token 非空 MUST 调用 `POST /client/openapi/getCredits` 并发送 JSON `{ token }`；Token 为空时 MUST 调用 `POST /client/openapi/getAPIKeyCredits` 并发送 JSON `{ apiKey }`。系统 MUST 不添加额外 header，也 MUST 不在接口失败后隐式切换另一凭据。

#### Scenario: Token 存在时查询账户 credits

- **WHEN** 当前 GRSAI Profile 同时保存 API Key 和 Token，用户进入设置页或触发刷新
- **THEN** 系统向 `/client/openapi/getCredits` 发送 POST JSON `{ token }`，不调用 `/getAPIKeyCredits`

#### Scenario: Token 缺失时查询 APIKey credits

- **WHEN** 当前 GRSAI Profile 没有 Token 但有 API Key
- **THEN** 系统向 `/client/openapi/getAPIKeyCredits` 发送 POST JSON `{ apiKey }`

#### Scenario: Token 查询失败不切换凭据

- **WHEN** Token 查询返回 HTTP 错误、非零 `code` 或无效响应
- **THEN** 本次刷新标记为失败并保留旧状态，不额外调用 API Key 余额接口

### Requirement: GRSAI credits 响应解析

系统 SHALL 将 JSON 响应中的 `data.credits` 解析为 credits 余额。响应 `code` 为非零数字、缺少 `data.credits`、credits 非有限值或响应不是 JSON 对象时 MUST 视为余额查询失败。

#### Scenario: 成功解析 credits

- **WHEN** 接口返回 `{ "code": 0, "msg": "success", "data": { "credits": 10000 } }`
- **THEN** 系统生成 remaining 为 `10000`、unit 为 `credits` 的余额快照

#### Scenario: 非零 code 被拒绝

- **WHEN** 接口返回 `code` 非零
- **THEN** 系统将 `msg` 作为查询错误信息的一部分并标记刷新失败

### Requirement: GRSAI 设置页余额体验

GRSAI Profile 设置页 SHALL 在现有 API Key 输入旁提供 Token SecretField，并展示只读余额、检查时间及 stale/error/loading 状态。页面 MUST 提供一个 `Refresh` 按钮；不得提供余额来源切换器、独立 Token/APIKey 查询按钮或 transport 配置编辑器。

#### Scenario: 设置页展示余额

- **WHEN** 当前 Profile 已成功查询余额
- **THEN** 页面显示统一的 GRSAI credits 数值与最近检查时间

#### Scenario: 手动刷新

- **WHEN** 用户点击 `Refresh`
- **THEN** 页面显示 loading 状态并更新为最新快照或 stale/error 状态，生成配置和其他页面不受影响

### Requirement: 首页当前 Profile 余额

首页 SHALL 在当前选中的 GRSAI Profile Composer footer 显示统一的 credits 余额。切换 Profile 时 MUST 清除旧 Profile 的可见余额或标记为 loading，直到新 Profile 状态可用；非 GRSAI Profile 不得显示 GRSAI 余额。

#### Scenario: 当前 GRSAI Profile 显示余额

- **WHEN** 当前选中 GRSAI Profile 存在余额快照
- **THEN** Composer footer 显示该 Profile 的 credits 数值和必要的 stale/检查时间提示

#### Scenario: 切换 Profile 隔离状态

- **WHEN** 用户从一个 GRSAI Profile 切换到另一个 Profile
- **THEN** 页面不继续显示前一 Profile 的余额，并为新 Profile 加载独立状态

### Requirement: 任务终态后的非阻塞余额反馈

系统 SHALL 在 GRSAI 任务成功或失败进入终态后安排非阻塞余额刷新。余额查询或反馈失败 MUST NOT 改变任务状态。存在可靠前后快照时，系统 MAY 显示中性 `余额变化 -N credits`；不得将余额差值标记为精确任务费用或账户归因。

#### Scenario: 任务完成后刷新余额

- **WHEN** GRSAI 任务进入 completed 或 failed 终态
- **THEN** 系统在后台安排余额刷新，任务结果先按原流程完成

#### Scenario: 余额变化反馈

- **WHEN** 刷新前后快照可比较且余额减少
- **THEN** 系统显示 `余额变化 -N credits`，不写入“本次任务费用”或“消耗账户余额”

#### Scenario: 刷新失败不影响任务

- **WHEN** 终态后的余额刷新失败或被 cooldown 跳过
- **THEN** 任务仍保持原 completed/failed 状态，旧余额可保留并标记 stale

### Requirement: 余额查询安全与生命周期隔离

系统 SHALL 仅通过 `SecretStorageAdapter` 读取 API Key/Token，禁止将 secret 值写入 Profile config 或余额 UI。刷新结果写回前 MUST 确认 Profile 仍存在且 credential fingerprint 未变化；HTTP 错误正文进入日志或 UI 前 MUST 截断并脱敏。

#### Scenario: 查询期间编辑 Profile

- **WHEN** 用户在余额请求进行期间替换 API Key 或 Token
- **THEN** 旧请求结果不得覆盖新配置对应的余额状态

#### Scenario: 查询期间删除 Profile

- **WHEN** 用户在余额请求进行期间删除 Profile
- **THEN** 旧请求结果不得重新创建 Profile、写回 Profile 配置或重新显示余额

#### Scenario: secret 不出现在持久化配置

- **WHEN** 用户保存 Token 或 API Key
- **THEN** repository 只保存 secret refs，Provider config 与设置页回显不得包含 secret 明文

### Requirement: Provider task-usage history and feedback

系统 SHALL 将 Provider 提供的任务消耗归一化为 bounded structured metrics，并持久化到终态 Task。UI SHALL 在任务本次从非终态变为 completed 时本地化这些 metrics，并通过单一可替换 toast 展示最新一条消耗反馈；历史 Task 初次加载不得重新弹 toast。缺少消耗数据时不得显示占位或错误 toast。

GRSAI SHALL 使用同一账号的余额快照差值作为“观察到的余额变化”，不得称为精确任务费用。仅当前后查询成功、刷新串行且无并发生成歧义时才记录该 metric；首次任务或不可靠比较只更新余额快照，不生成差值。

后台余额刷新失败 MUST 静默处理，且 MUST NOT 改变 Job/Task 终态。

#### Scenario: RunningHub 返回任务 usage
- **WHEN** 成功的 RunningHub task query 包含有效 `usage.consumeCoins` 或费用字段
- **THEN** Provider 将受支持字段归一化并写入 Task usage，UI 展示本地化的最新消耗 toast

#### Scenario: GRSAI 首次任务建立余额基线
- **WHEN** GRSAI 任务结束前没有同一账号可比较的成功余额快照
- **THEN** 系统刷新并保存快照，但不显示任务消耗差值

#### Scenario: 并发或失败的 GRSAI 刷新
- **WHEN** 同一账号存在并发任务歧义或余额刷新失败
- **THEN** 不记录差值、不显示错误 toast，任务终态保持不变
