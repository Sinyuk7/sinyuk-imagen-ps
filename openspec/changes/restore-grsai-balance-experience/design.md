## Context

`94fa0972` 删除了通用 billing UI 与 App 公开命令，GRSAI 也被固定保存为 `billing.source = disabled`。当前 GRSAI 仍使用 `apiKey` 通过 `Authorization: Bearer` 调用生成接口，底层 `credits` 响应解析器已经能读取 `code`、`msg`、`data.credits`，但 Provider descriptor、config schema、Provider 实例和 App surface 没有接线。

本变更只恢复 GRSAI。用户配置面保持简单：API Key 继续用于生成，新增可选 Token 用于账户余额查询。UI 统一称为 GRSAI credits 余额，不展示余额来源或账户/Profile 归因。

## Goals / Non-Goals

**Goals:**

- 支持 `POST /client/openapi/getCredits` 与 `POST /client/openapi/getAPIKeyCredits`。
- 当 Token 非空时使用 `/getCredits`；Token 为空时使用 API Key 调用 `/getAPIKeyCredits`。
- 在 GRSAI 设置页显示余额、检查时间和一个 `Refresh` 按钮。
- 在首页当前选中的 GRSAI Profile 显示余额，并在切换 Profile 时隔离状态。
- 在任务终态后非阻塞刷新余额，提供中性的余额变化反馈。
- 余额查询失败、冷却或刷新异常不得改变生成任务结果。
- 凭据只通过 `SecretStorageAdapter` 保存，运行时状态不落盘。

**Non-Goals:**

- 不恢复其他 Provider 的通用 billing 配置器。
- 不增加余额来源切换器、独立账户模式、endpoint/path/header 编辑器或额外查询按钮。
- 不把 Token 替代 API Key 作为 GRSAI 生成凭据。
- 不声称余额差值就是精确任务费用，也不在 UI 中区分账户级与 APIKey 级余额。

## Decisions

### 1. Provider-owned 固定余额策略

GRSAI descriptor 声明余额能力，Provider 内部固定两个 root-relative path、POST method、JSON body 和 `credits` parser。App 只能看到读取/刷新状态，不能编辑 wire 协议。

备选方案：恢复旧的通用 billing editor。放弃原因：会重新暴露 path、protocol、auth 等 transport 细节，违背当前专用 Profile 架构。

### 2. Token 优先，按凭据存在性选择

Token 非空时发送 `{ token }` 到 `/client/openapi/getCredits`；只有 Token 为空才发送 `{ apiKey }` 到 `/client/openapi/getAPIKeyCredits`。Token 查询失败不隐式切换 API Key，避免一次刷新产生两个来源不同的结果。

UI 字段名为 `Token`，内部 secret 名称使用 `billingToken` 与现有 SecretStorage/billing token 约定兼容。API Key 仍使用现有 `secretRefs.apiKey`。

备选方案：接口失败后自动 fallback。放弃原因：错误、限流和权限问题会触发额外请求，用户无法判断实际使用了哪种凭据。

### 3. 统一余额视图，内部按 Profile 隔离缓存

余额快照继续使用 `ProfileBillingState`，按 `profileId + credential fingerprint` 去重和缓存。UI 文案只显示 `GRSAI credits`；Profile ID 仅用于切换时清空旧状态、避免串显，不代表产品需要解释余额归因。

备选方案：全局单例账户余额。放弃原因：多个 GRSAI Profile 可能拥有不同 API Key/Token，全局状态会在切换后显示错误余额。

### 4. 非阻塞刷新与中性变化反馈

设置页首次进入和手动 `Refresh` 查询余额；任务成功或失败进入终态后安排后台刷新。查询失败保留 last-known snapshot 并标记 stale/error，不阻塞任务。若存在可靠前后快照，反馈格式为 `余额变化 -N credits`；无基线、并发或刷新失败时不生成误导性费用提示。

### 5. 迟到响应与错误隔离

刷新结果写回前验证 Profile 仍存在且 credential fingerprint 未变化；删除或编辑期间的迟到响应不得复活 Profile、覆盖新配置或写入旧缓存。HTTP status、`code` 和 parser 错误保持结构化，错误正文必须截断/脱敏后才能进入日志或 UI。

## Risks / Trade-offs

- [账户 Token 余额可能跨多个 API Key 共享] → UI 统一显示 credits，不做任务归因；内部仅按当前 Profile 管理刷新生命周期。
- [Token/API Key 同时存在时用户可能不知道实际查询凭据] → 设置页不增加模式切换器，固定展示“Token 优先”说明。
- [GRSAI 接口限流或暂时不可用] → 保留 last-known 值、标记 stale、采用 cooldown；不影响生成。
- [任务后余额变化受服务端结算延迟影响] → 仅显示观察到的余额变化，不命名为精确任务费用。
- [现有 billing core 的迟到保存逻辑可能覆盖新 Profile] → GRSAI 固定协议不持久化 `lastSuccessfulProtocolId`；刷新写回执行存在性与 fingerprint 检查。
- [旧测试断言余额不存在] → 在 contract/UI harness 中替换为 GRSAI 余额行为断言，其他 Provider 测试保持不变。

## Migration Plan

1. 为 GRSAI schema、descriptor、Provider 和 Application resolver 增加固定余额能力。
2. GRSAI 专用保存流程继续保留现有 API Key，并新增 Token 的 secret upsert/remove 语义；旧 Profile 无 Token 时自动走 API Key 查询，不需要用户迁移。
3. 重新公开只读/刷新命令到 `CommandsPort`，接入设置页、首页 Composer footer 和任务终态 follow-up。
4. 先运行 provider/application deterministic tests 与 App UI harness，再执行 `pnpm release:verify`。
5. 回滚时可移除 UI/命令接线；已保存 Token secret 不应明文暴露，删除功能由 Profile 删除流程统一清理其 secret refs。

## Open Questions

无阻塞问题。请求 body 按本变更契约固定为 `{ token }` 与 `{ apiKey }`，响应固定读取 `data.credits`；若服务端后续变更，应新增协议版本而不是修改现有语义。
