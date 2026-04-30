# @imagen-ps/cli

Lightweight automation surface for imagen-ps. Provides CLI commands for provider management and job submission.

## Positioning

This CLI is designed as a **lightweight automation surface** — it targets scripts, AI Skills, MCP wrappers, and CI pipelines with non-interactive, JSON-output commands by default. A minimal interactive shortcut (`provider config`) is available for human-driven provider bootstrap only.

## Installation

```bash
pnpm install
pnpm --filter @imagen-ps/cli build
```

## Usage

```bash
# Run directly
node apps/cli/dist/index.js <command>

# Or after linking
imagen <command>
```

## Commands

### Provider Management

```bash
# List all registered providers
imagen provider list

# Describe a specific provider
imagen provider describe <providerId>

# Get saved configuration for a provider
imagen provider config get <providerId>

# Save configuration (JSON string)
imagen provider config save <providerId> '{"providerId":"mock","apiKey":"..."}'

# Save configuration (from file)
imagen provider config save <providerId> @config.json

# Interactive bootstrap shortcut (human use only)
imagen provider config
```

### Profile Management

Profiles are first-class top-level entities under `imagen profile`. Each profile
binds a `providerId` to a saved config + secret refs and is the unit a job is
submitted against.

> **NOTE**: All profile commands now live under the flat `imagen profile *`
> namespace. The previous `imagen provider profile *` path has been removed.

#### Lifecycle

```bash
# List all configured profiles (no secrets returned)
imagen profile list

# Get a single profile (no secrets returned)
imagen profile get <profileId>

# Save a profile from a JSON string or @file
imagen profile save '{"profileId":"mock-dev","providerId":"mock","family":"openai-compatible","displayName":"Mock Dev","config":{"baseURL":"https://mock.local"},"secretValues":{"apiKey":"sk-..."}}'
imagen profile save @profile.json

# Delete a profile (also deletes referenced secrets by default)
imagen profile delete <profileId>
imagen profile delete <profileId> --retain-secrets

# Validate a profile end-to-end (config + secrets) without leaking secret values
imagen profile test <profileId>
```

#### Model Discovery

```bash
# List the effective candidate models for a profile.
# Fallback chain: profile.models cache → provider implementation defaults → []
imagen profile models <profileId>
# → { "models": [{ "id": "mock-image-v1" }] }

# Refresh the profile.models cache by invoking provider.discoverModels(config).
# Providers without `discoverModels` MUST return a validation error and the
# profile.models cache MUST NOT be modified on failure.
imagen profile refresh-models <profileId>

# Set the default model on profile.config.defaultModel.
# `<modelId>` MUST be present in the candidate list returned by `profile models`.
# There is no `--force` bypass.
imagen profile set-default-model <profileId> <modelId>
```

#### Enable / Disable

```bash
# Toggle profile.enabled (idempotent).
imagen profile enable <profileId>
imagen profile disable <profileId>
```

#### End-to-End Example (Mock Provider)

The mock provider ships static `defaultModels: [{ id: "mock-image-v1" }]` and
does NOT implement `discoverModels`, so the discovery cache stays empty by
design. The flow below exercises the fallback path:

```bash
# 1. Save a mock profile (no models in input — discovery cache stays empty).
imagen profile save '{
  "profileId": "mock-dev",
  "providerId": "mock",
  "family": "openai-compatible",
  "displayName": "Mock Dev",
  "config": { "baseURL": "https://mock.local" },
  "secretValues": { "apiKey": "sk-mock" }
}'

# 2. Inspect candidate models — falls back to provider impl defaults.
imagen profile models mock-dev
# → { "models": [{ "id": "mock-image-v1" }] }

# 3. (Optional) refresh-models against the mock provider returns a validation
#    error because mock has no discoverModels; profile.models stays untouched.
imagen profile refresh-models mock-dev
# stderr: { "error": "provider mock does not implement discoverModels" }

# 4. Pin the default model — must come from the candidate list.
imagen profile set-default-model mock-dev mock-image-v1

# 5. Submit a job; raw.model on the response should echo `mock-image-v1`.
imagen job submit provider-generate '{
  "profileId": "mock-dev",
  "prompt": "test"
}'
```

### Job Management

```bash
# Submit a job
imagen job submit <workflow> '{"provider":"mock","prompt":"test"}'

# Submit a job (from file)
imagen job submit <workflow> @input.json

# Get job status (current process only)
imagen job get <jobId>

# Retry a failed job (current process only)
imagen job retry <jobId>
```

## Output Format

- **Success**: JSON to stdout, exit code 0
- **Error**: `{"error": "<message>"}` to stderr, exit code 1

## Configuration

Provider configurations are stored at `~/.imagen-ps/config.json`.

File format:
```json
{
  "version": 1,
  "providers": {
    "<providerId>": { ...ProviderConfig }
  }
}
```

## Limitations

- **Job history is process-scoped**: `job get` and `job retry` can only access jobs from the current CLI process. Cross-process job persistence is not supported in v1.
- **No pretty-print or table output**: All output is JSON.
- **No shell completion**: Not implemented in v1.

