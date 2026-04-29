## ADDED Requirements

### Requirement: Smoke 测试默认跳过，通过 env var 显式触发
`apps/cli` 的 smoke 测试 MUST 在 `IMAGEN_RUN_SMOKE` 环境变量未设置或不为 `'1'` 时自动跳过所有测试用例，不发起任何网络请求。

#### Scenario: 默认跳过 smoke 测试
- **WHEN** 执行 `pnpm test` 且未设置 `IMAGEN_RUN_SMOKE` 环境变量
- **THEN** smoke 测试文件中的所有测试用例被跳过
- **AND** 不发起任何 HTTP 请求
- **AND** 测试进程以 exit code 0 退出

#### Scenario: 显式触发 smoke 测试
- **WHEN** 执行 `IMAGEN_RUN_SMOKE=1 pnpm test:smoke`
- **THEN** smoke 测试文件中的所有测试用例正常执行
- **AND** 使用 env var 中的凭证发起真实 HTTP 请求

### Requirement: Smoke 测试 SHALL 通过 env var 注入凭证，使用 in-memory adapter
Smoke 测试 MUST 通过环境变量 `IMAGEN_SMOKE_OPENAI_API_KEY` 和 `IMAGEN_SMOKE_OPENAI_BASE_URL` 读取 API 凭证，并使用 `createInMemoryProviderProfileRepository()` 和 `createInMemorySecretStorageAdapter()` 构建测试上下文，不写入任何持久化文件。

#### Scenario: 凭证通过 env var 注入
- **WHEN** 设置了 `IMAGEN_SMOKE_OPENAI_API_KEY=sk-test` 和 `IMAGEN_SMOKE_OPENAI_BASE_URL=https://api.openai.com`
- **THEN** smoke 测试使用这些值创建 profile 和 secret
- **AND** 不读取或写入 `~/.imagen-ps/` 下的任何文件

#### Scenario: 凭证缺失时跳过测试
- **WHEN** `IMAGEN_RUN_SMOKE=1` 但 `IMAGEN_SMOKE_OPENAI_API_KEY` 未设置
- **THEN** 需要真实网络的测试用例被跳过
- **AND** 输出提示信息说明缺少必要环境变量

### Requirement: Smoke 测试 SHALL 验证 profile → job submit → 响应解析的完整链路
Smoke 测试 MUST 覆盖从 profile 创建到 job 完成的完整端到端链路，验证 `submitJob` 返回 `{ ok: true }` 且 job status 为 `'completed'`。

#### Scenario: 端到端 generate 成功
- **WHEN** 使用有效的 API 凭证创建 `openai-compatible` profile 并提交 generate job
- **THEN** `submitJob` 返回 `{ ok: true }`
- **AND** job status 为 `'completed'`
- **AND** job output 包含至少一个 Asset

#### Scenario: 端到端 generate 失败（无效 API key）
- **WHEN** 使用无效的 API key 提交 generate job
- **THEN** `submitJob` 返回 `{ ok: true }`（命令层成功）
- **AND** job status 为 `'failed'`
- **AND** job error category 为 `'provider'`

### Requirement: Model 传递验证 SHALL 确认 defaultModel 与 explicit model 正确进入 HTTP request body
Smoke 测试 MUST 包含对 `buildRequestBody` 函数的直接测试，验证 model 三级优先级（explicit `providerOptions.model` > `config.defaultModel` > 硬编码 `'dall-e-3'`）正确工作。

#### Scenario: explicit providerOptions.model 优先级最高
- **WHEN** 调用 `buildRequestBody(request, 'dall-e-3')` 且 `request.providerOptions.model = 'gpt-4o'`
- **THEN** 返回的 body 中 `model` 字段为 `'gpt-4o'`

#### Scenario: defaultModel 作为 fallback
- **WHEN** 调用 `buildRequestBody(request, 'dall-e-3')` 且 `request.providerOptions` 不包含 `model`
- **THEN** 返回的 body 中 `model` 字段为 `'dall-e-3'`

#### Scenario: 硬编码 fallback
- **WHEN** 调用 `buildRequestBody(request)` 不传 `defaultModel` 且 `request.providerOptions` 不包含 `model`
- **THEN** 返回的 body 中 `model` 字段为 `'dall-e-3'`

### Requirement: CLI README SHALL 包含 Smoke Testing 章节
`apps/cli/README.md` MUST 新增 "Smoke Testing" 章节，提供完整的手动 smoke 命令序列，覆盖 profile 创建、defaultModel 设置、job submit、以及 explicit model override 的端到端示例。

#### Scenario: README 包含手动 smoke 命令序列
- **WHEN** 阅读 `apps/cli/README.md` 的 "Smoke Testing" 章节
- **THEN** 包含使用 `imagen profile save` 创建 openai-compatible profile 的完整命令
- **AND** 包含 `imagen profile set-default-model` 设置默认模型的命令
- **AND** 包含 `imagen job submit` 提交 generate job 的命令
- **AND** 包含 explicit `providerOptions.model` override 的示例
- **AND** 标注需要设置的环境变量