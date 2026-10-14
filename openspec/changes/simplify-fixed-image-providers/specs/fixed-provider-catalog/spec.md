## ADDED Requirements

### Requirement: 固定 provider 账号
系统 MUST 只公开 `grsai` 和 `runninghub` 两个产品 provider，并且每个 provider MUST 只有一份当前 API Key。

#### Scenario: 更新 provider API Key
- **WHEN** 用户保存某个 provider 的新 API Key
- **THEN** 系统覆盖该 provider 的当前 Key，且不会创建新的 Profile 或账号记录

### Requirement: 本地 catalog authority
系统 MUST 从随发布物提供的 `packages/providers/catalog/` 本地 catalog 加载模型和参数，运行时 MUST 不调用远程模型发现。

#### Scenario: 加载有效 catalog
- **WHEN** 应用启动并加载 catalog
- **THEN** 系统校验模型 ID 唯一、默认值合法、参数选项非空，并向 UI 提供只读 projection

### Requirement: 动态基础参数
系统 MUST 根据当前 provider/model 的 catalog 参数动态生成主页面的最小选择控件，并只保存 provider/model 维度的参数偏好。

#### Scenario: 切换模型
- **WHEN** 用户切换模型
- **THEN** UI 立即替换为该模型声明的参数选项，并清理或回退到合法默认值