## Architecture

```
apps/cli
├── src/
│   ├── index.ts                          # Entry point
│   ├── adapters/
│   │   └── file-config-adapter.ts        # FileConfigAdapter (Node.js fs)
│   ├── commands/
│   │   ├── provider/                     # Provider command group (list / describe / config)
│   │   │   ├── index.ts
│   │   │   ├── list.ts
│   │   │   ├── describe.ts
│   │   │   ├── config-get.ts
│   │   │   ├── config-save.ts
│   │   │   └── config-interactive.ts
│   │   ├── profile/                      # Profile command group (lifecycle + discovery + enable/disable)
│   │   │   ├── index.ts
│   │   │   ├── lifecycle.ts              # list / get / save / delete / test
│   │   │   ├── models.ts                 # list candidate models (fallback chain)
│   │   │   ├── refresh-models.ts         # invoke discoverModels + persist cache
│   │   │   ├── set-default-model.ts      # strict default-model selection
│   │   │   ├── enable.ts                 # set enabled = true (idempotent)
│   │   │   └── disable.ts                # set enabled = false (idempotent)
│   │   └── job/                          # Job command group
│   │       ├── index.ts
│   │       ├── submit.ts
│   │       ├── get.ts
│   │       └── retry.ts
│   └── utils/
│       ├── input.ts                      # JSON/file input parsing
│       └── output.ts                     # Unified JSON output
└── tests/
    ├── adapters/
    │   └── file-config-adapter.test.ts
    ├── utils/
    │   └── input.test.ts
    └── commands/
        └── commands.test.ts
```

### Dependency Boundary

```
apps/cli → @imagen-ps/shared-commands → runtime packages
```

`apps/cli` MUST NOT depend on or import from `@imagen-ps/app` (Photoshop/UXP surface).

## Smoke Testing

Smoke 测试验证 CLI → profile → openai-compatible provider → 真实 API 的完整端到端链路。
默认不执行（需要显式 opt-in），不会影响常规 `pnpm test`。

### 前置条件

设置以下环境变量：

```bash
export IMAGEN_SMOKE_OPENAI_API_KEY="sk-your-key-here"
export IMAGEN_SMOKE_OPENAI_BASE_URL="https://api.openai.com"  # 可选，默认为 OpenAI 官方地址
```

### 运行 Smoke 测试

```bash
# 运行所有 smoke 测试（需要 IMAGEN_RUN_SMOKE=1）
IMAGEN_RUN_SMOKE=1 pnpm --filter @imagen-ps/cli test:smoke

# 或分步设置
export IMAGEN_RUN_SMOKE=1
pnpm --filter @imagen-ps/cli test:smoke
```

未设置 `IMAGEN_RUN_SMOKE` 或凭证缺失时，所有需要真实网络的测试自动跳过。

### 手动 Smoke 命令序列

以下命令使用真实文件 adapter（`~/.imagen-ps/`），适合手动端到端验证：

```bash
# 1. 创建 openai-compatible profile（API key 通过 secretValues 写入 secret storage）
imagen profile save '{
  "profileId": "openai-smoke",
  "providerId": "openai-compatible",
  "family": "openai-compatible",
  "displayName": "OpenAI Smoke Test",
  "config": {
    "baseURL": "https://api.openai.com"
  },
  "secretValues": {
    "apiKey": "sk-your-key-here"
  }
}'

# 2. 刷新 model 列表（调用 provider.discoverModels() 从上游获取可用模型）
imagen profile refresh-models openai-smoke

# 3. 查看候选 model 列表
imagen profile models openai-smoke

# 4. 设置默认 model
imagen profile set-default-model openai-smoke dall-e-3

# 5. 提交 generate job（使用 profile defaultModel）
imagen job submit provider-generate '{
  "profileId": "openai-smoke",
  "prompt": "a simple red circle on white background",
  "output": { "count": 1 }
}'

# 6. 提交 generate job（explicit model override）
imagen job submit provider-generate '{
  "profileId": "openai-smoke",
  "prompt": "a blue square",
  "providerOptions": {
    "model": "dall-e-3"
  },
  "output": { "count": 1 }
}'

# 7. 验证 profile 配置有效性
imagen profile test openai-smoke

# 8. 清理
imagen profile delete openai-smoke
```

### 环境变量参考

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `IMAGEN_RUN_SMOKE` | 是 | - | 设置为 `1` 以启用 smoke 测试 |
| `IMAGEN_SMOKE_OPENAI_API_KEY` | 是 | - | OpenAI API key |
| `IMAGEN_SMOKE_OPENAI_BASE_URL` | 否 | `https://api.openai.com` | API base URL（支持 relay/proxy） |

## Development

```bash
# Build
pnpm --filter @imagen-ps/cli build

# Watch mode
pnpm --filter @imagen-ps/cli dev

# Run tests
pnpm --filter @imagen-ps/cli test

# Run smoke tests (requires env vars)
pnpm --filter @imagen-ps/cli test:smoke
```
