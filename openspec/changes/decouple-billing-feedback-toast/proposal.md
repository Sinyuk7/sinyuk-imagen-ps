## Why

当前 billing 反馈链路混合了两类不同事实：一类是 provider 或中转接口原始返回里的 cost，另一类是 profile 级 billing snapshot 前后差值。前者可以在任务终态同步获得，后者只能在任务结束后异步观察。现在主页面把 profile 级差值临时绑到 round footer，依赖页面本地时序猜测，导致 submit/retry 终态重复接线、成功与失败行为不一致、刷新慢时表现脆弱。

本次变更不解决 task 级 durable billing 归因，也不改消息卡片 footer 或历史记录模型。本次只先做两个收敛：把终态 billing follow-up 抽成公共链路；把“手动计算 cost”降级为 toast-only、best-effort、静默失败的补充反馈。

## What Changes

- 抽出 submit/retry 共用的 terminal billing follow-up 入口，统一处理任务终态后的 billing 相关副作用与反馈触发。
- 明确两段式 billing feedback：
  - 优先使用 provider 或中转返回的显式 cost，任务终态即可直接显示 toast。
  - 仅当显式 cost 缺失时，异步触发 profile billing refresh 观察，尝试用前后差值补一个 toast。
- 将现有页面里的 round footer 绑定逻辑与 billing toast 反馈逻辑拆开；本次变更只保留 toast 反馈，不把 fallback 结果写入 footer、history 或 durable task record。
- 规定 fallback 失败、超时、无匹配差值、接口调用失败都属于非关键失败：不影响任务结果，不显示错误提示，不额外污染 UI。

## Capabilities

### New Capability: `billing-feedback-toast`

为任务终态提供统一的 billing toast 反馈能力，覆盖同步 cost 展示与异步 fallback 展示两条路径。

- 定义 provider cost 优先、manual delta fallback 次之的反馈顺序。
- 定义 fallback 为异步、best-effort、可静默失败的非关键链路。
- 限定本次变更不把 fallback 结果推广为 footer、history 或 task-level durable billing contract。

## Impact

- 影响 `packages/application` 里的 terminal task command follow-up 组织方式，尤其是 `submit-job` 与 `retry-job` 的 billing side effect 共用入口。
- 影响 `apps/app` 里的 billing feedback 消费边界，重点是把页面本地 round/footer 耦合改成 toast-oriented 消费。
- 需要补充 application 与 app surface 的 targeted tests，覆盖同步 cost、异步 fallback、重复抑制、静默失败。
- 不涉及持久化 schema 迁移，不改变 release artifact contract，不要求历史任务列表自动刷新。
