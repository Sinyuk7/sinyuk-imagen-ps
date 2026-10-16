## ADDED Requirements

### Requirement: Batch admission is capacity bounded
Application MUST 在创建任何 child Task 前以原子操作检查并预留整批 active concurrency slots。默认最大并发数 MUST 为 10，配置值 MUST 在 2–100 范围内；容量不足时 MUST 拒绝整批并返回等待提示，不得建立本地 pending queue。Batch 大小 MUST 不超过当前可用槽位。

#### Scenario: Three tasks fit available capacity
- **WHEN** 当前 active 数为 7 且用户提交包含 3 个 child Task 的 batch
- **THEN** 系统一次性接受整批并为 3 个 Task 分配独立 active slots

#### Scenario: One task exceeds capacity
- **WHEN** 当前 active 数已为 10 且用户提交一个新 Task
- **THEN** 系统立即返回“请等待”类错误，不创建 Task 且不调用 provider

#### Scenario: Whole batch exceeds capacity
- **WHEN** 当前 active 数为 8 且用户提交 3 个 child Task
- **THEN** 系统拒绝整个 batch，不出现只提交其中部分 Task 的结果

#### Scenario: Batch is larger than the configured capacity
- **WHEN** maxConcurrency 为 10 且用户一次提交 30 个 child Task
- **THEN** 系统直接拒绝整批，不拆成隐式等待队列

### Requirement: Child tasks are independent
一个 child Task 的 submit、poll、下载或失败 MUST NOT 自动改变同一 batch 中其他 child Task 的状态；batch 汇总状态可以由 child Task 状态即时计算，不要求单独持久化复杂状态机。

#### Scenario: One task fails
- **WHEN** batch 中一个 Task 返回 provider failure
- **THEN** 该 Task 标记为 `failed`，其他 Task 继续运行或完成

#### Scenario: Local cancellation
- **WHEN** 用户取消一个正在执行的 child Task
- **THEN** 该 Task 标记为 `discarded`、释放一个本地 slot，并停止本地 poll/download；服务端 cancel 不被调用

#### Scenario: Local slots do not model provider concurrency
- **WHEN** 用户取消了已提交的远程 Task 并立即提交新的本地 Task
- **THEN** 新 Task 可以占用释放的本地 slot，系统不承诺 provider 端实际并发已下降

#### Scenario: Restarted running history
- **WHEN** 插件重启后读取持久化的 `running` Task
- **THEN** 该历史记录在 Recovery 启动前不占用新会话 active slot；有 remote task ID 的任务最多启动一次 Recovery executor，启动后按普通 active slot 计数

### Requirement: Inputs are shared by durable reference
Batch 中相同 source image 或 Mask MUST 通过共享 AssetStore/cache reference 复用；child Task MUST 只保存引用和必要的 input evidence，不得为每个 Task 复制相同图片字节。

#### Scenario: Three tasks use one source image
- **WHEN** 三个 child Task 都使用同一张 source image
- **THEN** AssetStore 中只保留一份共享资源，三个 Task 引用同一个 StoredAssetRef
