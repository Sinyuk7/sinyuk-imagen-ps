## ADDED Requirements

### Requirement: 公共生成意图
Application MUST 使用 host-neutral 公共请求表达 provider/model、operation、prompt、输入 Asset、canonical Mask 和 catalog 参数值。

#### Scenario: Provider lane admission
- **WHEN** 用户提交 provider 生成
- **THEN** Application 校验公共请求并创建统一 Job/Task，而不解析 provider endpoint 或 raw payload

### Requirement: 统一任务与资源处理
GRSAI、RunningHub 和 ComfyUI 结果 MUST 进入统一的 Task、AssetStore、History、Preview、Download 和错误投影流程。

#### Scenario: Provider 生成完成
- **WHEN** provider adapter 返回统一结果
- **THEN** Application 持久化统一 output refs 并更新对应 Task 状态
