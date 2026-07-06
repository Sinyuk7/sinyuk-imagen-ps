## ADDED Requirements

### Requirement: Provider connection test SHALL use safe non-generation verification
系统 SHALL 将 `测试连接` 定义为一次不生成图片、不隐藏消费的 provider 连接验证流程。该流程必须先完成本地配置校验，再调用 provider 可选 `safeProbe`，并由 application 公共层统一归一化结果。

#### Scenario: Local validation fails before network request
- **WHEN** profile 缺少必要字段，例如无效 base URL、缺失路径模板或缺失连接测试所需的关键输入
- **THEN** 系统 SHALL 返回 `failed`
- **THEN** 系统 SHALL 不发送任何网络请求

#### Scenario: Safe probe succeeds
- **WHEN** provider `safeProbe` 返回成功响应
- **THEN** 系统 SHALL 返回 `verified`
- **THEN** 结果语义 SHALL 表示该 profile 已通过无生成连接验证

#### Scenario: Safe probe is unsupported by reachable service
- **WHEN** provider `safeProbe` 命中可达服务，但目标服务不支持该无生成验证接口
- **THEN** 系统 SHALL 返回 `partial`
- **THEN** 系统 SHALL 不将该 profile 判定为无效

### Requirement: Connection test SHALL be normalized to three statuses
系统 SHALL 将 `测试连接` 对外结果统一为 `verified`、`partial`、`failed` 三态，不再依赖 `supported/reachable` 布尔语义表示最终状态。

#### Scenario: Authentication is rejected
- **WHEN** 无生成探针收到 `401` 或 `403`
- **THEN** 系统 SHALL 返回 `failed`
- **THEN** 系统 SHALL 提示 API Key 无效或无权限

#### Scenario: Service is reachable but temporarily limited
- **WHEN** 无生成探针收到 `429`、`500`、`503` 或 `504`
- **THEN** 系统 SHALL 返回 `partial`
- **THEN** 系统 SHALL 提示服务已响应但当前不可完成稳定验证

#### Scenario: Network is unreachable
- **WHEN** 无生成探针遇到 DNS、TLS 或连接超时错误
- **THEN** 系统 SHALL 返回 `failed`
- **THEN** 系统 SHALL 提示无法连接服务器

### Requirement: Model discovery SHALL remain independent from connection verification
系统 SHALL 将 `discoverModels` 视为独立可选能力。模型发现结果不得参与 `测试连接` 是否成功的判定，也不得覆盖已得到的连接测试结果。

#### Scenario: Model discovery fails after verified connection
- **WHEN** profile 已通过 `测试连接` 得到 `verified`
- **THEN** 后续 `discoverModels` 失败 SHALL NOT 将该结果降级为 `failed`

#### Scenario: Model discovery is unsupported
- **WHEN** provider 不支持 `discoverModels`
- **THEN** 系统 SHALL 仍允许 profile 通过 `测试连接` 得到 `verified` 或 `partial`
- **THEN** 系统 SHALL 允许保存该 profile
