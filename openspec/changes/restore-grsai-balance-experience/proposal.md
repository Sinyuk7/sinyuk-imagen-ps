## Why

提交 `94fa0972` 在收敛 Provider Profile 配置面时删除了余额查询、设置页余额、首页余额和任务后的余额反馈，导致 GRSAI 用户无法查看自己可用的 credits。GRSAI 已提供稳定的 API Key 与账户余额接口，应恢复余额体验，但保持 Provider-owned 配置边界，不重新开放通用 billing 编辑器。

## What Changes

- 恢复 GRSAI Profile 的余额查询能力。
- 在 GRSAI Profile 页面新增可选的 `Token` SecretField；保留现有 `API Key` 输入用于生成任务。
- 余额凭据选择固定为：有 `Token` 时调用 `/client/openapi/getCredits`，否则使用 `API Key` 调用 `/client/openapi/getAPIKeyCredits`。
- 两个接口统一解析 `data.credits`，统一展示为 GRSAI credits 余额。
- 在 GRSAI 设置页展示余额、检查时间、加载/过期/错误状态，并提供一个 `Refresh` 按钮。
- 在首页当前选中的 GRSAI Profile 上显示余额；切换 Profile 时隔离并刷新余额状态。
- 恢复任务终态后的非阻塞余额刷新与中性余额变化反馈，不声明精确任务费用或账户归因。
- 余额查询失败不得影响生成任务、任务状态或 Provider 健康状态。
- 仅修改 GRSAI；不恢复其他 Provider 的通用 billing UI 或配置编辑器。

## Capabilities

### New Capabilities

- `grsai-balance-experience`: GRSAI Token/API Key 余额查询、设置页与首页展示、刷新状态、任务后余额反馈及错误隔离。

### Modified Capabilities

无。当前仓库没有可复用的根级 `openspec/specs/` capability；本变更以新 capability 建立契约。

## Impact

- `packages/providers`：GRSAI config schema、descriptor、Provider balance query 接口，以及现有 credits response parser 的接线。
- `packages/application`：Profile secret resolution、余额查询/缓存/刷新命令、任务终态 follow-up、`CommandsPort` 公开面。
- `apps/app`：GRSAI Profile 表单、设置页余额卡、首页 Composer footer、i18n、状态映射与 UI harness/tests。
- OpenSpec：新增 `grsai-balance-experience` capability spec、设计和任务清单；更新当前反向断言“余额不存在”的测试。
- 外部 API：`POST /client/openapi/getCredits` 与 `POST /client/openapi/getAPIKeyCredits`，无额外 header，读取响应 `data.credits`。
