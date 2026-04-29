## Context

当前 `openai-compatible` provider 已完整实现 HTTP transport、retry、error taxonomy、response 归一化，并通过 mocked HTTP 单元测试覆盖。CLI 端已具备完整的 profile 管理命令（`save`/`list`/`models`/`set-default-model`/`enable`/`disable`）和 job submit 命令。但缺少一条端到端的真实网络 smoke 路径来验证完整链路。

现有测试架构：
- `packages/providers/tests/openai-compatible-provider.test.ts`：mocked HTTP，验证 provider 内部逻辑
- `packages/shared-commands/tests/`：in-memory adapter，验证 shared-commands 层逻辑
- `apps/cli/tests/`：CLI 命令注册与参数解析测试

Smoke 测试需要跨越所有三层，使用真实（或用户提供的）API endpoint。

## Goals / Non-Goals

**Goals:**
- 提供一条从 CLI 命令到真实 HTTP 请求的端到端 smoke 验证路径
- 验证 `defaultModel`（来自 profile config）正确进入 HTTP request body
- 验证 explicit `providerOptions.model`（来自 job input）正确覆盖 defaultModel
- 默认 CI 不执行 smoke 测试，通过显式 opt-in 触发
- 凭证通过 env var 注入，不写入任何持久化文件

**Non-Goals:**
- 不实现 `discoverModels()`
- 不修改 provider 或 shared-commands 的任何代码
- 不新增 CLI 命令
- 不做多 provider smoke 覆盖
- 不做性能测试

## Decisions

### Decision 1: Smoke 测试放在 `apps/cli/tests/smoke/` 而非 `scripts/`

**选择**：`apps/cli/tests/smoke/`，使用 Vitest 框架

**理由**：
- 与现有测试基础设施一致（Vitest + TypeScript）
- 可以利用 Vitest 的 `describe.skipIf` / `it.skipIf` 做条件跳过
- 可以利用 Vitest 的 assertion 库做结构化验证
- 放在 `apps/cli` 下因为 smoke 测试的入口是 CLI 命令链路

**替代方案**：`scripts/smoke-test.sh`（bash 脚本）
- 优点：更简单，不依赖 Vitest
- 缺点：无法做结构化 JSON 断言，错误处理弱，与项目测试体系割裂

### Decision 2: 通过 env var 注入凭证，使用 in-memory adapter 避免污染持久化文件

**选择**：Smoke 测试使用 `createInMemoryProviderProfileRepository()` 和 `createInMemorySecretStorageAdapter()`，通过 env var 读取 API key/baseURL

**理由**：
- 不写入 `~/.imagen-ps/provider-profiles.json`，避免污染用户本地配置
- 不写入 `~/.imagen-ps/provider-secrets.json`，避免 API key 泄漏到文件系统
- in-memory adapter 已在 shared-commands 中提供，无需新建

**替代方案**：使用 `FileProviderProfileRepository` + 临时目录
- 优点：更接近真实 CLI 行为
- 缺点：需要管理临时文件清理，增加复杂度

### Decision 3: 使用 `IMAGEN_RUN_SMOKE=1` 作为 smoke 测试的 opt-in 开关

**选择**：Vitest 测试文件顶部检查 `process.env.IMAGEN_RUN_SMOKE`，未设置时 skip 所有测试

**理由**：
- 默认 `pnpm test` 不触发真实网络调用
- 开发者显式 `IMAGEN_RUN_SMOKE=1 pnpm test:smoke` 执行
- 与 CI 环境变量体系一致

**替代方案**：使用 Vitest 的 `@tag` 注释 + `--tag smoke`
- 优点：Vitest 原生支持
- 缺点：需要配置 Vitest 的 tag 过滤，增加 `vitest.config.ts` 复杂度

### Decision 4: Model 传递验证通过检查 raw response 实现

**选择**：在 smoke 测试中，通过 `providerOptions.model` 传入一个特定值，然后检查 `ProviderInvokeResult.raw` 或 mock transport 记录的 request body 来验证 model 字段

**理由**：
- `openai-compatible` provider 的 `invoke()` 返回 `raw: response.response.data`，包含上游响应
- 但上游响应不一定回显请求中的 model 字段（取决于 API 实现）
- 更可靠的方案：在 smoke 测试中注入一个 spy/mock transport，记录实际发出的 HTTP request body，然后断言 `body.model` 的值

**实际实现**：Smoke 测试分两层：
1. **集成测试**（不需要真实网络）：mock HTTP transport，验证 `buildRequestBody` 产出的 body 中 `model` 字段正确
2. **端到端 smoke**（需要真实网络）：使用真实 API，验证完整链路不抛错、返回合法 Asset[]

### Decision 5: 不修改 provider 代码来暴露 request body

**选择**：Smoke 测试通过 import `buildRequestBody` 函数直接测试 request body 构造逻辑，不修改 provider 的 `invoke` 返回值

**理由**：
- `buildRequestBody` 已是 `packages/providers/src/transport/openai-compatible/build-request.ts` 的导出函数
- 可以直接在测试中调用，验证 model 三级优先级
- 不需要修改 provider 契约

## Risks / Trade-offs

- **[Risk] 真实 API 调用可能产生费用** → Smoke 测试使用最小的 `n=1`、最小的 `size`，且仅手动触发
- **[Risk] 真实 API 可能不可用或限流** → Smoke 测试设置合理的 timeout（30s），失败时不 block CI
- **[Risk] env var 中的 API key 可能被日志输出** → Smoke 测试不 console.log 任何 credential 相关字段；Vitest 输出中脱敏
- **[Trade-off] in-memory adapter vs 真实文件 adapter** → 选择 in-memory 简化测试，但略偏离真实 CLI 路径。真实文件路径的验证留给手动 smoke 命令序列（README 文档）