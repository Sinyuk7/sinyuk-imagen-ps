## Context

当前实现里，`submit-job` 与 `retry-job` 在任务进入 terminal state 后都会继续触发 billing 相关副作用，但共用边界不清晰。application 层已有 `noteExactTaskCost` 与 `scheduleProfileBalanceRefresh` 这类 profile 级能力，app 层又在主页面里把 profile billing state 的变化临时解释成某个 round 的结果，形成“命令层触发 + 页面层猜测归因”的混合链路。

这里有两个天然不同的信号源：

1. provider 或 bridge 在任务结果里直接返回 billing cost。
2. profile balance snapshot 在任务前后发生变化，需要额外 refresh 才能观察。

第一类是同步终态事实，第二类是异步推断结果。把这两类都塞进同一个 round footer 逻辑，会把 page-local timing 假设变成业务约束。本次设计只把它们整理成统一反馈入口，不引入新的 durable task billing model。

## Goals / Non-Goals

### Goals

- 抽出 submit 与 retry 共用的 terminal billing feedback 入口。
- 分离“同步 provider cost 反馈”与“异步 manual delta fallback”两条路径。
- 让 billing fallback 只影响 toast 反馈，不影响消息卡片 footer、history、task persistence。
- 明确 fallback 为 best-effort 与 silent failure。

### Non-Goals

- 不在本次变更里给 `TaskRecord` 增加 billing outcome 字段。
- 不在本次变更里自动刷新历史任务列表。
- 不把 profile-level billing state 改造成 task-level durable attribution。
- 不要求所有 provider 立刻返回统一 cost schema；本次只提供“有则优先，无则 fallback”的消费边界。

## Decisions

### 1. Shared application follow-up owns terminal billing trigger

`submit-job` 与 `retry-job` 将复用同一个 terminal billing follow-up 入口。这个入口继续负责当前已有的 billing side effects，并把后续 billing feedback 所需的输入统一整理出来，避免 command 文件继续各自拼接终态逻辑。

### 2. Billing feedback split into primary path and fallback path

统一 feedback 入口后，消费顺序固定为：

```text
terminal task result
  -> if explicit provider cost exists
       -> show immediate billing toast
       -> stop
  -> else
       -> start async profile billing refresh observation
       -> if trustworthy delta appears
            -> show fallback billing toast
       -> else
            -> exit silently
```

这样可以保留未来 provider schema 扩展空间，也避免为了支持 fallback 去阻塞同步结果展示。

### 3. Fallback stays toast-only and non-blocking

manual delta fallback 是独立异步流程，不回写 footer，不修改 history，不要求主页面维护 round 级 billing state。它的唯一职责是：在 provider cost 缺失时，尽量补一个 cost toast。失败、超时、无匹配、接口异常都视为非关键失败，直接丢弃结果。

### 4. Duplicate suppression is part of orchestration contract

一旦 primary path 已经基于 provider cost 显示过 toast，fallback path 必须自动失效，避免双重提示。反过来，如果 fallback 已经成功，后续迟到的重复 observation 也必须被抑制。

### 5. Current profile billing state remains fallback input, not task truth

本次不会把 `ProfileBillingState.lastExactTaskCost` 或 `lastBalanceChange` 升级成 durable task contract。它们仍然只是 fallback 观察输入与 session-level feedback 信号，不能被新设计误用成历史任务或消息卡片的权威成本字段。

## Risks / Trade-offs

- fallback 仍依赖 profile refresh 时序，天然不如 provider cost 稳定；本次接受这个限制，因为 fallback 已经被降级为非关键链路。
- 如果现有 profile billing state 里残留旧值，toast orchestrator 需要显式避免误消费旧结果；这要求实现阶段增加 observation baseline 或 equivalent guard。
- 把 footer 展示从本次变更中拿掉，意味着“看见 cost”先只发生在 toast 上；这是有意收缩范围，用更小代价先解耦链路。

## Migration Plan

无需数据迁移。变更只涉及 runtime orchestration、UI feedback 消费边界与测试。

## Open Questions

- 后续若要支持消息卡片 footer 或历史任务精确 cost，是否应引入 `TaskBillingOutcome` 并挂到 `TaskRecord` 上，作为单独变更处理。
- 若未来 provider contract 标准化 cost 字段，是否应把 fallback 观察逻辑继续保留为兜底，还是只在少数 legacy provider 上启用。
