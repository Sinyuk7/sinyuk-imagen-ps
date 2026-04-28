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
│   │   ├── provider/                     # Provider command group
│   │   │   ├── index.ts
│   │   │   ├── list.ts
│   │   │   ├── describe.ts
│   │   │   ├── config-get.ts
│   │   │   ├── config-save.ts
│   │   │   └── config-interactive.ts
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

## Development

```bash
# Build
pnpm --filter @imagen-ps/cli build

# Watch mode
pnpm --filter @imagen-ps/cli dev

# Run tests
pnpm --filter @imagen-ps/cli test
```
