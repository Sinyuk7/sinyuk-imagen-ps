## ADDED Requirements

### Requirement: Placement uses the current document
用户主动置入 Task output 时，系统 MUST 使用当前 Photoshop document 和既有 placement 策略；原始 source layer、原始 selection 或原始 Mask 是否仍存在 MUST NOT 成为置入前置条件。

#### Scenario: Source layer was deleted
- **WHEN** 生成基于 layer A，但用户置入前删除了 layer A
- **THEN** 系统仍尝试将输出置入当前 document，不要求重新绑定 layer A

#### Scenario: Source mask was deleted
- **WHEN** 生成使用过 Mask，但用户置入前删除该 Mask
- **THEN** 系统仍可置入已经物化的输出

#### Scenario: No current document
- **WHEN** 用户点击置入但 Photoshop 没有可用当前 document
- **THEN** 置入动作返回明确失败，Task output 和生成历史保持不变

#### Scenario: Document changes during download
- **WHEN** 用户点击置入后下载完成前切换了 Photoshop document
- **THEN** host placement 使用置入动作执行时的当前 document，并由 host adapter 管理 `executeAsModal`

### Requirement: Placement is an explicit action
系统 MUST NOT 在 provider 完成、插件启动或下载完成时自动置入；置入成功或失败是一次 action result，不增加 `ready-to-place` 公共 Task 状态。

#### Scenario: Completed task waits for user
- **WHEN** provider Task 已 completed 且本地 Asset 已存在
- **THEN** 系统只在用户点击置入后调用 Photoshop placement

#### Scenario: Signed URL is not exposed in diagnostics
- **WHEN** output 使用带签名 query 的 provider URL
- **THEN** 原始 URL 只传给 materializer，普通日志和 UI 不记录完整签名 URL
