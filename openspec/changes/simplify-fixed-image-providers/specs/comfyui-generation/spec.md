## ADDED Requirements

### Requirement: ComfyUI 协议隔离
ComfyUI backend MUST 继续独立拥有 workflow JSON、Bridge、API Graph、Frontend Queue 和 connection state，不得改用 provider catalog 请求协议。

#### Scenario: ComfyUI 生成
- **WHEN** 用户选择 ComfyUI workflow
- **THEN** 系统通过现有 ComfyUI backend 执行，并保持 workflow revision、mapping、Bridge 和 Queue 语义

### Requirement: 统一结果汇合
ComfyUI 与 provider lane MUST 仅在统一 Task、Asset、History 和资源动作边界汇合。

#### Scenario: ComfyUI 输出完成
- **WHEN** ComfyUI 返回输出资源
- **THEN** 系统使用与 provider 结果相同的统一资源和历史流程，但不经过 GRSAI/RunningHub adapter
