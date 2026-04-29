## Why

`openai-compatible` provider 的 HTTP transport、retry、error taxonomy、response 归一化等核心逻辑已通过单元测试（mocked HTTP）验证，但尚未在 CLI 端完成一次端到端的真实网络 smoke 验证。当前缺少一条从 `imagen profile save` → `imagen job submit` → 真实 API 调用 → 响应解析的完整手动验证路径，也无法确认 `defaultModel` 与 explicit `providerOptions.model` 是否正确进入 HTTP request body。本次变更补齐这条 smoke 路径，同时确保 CI 默认不依赖外网。

## What Changes

- 新增 `apps/cli/tests/smoke/` 目录，提供端到端 smoke 测试脚本，覆盖 profile 创建 → job submit → 响应验证的完整链路
- Smoke 测试通过 env var（`IMAGEN_SMOKE_OPENAI_API_KEY` / `IMAGEN_SMOKE_OPENAI_BASE_URL`）注入真实 API 凭证，不写入任何持久化文件
- 验证 `defaultModel` 与 explicit `providerOptions.model` 是否正确传递到 HTTP request body（通过检查 raw response 或 mock transport 断言）
- 默认 `pnpm test` 不执行 smoke 测试；通过 `pnpm test:smoke` 或 `IMAGEN_RUN_SMOKE=1` 显式触发
- CLI README 新增 "Smoke Testing" 章节，提供完整的手动 smoke 命令序列

## Capabilities

### New Capabilities

- `cli-smoke-testing`: CLI 端到端 smoke 测试框架，支持通过 env var 注入真实凭证、默认跳过 CI、验证 model 传递正确性

### Modified Capabilities

_无现有 spec 需求变更。本次变更仅新增 smoke 测试基础设施，不修改任何 provider、shared-commands、或 CLI 命令的契约行为。_

## Impact

- 新建 `apps/cli/tests/smoke/` 目录及 smoke 测试文件
- `apps/cli/package.json`：新增 `test:smoke` script
- `apps/cli/README.md`：新增 "Smoke Testing" 章节
- 不影响 `packages/providers`、`packages/shared-commands`、`packages/workflows` 的任何代码
- 不影响现有单元测试的 CI 行为

## Non-goals

- 不实现 `openai-compatible.discoverModels()`（留给后续 change）
- 不修改 provider 的 HTTP transport 或 retry 逻辑
- 不新增 CLI 命令
- 不将 smoke 测试纳入默认 CI pipeline
- 不做多 provider（如 Azure、Anthropic）的 smoke 覆盖
- 不做性能基准测试或负载测试