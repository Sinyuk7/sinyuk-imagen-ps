## ADDED Requirements

### Requirement: ready Profile SHALL 始终拥有至少一个 Model Config
系统 SHALL 只将同时满足 Profile 配置结构合法、lifecycle 为 ready、且拥有至少一个 `UserModelConfig` 的对象视为可用 Profile。连接测试或真实生成成功不得成为该不变量的条件。

#### Scenario: Profile 有合法结构但没有模型
- **WHEN** Profile 没有任何 `UserModelConfig`
- **THEN** 系统 SHALL 将其保留在 setup/cleanup 边界，且 SHALL 不将其作为可用 Profile 公开

#### Scenario: 连接尚未验证
- **WHEN** ready Profile 尚未执行或未通过连接测试
- **THEN** 系统 SHALL 保持其 ready 可见性，但 SHALL 不声明连接或生成已成功

### Requirement: 系统 SHALL 拒绝删除最后一个 Model Config
`deleteUserModelConfig` SHALL 通过 repository 的原子删除边界验证删除后的 owned Model Config 数量。删除最后一个模型 SHALL 返回 validation error，不得删除 repository 数据。

#### Scenario: 删除多个模型中的一个
- **WHEN** ready Profile 拥有两个或更多 Model Config，用户删除其中一个
- **THEN** 系统 SHALL 删除目标模型并保留 Profile ready 状态

#### Scenario: 删除唯一模型
- **WHEN** ready Profile 只拥有一个 Model Config，用户尝试删除它
- **THEN** 系统 SHALL 拒绝操作并提示用户先添加模型或删除整个 Profile

### Requirement: Provider 生成 SHALL 使用显式模型选择
主界面 SHALL 在没有已选择的 configured model 时进入 `select-model` readiness 并禁止发送。Provider admission、connection test 和 Profile test SHALL 从各自调用的显式 `modelId` 解析 `UserModelConfig`，不得以模型列表第一项推断目标。

#### Scenario: UI 没有选择模型
- **WHEN** 选中 ready Profile 但当前 UI state 没有模型 id
- **THEN** Composer SHALL 禁止发送并提示选择模型

#### Scenario: admission 没有模型 id
- **WHEN** Provider generation command 和 running task 都未提供模型 id
- **THEN** Provider admission SHALL 返回 validation error，且 SHALL 不读取模型列表来选择目标

### Requirement: active Profile SHALL 不被编辑保存隐式改变
系统 SHALL 仅在用户显式选择 Profile，或完成新建且当前没有 ready active Profile 时写入 active Profile。编辑 ready Profile 成功后 SHALL 保持已有 active Profile 不变。

#### Scenario: 编辑非 active Profile
- **WHEN** 用户保存非 active 的 ready Profile
- **THEN** 系统 SHALL reload Profile 数据且 SHALL 不改变 active Profile id

#### Scenario: 首个完成的新 Profile
- **WHEN** 新建 Profile 完成且当前没有 ready active Profile
- **THEN** 系统 SHALL 将新 Profile 写为 active Profile

### Requirement: Profile SHALL 不再拥有 enabled 状态
系统 SHALL 移除 `Profile.enabled` 的持久化、保存输入、UI projection、Provider admission 和 readiness 分支。读入端 SHALL 容忍缺少或遗留的 profile-level `enabled`，但不得将其重新持久化或用作运行条件。setup 与 ready 的可见性 SHALL 不依赖 `enabled`；`connection.endpoints[].enabled` SHALL 保持 endpoint failover 语义。

#### Scenario: 保存 ready Profile
- **WHEN** 系统保存或读取 ready Profile
- **THEN** Profile 数据 SHALL 不包含 `enabled` 字段，且调用路径 SHALL 不以该字段拒绝生成

#### Scenario: setup Profile
- **WHEN** 系统需要隔离创建中 Profile
- **THEN** 系统 SHALL 以 lifecycle 而非 `enabled=false` 表达 setup 状态

#### Scenario: endpoint enabled 状态
- **WHEN** 系统移除 profile-level `enabled`
- **THEN** 系统 SHALL 保留 `connection.endpoints[].enabled` 并继续以它判断 endpoint 是否可参与连接选择
