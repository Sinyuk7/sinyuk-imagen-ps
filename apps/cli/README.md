# @imagen-ps/cli

`@imagen-ps/cli` is the repository Node automation surface for provider profile
setup, provider contract validation, mock/live smoke, and local artifact-producing
generate/edit jobs.

It is not a general image CLI and it does not own Photoshop / UXP behavior.
Photoshop host IO belongs to `apps/app`.

## Install

From the repository root:

```bash
pnpm install
pnpm --filter @imagen-ps/cli build
cd apps/cli
pnpm link --global
imagen --help
```

If pnpm has no global bin directory, run `pnpm setup`, open a new terminal, then
repeat the link step.

To remove the local command:

```bash
cd apps/cli
pnpm unlink
```

## Mock-First Quick Start

The mock provider is local, zero-cost, and does not use network or real keys.

```bash
imagen init --mock
imagen profile test mock-dev
imagen generate --profile mock-dev --prompt "simple blue square icon" --out ./imagen-output
```

`init --mock` creates or updates the built-in `mock-dev` profile in the CLI
config directory. It is not a repository initializer and it does not configure
real provider credentials.

`--out` writes one directory per job:

```text
<out>/<jobId>/image.*
<out>/<jobId>/image.json
```

The sidecar includes job, provider, model, operation, prompt, hash, size, MIME
type, and saved timestamp when available.

## JSON Input

Commands that accept structured input support inline JSON and `@file`:

```bash
imagen profile save '{"profileId":"mock-dev","providerId":"mock","family":"image-endpoint","displayName":"Mock Dev","config":{"providerId":"mock","family":"image-endpoint","displayName":"Mock Dev","baseURL":"https://mock.local"},"secretValues":{"apiKey":"sk-mock"}}'
imagen profile save @profile.json
imagen job submit provider-generate '{"profileId":"mock-dev","prompt":"simple blue square icon"}'
imagen job submit provider-generate @input.json
```

`generate` and `edit` are CLI-only task-first aliases over the same shared
application/session path used by `job submit`.

## Providers And Profiles

Provider commands:

```bash
imagen provider list
imagen provider describe <providerId>
```

Built-in provider IDs:

- `mock`
- `image-endpoint`
- `chat-image`

Profile commands:

```bash
imagen init --mock
imagen profile list
imagen profile get <profileId>
imagen profile save @profile.json
imagen profile delete <profileId>
imagen profile delete <profileId> --retain-secrets
imagen profile test <profileId>
imagen profile test <profileId> --connect
imagen profile models <profileId>
imagen profile refresh-models <profileId>
```

`profile save` is the only profile write entrypoint. Submit a new profile JSON
to change `enabled`, `config.defaultModel`, or other profile fields.

## Config And Secrets

CLI profile, secret, job history, and asset state default to:

```text
~/.imagen-ps
```

Use `IMAGEN_CONFIG_DIR` for hermetic runs:

```bash
IMAGEN_CONFIG_DIR=./local-config imagen profile list
```

Logs are separate. Use `IMAGEN_LOG_DIR` when a test or automation run must
isolate JSONL logs.

CLI file storage includes:

- `provider-profiles.json`
- `provider-secrets.json`

For real keys, prefer `env:` references:

```json
{
  "secretValues": {
    "apiKey": "env:IMAGEN_API_KEY"
  }
}
```

The UXP app does not reuse CLI file storage. `apps/app` uses injected secure
storage and host adapters.

## Job Commands

Task-first aliases:

```bash
imagen generate --profile <profileId> --prompt <prompt>
imagen generate --profile <profileId> --prompt <prompt> --model <model> --out ./imagen-output
imagen edit --profile <profileId> --image ./input.png --prompt <prompt>
imagen edit --profile <profileId> --image ./input.png --prompt <prompt> --model <model> --out ./imagen-output
```

Lower-level job commands:

```bash
imagen job submit provider-generate @input.json
imagen job submit provider-edit @input.json
imagen job submit provider-generate @input.json --out ./imagen-output
imagen job list
imagen job list --status failed --limit 20
imagen job get <jobId>
imagen job retry <jobId>
```

`job list`, `job get`, and `job retry` can read CLI durable history. Durable
records store sanitized job metadata and asset references, not raw secret values
or image bytes.

## stdout / stderr

Automation contract:

- success: JSON to stdout, exit code `0`;
- failure: `{"error":"<message>"}` to stderr, exit code `1`.

`imagen --help` and command help still print human-readable help text.

## Validation

```bash
pnpm --filter @imagen-ps/cli build
pnpm --filter @imagen-ps/cli test
```

Live provider smoke is opt-in and documented in
`apps/cli/tests/smoke/README.md`.
