# CLI Smoke Tests

`cli-e2e.test.ts` contains the CLI smoke harness. Default runs use only the mock
entry. Live provider entries are opt-in.

## Run

Mock-only:

```bash
pnpm --filter @imagen-ps/cli build
pnpm --filter @imagen-ps/cli test
```

Live provider smoke:

```bash
pnpm build
IMAGEN_RUN_SMOKE=1 pnpm --filter @imagen-ps/cli test
```

If the local network requires a proxy:

```bash
HTTP_PROXY=http://127.0.0.1:7897 \
HTTPS_PROXY=http://127.0.0.1:7897 \
ALL_PROXY=http://127.0.0.1:7897 \
IMAGEN_RUN_SMOKE=1 \
pnpm --filter @imagen-ps/cli test
```

## Configuration

Edit `e2e.config.json` for prompt, source image, mask, model, base URL, or task
selection. Prefer config changes over harness edits.

Current entries:

| name | providerId | family | base URL | tasks |
|---|---|---|---|---|
| mock | `mock` | `image-endpoint` | `https://mock.local` | text-to-image, edit-image, edit-image with mask |
| n1n | `image-endpoint` | `image-endpoint` | `https://llm-api.net` | text-to-image, edit-image, edit-image with mask |
| OpenRouter | `chat-image` | `chat-image` | `https://openrouter.ai/api/v1` | text-to-image, edit-image |

## Secrets

Put real smoke credentials only in the repository root `.test.env`; it is
gitignored. `.test.env.example` is the template.

```bash
IMAGEN_SMOKE_N1N_API_KEY=
IMAGEN_SMOKE_N1N_BASE_URL=https://llm-api.net
IMAGEN_SMOKE_N1N_MODEL=gpt-image-1.5

IMAGEN_SMOKE_OPENROUTER_API_KEY=
IMAGEN_SMOKE_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
IMAGEN_SMOKE_OPENROUTER_MODEL=sourceful/riverflow-v2.5-fast
```

Profile secrets are written as `env:<VAR>` references and resolved only during
the test run.

If Clash Verge / Mihomo is used, ensure these domains route through the proxy:

- `openrouter.ai`
- `clerk.openrouter.ai`
- `llm-api.net`
- `api.n1n.ai`

## Output Artifacts

Smoke output is retained under:

```text
.test-output/smoke/<run-id>/<entry>/
  *.png | *.jpg | *.webp
  *.json
```

`.test-output/` is gitignored. The harness cleans temporary config directories
but keeps output artifacts for image and sidecar inspection.

Sidecar metadata includes at least:

- `jobId`
- `providerId`
- `model`
- `operation`
- `prompt`
- `sha256`
- `size`
- `mimeType`
- `savedAt`
