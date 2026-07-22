## ADDED Requirements

### Requirement: 新建 Profile SHALL 以首个模型完成作为成功边界
系统 SHALL 将新建 Profile 的主操作呈现为 `Continue`。Continue SHALL 仅在 Profile 配置结构通过保存校验时写入内部 setup Profile；setup Profile 在拥有至少一个 `UserModelConfig` 前不得被报告为创建成功。

#### Scenario: 合法新 Profile 没有模型 hint
- **WHEN** 用户 Continue 一个已确定 `apiFormat` 且通过配置校验、但没有 owned Model Config 和 endpoint model hint 的新 Profile
- **THEN** 系统 SHALL 保存 setup Profile 并导航到该 Profile 的 Profile Models 页面

#### Scenario: 未知 endpoint model hint
- **WHEN** 用户 Continue 的 endpoint 提供兼容 `apiFormat` 的 `wireModelId`，但该 ID 没有 owned config 且不与 Official Catalog 精确匹配
- **THEN** 系统 SHALL 导航到 Model Configuration 页面，并传递 Profile id、`apiFormat` 和预填的 `wireModelId`

#### Scenario: 精确官方模型 hint
- **WHEN** 用户 Continue 的 `wireModelId` 与兼容 `apiFormat` 的 Official Catalog model ID 精确匹配，且其 request strategy 可确定
- **THEN** 系统 SHALL 创建对应 `UserModelConfig`、将 Profile 提升为 ready，并报告创建完成

### Requirement: setup Profile SHALL 与产品可见性隔离
系统 SHALL 只在创建流程内部通过 Profile id 读取 setup Profile。公开 Profile 列表、主界面 Provider selector、active Profile 恢复和创建成功提示 SHALL 排除 setup Profile。

#### Scenario: Continue 后尚未保存首个模型
- **WHEN** 用户已 Continue 新 Profile 但尚未完成 Model Configuration
- **THEN** 该 Profile SHALL 不出现在 Provider 列表或主界面 selector，且 SHALL 不成为 active Profile

#### Scenario: 首个模型保存完成
- **WHEN** setup Profile 的首个 `UserModelConfig` 成功保存
- **THEN** 系统 SHALL 将 Profile 提升为 ready，使其出现在公开列表并结束创建流程

### Requirement: setup 退出 SHALL 清理创建中数据
系统 SHALL 在用户取消、从创建路由返回或启动恢复发现遗留 setup Profile 时，删除该 setup Profile、关联 Model Config 与 secrets。该清理 SHALL 不影响 ready Profile。

#### Scenario: 用户取消模型配置
- **WHEN** 用户在 setup Profile 的 Profile Models 或 Model Configuration 页面取消创建
- **THEN** 系统 SHALL 删除 setup Profile 及其关联 secrets，且 SHALL 不留下公开 Profile

#### Scenario: promotion 前异常中断
- **WHEN** 首个 Model Config 已写入但 setup Profile 尚未提升为 ready 时应用中断
- **THEN** 下次启动 SHALL 清理或安全完成该 setup Profile，且在处理完成前 SHALL 不将其公开

### Requirement: 编辑 ready Profile SHALL 保持保存语义
系统 SHALL 将 ready Profile 详情页的主要操作维持为 `Save` 与 `Delete`。保存 SHALL 仅提交合法 Profile 配置；endpoint model hint 在编辑时只能作为新增模型的预填上下文，不得强制进入创建路由。

#### Scenario: 编辑 Profile 的连接配置
- **WHEN** 用户保存拥有至少一个 Model Config 的 ready Profile
- **THEN** 系统 SHALL 保存通过校验的连接配置并返回设置流程，不要求重新配置模型

#### Scenario: 编辑输入非法配置
- **WHEN** 用户保存未通过 Profile 配置校验的 ready Profile
- **THEN** 系统 SHALL 返回校验错误且 SHALL 不写入该次非法配置
