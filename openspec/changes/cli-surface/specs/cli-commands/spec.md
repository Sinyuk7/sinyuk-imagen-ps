## ADDED Requirements

### Requirement: CLI 入口与子命令结构

CLI 入口 SHALL 通过 `apps/cli/src/index.ts` 暴露，使用 `commander` 构建子命令结构。

命令树结构 SHALL 为：
```
imagen
├── provider
│   ├── list
│   ├── describe <providerId>
│   └── config
│       ├── get <providerId>
│       ├── save <providerId> <configJson>
│       └── (no args: minimal interactive bootstrap shortcut)
└── job
    ├── submit <workflow> <inputJson>
    ├── get <jobId>
    └── retry <jobId>
```

CLI 定位为 lightweight automation surface：默认面向脚本、AI Skill、MCP wrapper 与 CI，使用非交互参数和机器可读 JSON；同时允许少量人工 bootstrap shortcut。

#### Scenario: 执行 CLI 入口
- **WHEN** 用户执行 `imagen --help`
- **THEN** 输出包含 `provider` 和 `job` 两个子命令组

---

### Requirement: provider list 命令

`provider list` 命令 SHALL 调用 `listProviders()` 并输出 JSON 数组。

#### Scenario: 列出所有 provider
- **WHEN** 用户执行 `imagen provider list`
- **THEN** stdout 输出 JSON 格式的 `ProviderDescriptor[]`
- **AND** exit code 为 0

---

### Requirement: provider describe 命令

`provider describe <providerId>` 命令 SHALL 调用 `describeProvider(providerId)` 并输出 JSON。

#### Scenario: 描述已存在的 provider
- **WHEN** 用户执行 `imagen provider describe mock`
- **THEN** stdout 输出该 provider 的 `ProviderDescriptor` JSON
- **AND** exit code 为 0

#### Scenario: 描述不存在的 provider
- **WHEN** 用户执行 `imagen provider describe nonexistent`
- **THEN** stderr 输出错误信息
- **AND** exit code 为 1

---

### Requirement: provider config get 命令

`provider config get <providerId>` 命令 SHALL 调用 `getProviderConfig(providerId)` 并输出结果。

#### Scenario: 获取已保存的配置
- **WHEN** 用户执行 `imagen provider config get mock` 且配置已保存
- **THEN** stdout 输出 `ProviderConfig` JSON
- **AND** exit code 为 0

#### Scenario: 获取未保存的配置
- **WHEN** 用户执行 `imagen provider config get mock` 且配置未保存
- **THEN** stderr 输出错误信息
- **AND** exit code 为 1

---

### Requirement: provider config save 命令

`provider config save <providerId> <configJson>` 命令 SHALL 调用 `saveProviderConfig(providerId, config)` 并输出结果。

`<configJson>` SHALL 支持两种形式：
1. 直接 JSON 字符串：`'{"providerId":"mock",...}'`
2. 文件路径（以 `@` 前缀）：`@config.json`

#### Scenario: 保存有效配置
- **WHEN** 用户执行 `imagen provider config save mock '{"providerId":"mock",...}'`
- **THEN** stdout 输出 `{"ok":true}`
- **AND** exit code 为 0
- **AND** 配置被持久化到 `~/.imagen-ps/config.json`

#### Scenario: 保存无效配置
- **WHEN** 用户执行 `imagen provider config save mock '{"invalid":true}'`
- **THEN** stderr 输出验证错误
- **AND** exit code 为 1

#### Scenario: 从文件读取配置
- **WHEN** 用户执行 `imagen provider config save mock @config.json`
- **THEN** CLI 读取 `config.json` 文件内容作为配置
- **AND** 调用 `saveProviderConfig` 保存

---

### Requirement: provider config 极简交互 shortcut

`provider config`（不带 `get` / `save` 子命令）SHALL 提供极简人工 bootstrap shortcut，用于选择 provider 并输入 API key / base URL / default model 等基础配置字段，然后调用 `saveProviderConfig(providerId, config)` 保存。

该 shortcut SHALL 仅用于人工初始化或快速修正配置；自动化场景 MUST 使用 `provider config save <providerId> <configJson>`。

#### Scenario: 人工配置 provider
- **WHEN** 用户执行 `imagen provider config`
- **THEN** CLI SHALL 允许用户选择一个已注册 provider
- **AND** CLI SHALL 允许用户输入该 provider 的基础配置字段
- **AND** CLI SHALL 调用 `saveProviderConfig` 保存配置到 `~/.imagen-ps/config.json`
- **AND** 命令完成时 SHALL 使用明确 exit code 表示成功或失败

#### Scenario: 自动化路径不依赖交互
- **WHEN** 脚本、AI Skill、MCP wrapper 或 CI 需要保存 provider 配置
- **THEN** 它们 SHALL 使用 `imagen provider config save <providerId> <configJson>` 或 `@config.json`
- **AND** 不需要交互式 prompt

---

### Requirement: job submit 命令

`job submit <workflow> <inputJson>` 命令 SHALL 调用 `submitJob({ workflow, input })` 并输出结果。

`<inputJson>` SHALL 支持 JSON 字符串或 `@` 文件路径。

#### Scenario: 提交成功的 job
- **WHEN** 用户执行 `imagen job submit provider-generate '{"provider":"mock","prompt":"test"}'`
- **THEN** stdout 输出 `Job` JSON（包含 id、status、output 等）
- **AND** exit code 为 0

#### Scenario: 提交失败的 job
- **WHEN** 用户执行 `imagen job submit provider-generate '{"provider":"nonexistent"}'`
- **THEN** stdout 输出 `Job` JSON（status 为 failed，包含 error）
- **AND** exit code 为 0（命令本身成功，job 执行失败是业务结果）

---

### Requirement: job get 命令

`job get <jobId>` 命令 SHALL 调用 `getJob(jobId)` 并输出结果。

#### Scenario: 获取已存在的 job
- **WHEN** 用户执行 `imagen job get <existingJobId>`
- **THEN** stdout 输出 `Job` JSON
- **AND** exit code 为 0

#### Scenario: 获取不存在的 job
- **WHEN** 用户执行 `imagen job get nonexistent-id`
- **THEN** stderr 输出错误信息
- **AND** exit code 为 1

---

### Requirement: job retry 命令

`job retry <jobId>` 命令 SHALL 调用 `retryJob(jobId)` 并输出结果。

#### Scenario: 重试成功
- **WHEN** 用户执行 `imagen job retry <existingJobId>`
- **THEN** stdout 输出新 `Job` JSON
- **AND** exit code 为 0

#### Scenario: 重试不存在的 job
- **WHEN** 用户执行 `imagen job retry nonexistent-id`
- **THEN** stderr 输出错误信息
- **AND** exit code 为 1

---

### Requirement: 统一输出格式

所有 automation 命令 SHALL 遵循统一输出约定：
- 成功结果输出到 stdout，格式为 JSON
- 错误信息输出到 stderr，格式为 JSON：`{"error": "<message>"}`
- exit code：0 表示命令成功，1 表示命令失败

极简人工 shortcut MAY 在交互过程中输出 prompt；命令完成时仍 SHALL 使用明确 exit code，并 SHOULD 输出机器可读结果摘要。

#### Scenario: 成功输出
- **WHEN** 命令执行成功
- **THEN** stdout 为有效 JSON
- **AND** stderr 为空
- **AND** exit code 为 0

#### Scenario: 失败输出
- **WHEN** 命令执行失败
- **THEN** stdout 为空或空 JSON
- **THEN** stderr 为 `{"error": "<message>"}` 格式
- **AND** exit code 为 1
