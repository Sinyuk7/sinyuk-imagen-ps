## ADDED Requirements

### Requirement: EventBus 支持订阅 lifecycle 事件
`createJobEventBus()` SHALL 返回一个 event bus 实例，提供 `on(type, handler, filter?)` 注册事件处理器，并返回 `unsubscribe` 函数。

#### Scenario: 订阅 created 事件
- **WHEN** 调用 `const unsub = bus.on('created', handler)`
- **AND** 有 job 进入 `'created'` 状态并 emit 对应事件
- **THEN** `handler` 被调用一次
- **AND** 接收到的 payload 为 `{ type: 'created', job: Job }`

#### Scenario: 订阅 running 事件
- **WHEN** 调用 `bus.on('running', handler)`
- **AND** 有 job 进入 `'running'` 状态并 emit 对应事件
- **THEN** `handler` 被调用一次
- **AND** 接收到的 payload 为 `{ type: 'running', job: Job }`

#### Scenario: 订阅 completed 事件
- **WHEN** 调用 `bus.on('completed', handler)`
- **AND** 有 job 进入 `'completed'` 状态并 emit 对应事件
- **THEN** `handler` 被调用一次
- **AND** 接收到的 payload 为 `{ type: 'completed', job: Job }`

#### Scenario: 订阅 failed 事件
- **WHEN** 调用 `bus.on('failed', handler)`
- **AND** 有 job 进入 `'failed'` 状态并 emit 对应事件
- **THEN** `handler` 被调用一次
- **AND** 接收到的 payload 为 `{ type: 'failed', job: Job }`

### Requirement: EventBus 支持取消订阅
Event bus SHALL 通过 `on` 返回的 `unsubscribe` 函数移除指定处理器。

#### Scenario: 使用 unsubscribe 取消订阅后不再接收事件
- **WHEN** 已注册 `const unsub = bus.on('created', handler)`
- **AND** 调用 `unsub()`
- **AND** 随后有 job 进入 `'created'` 状态
- **THEN** `handler` 不被调用

#### Scenario: off 作为低阶 API 保留
- **WHEN** 已注册 `bus.on('created', handler)`
- **AND** 调用 `bus.off('created', handler)`
- **AND** 随后有 job 进入 `'created'` 状态
- **THEN** `handler` 不被调用

### Requirement: EventBus 支持按 job id 过滤
`on` 方法 SHALL 支持可选的 `filter` 选项，仅当事件关联的 job id 匹配时才触发处理器。

#### Scenario: 过滤特定 job id
- **WHEN** 调用 `bus.on('completed', handler, { jobId: 'abc' })`
- **AND** job `abc` 完成并 emit 事件
- **THEN** `handler` 被调用一次

#### Scenario: 不匹配过滤条件的 job 不触发
- **WHEN** 调用 `bus.on('completed', handler, { jobId: 'abc' })`
- **AND** job `xyz` 完成并 emit 事件
- **THEN** `handler` 不被调用

### Requirement: EventBus 支持一次订阅所有 lifecycle 事件
Event bus SHALL 提供 `onAny(handler)`，注册一个接收所有事件的处理器，并返回 `unsubscribe` 函数。

#### Scenario: 一次订阅接收多种事件
- **WHEN** 调用 `const unsub = bus.onAny(handler)`
- **AND** 先后有 job 进入 `created`、`running`、`completed` 状态并 emit 事件
- **THEN** `handler` 被调用三次
- **AND** 每次接收到的 payload 均包含 `type` 字段标识事件类型

### Requirement: EventBus 的 emit 不暴露为公共 API
Event bus SHALL 将 `emit` 能力限制为内部使用；公共接口仅暴露 `on`、`off`、`onAny` 与返回的 `unsubscribe`。

#### Scenario: 外部无法直接 emit
- **WHEN** 检查 `bus` 的公共类型定义
- **THEN** `emit` 方法不存在于公共接口中

### Requirement: EventBus 的 emit 同步调用且隔离监听器异常
`emit` SHALL 按注册顺序同步调用所有匹配的处理器，但每个处理器单独 try/catch，单个处理器的异常不影响其他处理器，也不污染 engine 主流程。

#### Scenario: 多个监听器同时存在，一个抛出异常
- **WHEN** 已注册两个 `completed` 监听器 `handlerA` 与 `handlerB`
- **AND** `handlerA` 执行时抛出异常
- **AND** job 完成并 emit 事件
- **THEN** `handlerA` 的异常不导致 `handlerB` 被跳过
- **AND** engine 主流程不被中断
