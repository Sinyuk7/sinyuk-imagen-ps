## 1. Provider 余额契约

- [x] 1.1 扩展 `packages/providers/src/contract` 的余额 capability 类型，使 Provider 可声明固定的 GRSAI credits 查询能力。
- [x] 1.2 为 `packages/providers/src/providers/grsai/config-schema.ts` 接入可选 billing 配置/运行时凭据，保持 API Key 为生成必需项，并拒绝用户自定义 transport 字段。
- [x] 1.3 在 `packages/providers/src/providers/grsai/descriptor.ts` 声明 GRSAI 余额 capability，固定 `/client/openapi/getCredits` 与 `/client/openapi/getAPIKeyCredits` 的 method、body、parser 和 credits unit。
- [x] 1.4 在 `packages/providers/src/providers/grsai/provider.ts` 或共享 billing adapter 中实现 Token 优先、API Key 备用的余额查询入口，不添加额外 header，不做失败后的隐式 fallback。
- [x] 1.5 为两个 GRSAI endpoint、`code`/`msg`/`data.credits`、缺字段、非有限值和 HTTP 错误补充 provider contract tests。

## 2. Secret 与 Application 命令

- [x] 2.1 扩展 GRSAI Profile 保存输入，支持 Token 的 write-only secret upsert/remove；Token 内部 secret 名称使用 `billingToken`，不得写入 profile config 明文。
- [x] 2.2 更新 `packages/application/src/runtime.ts` 和 Profile resolver，使 GRSAI 运行时能解析 API Key 与 Token，并保持旧 Profile 无 Token 时的 API Key 查询兼容。
- [x] 2.3 恢复并收敛 `profile-billing` 查询、缓存、去重和 cooldown 逻辑到 GRSAI capability；成功查询不得依赖通用 billing editor。
- [x] 2.4 修复刷新生命周期：Profile 编辑/删除或凭据 fingerprint 变化后，迟到响应不得覆盖新状态、复活 Profile 或持久化旧配置；GRSAI 固定协议不持久化不必要的 protocol hint。
- [x] 2.5 将 `getProfileBillingState` 与 `refreshProfileBalance` 以只读/刷新命令重新导出，并加入 `apps/app/src/shared/ports/commands-port.ts` 与 adapter。
- [x] 2.6 确保余额刷新和 `noteProfileTaskBilling` 错误与任务状态隔离；exact-cost 记录失败不得阻塞终态余额刷新。
- [x] 2.7 为 secret resolution、Token 优先级、去重、cooldown、stale/error、迟到响应和任务终态 follow-up 增加 deterministic application tests。

## 3. GRSAI 设置页

- [x] 3.1 扩展 GRSAI 专用表单，新增 Token `SecretField`，保留 API Key 生成凭据和现有保存/删除行为。
- [x] 3.2 在 GRSAI Profile 设置页增加只读余额卡，展示 credits、检查时间、loading、stale、error 状态及一个 `Refresh` 按钮。
- [x] 3.3 接入 i18n、状态映射和无 secret 回显逻辑；不增加余额来源切换、独立查询按钮或 endpoint/header 编辑器。
- [x] 3.4 更新 GRSAI Profile UI tests，覆盖 Token 保存/移除、API Key-only 查询、Token 优先查询、刷新成功与失败状态。

## 4. 首页与任务反馈

- [x] 4.1 在 `apps/app/src/shared/ui/pages/main-page.tsx` Composer footer 接入当前 GRSAI Profile 的余额状态；切换 Profile 时清除旧余额或显示 loading，非 GRSAI 不显示 GRSAI credits。
- [x] 4.2 恢复任务成功/失败终态后的非阻塞余额刷新，避免余额请求影响生成结果和任务历史持久化。
- [x] 4.3 使用中性 `余额变化 -N credits` 反馈；无 baseline、并发不可靠或刷新失败时不显示误导性费用提示，不声明账户归因。
- [x] 4.4 更新首页、Profile 切换、Composer footer 和任务反馈 UI harness/tests，替换当前“余额不存在”的反向断言。

## 5. 验证与发布门禁

- [x] 5.1 运行 providers/application/App deterministic tests 与 fake/contract harness，确认两个 endpoint 的精确 URL、method、body 和 response parser。
- [x] 5.2 验证 HTTP 401/403/429、非零 `code`、stale 保留、cooldown、取消请求和 Profile 删除/编辑竞态。
- [x] 5.3 运行 `pnpm release:verify`，确认 Chrome harness 与 Photoshop UXP 共享逻辑通过构建和测试；不自动执行真实 Photoshop/UXP UI 验收。
- [x] 5.4 复核 OpenSpec requirements 与反向测试均已更新，确认本变更未修改其他 Provider 的 billing 行为。

## 6. Provider task-usage feedback

- [x] 6.1 Add a bounded structured task-usage contract shared by Provider results, Task history, and UI formatting.
- [x] 6.2 Implement GRSAI before/after balance comparison; suppress attribution when tasks overlap and persist only reliable observed deltas to the terminal Task.
- [x] 6.3 Normalize RunningHub successful-task `usage.consumeCoins`, `consumeMoney`, and `thirdPartyConsumeMoney` into structured metrics; ignore unsupported and invalid values.
- [x] 6.4 Persist provider metrics on the terminal Task and show a localized toast only when a task newly completes; reuse one toast key so the latest feedback replaces prior feedback.
- [x] 6.5 Keep background balance reads silent and verify they do not affect terminal generation results.
- [x] 6.6 Add deterministic lifecycle coverage for GRSAI baseline, concurrency suppression, transient poll retry, and balance-read failures.
