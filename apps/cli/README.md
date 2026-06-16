# @imagen-ps/cli

`@imagen-ps/cli` is the command-line interface for imagen-ps. It lets you manage
image providers, save provider profiles, submit generation jobs, and write image
outputs to disk.

The package is currently intended to be used from this repository checkout.

## Install

From the repository root:

```bash
pnpm install
pnpm --filter @imagen-ps/cli build
cd apps/cli
pnpm link --global
```

If `pnpm link --global` fails with `ERR_PNPM_NO_GLOBAL_BIN_DIR`, configure pnpm
first:

```bash
pnpm setup
```

Open a new terminal, then run:

```bash
cd /path/to/sinyuk-imagen-ps/apps/cli
pnpm link --global
```

## Run

```bash
imagen <command>
```

The examples below assume `imagen --help` works.

To remove the local command later:

```bash
cd apps/cli
pnpm unlink
```

## Quick Start

From the repository root, create a mock provider profile file:

```bash
cat > profile.json <<'JSON'
{
  "profileId": "mock-dev",
  "providerId": "mock",
  "family": "image-endpoint",
  "displayName": "Mock Dev",
  "config": {
    "providerId": "mock",
    "family": "image-endpoint",
    "displayName": "Mock Dev",
    "baseURL": "https://mock.local",
    "defaultModel": "mock-image-v1"
  },
  "secretValues": {
    "apiKey": "sk-mock"
  }
}
JSON
```

Save the profile:

```bash
imagen profile save @profile.json
```

Check that the profile is valid:

```bash
imagen profile test mock-dev
```

Create a job input file:

```bash
cat > input.json <<'JSON'
{
  "profileId": "mock-dev",
  "prompt": "simple blue square icon on a plain white background"
}
JSON
```

Submit a text-to-image job:

```bash
imagen job submit provider-generate @input.json
```

Save generated image files and metadata:

```bash
imagen job submit provider-generate @input.json --out ./imagen-output
```

## Input Files

Commands that accept JSON can read either an inline JSON string or a file path
prefixed with `@`.

```bash
imagen profile save @profile.json
imagen job submit provider-generate @input.json
```

Example `profile.json`:

```json
{
  "profileId": "mock-dev",
  "providerId": "mock",
  "family": "image-endpoint",
  "displayName": "Mock Dev",
  "config": {
    "providerId": "mock",
    "family": "image-endpoint",
    "displayName": "Mock Dev",
    "baseURL": "https://mock.local",
    "defaultModel": "mock-image-v1"
  },
  "secretValues": {
    "apiKey": "sk-..."
  }
}
```

Example `input.json`:

```json
{
  "profileId": "mock-dev",
  "prompt": "simple blue square icon on a plain white background"
}
```

For automation, prefer storing API keys as environment-variable references:

```json
{
  "secretValues": {
    "apiKey": "env:IMAGEN_API_KEY"
  }
}
```

## Commands

### Providers

```bash
imagen provider list
imagen provider describe <providerId>
```

Built-in provider IDs include:

- `mock`
- `image-endpoint`
- `chat-image`

### Profiles

A profile stores the provider config and secret references used by jobs.

```bash
imagen profile list
imagen profile get <profileId>
imagen profile save @profile.json
imagen profile delete <profileId>
imagen profile delete <profileId> --retain-secrets
imagen profile test <profileId>
```

Model commands:

```bash
imagen profile models <profileId>
```

If the provider supports remote model discovery, refresh its saved model list:

```bash
imagen profile refresh-models <profileId>
```

Use `imagen profile save @profile.json` for both creating and updating a
profile. Include `"enabled": false` or a new `"config.defaultModel"` in the JSON
when those fields need to change.

### Jobs

```bash
imagen job submit provider-generate @input.json
imagen job submit provider-edit @input.json
imagen job submit provider-generate @input.json --out ./imagen-output
imagen job get <jobId>
imagen job retry <jobId>
```

`job get` and `job retry` only see jobs created inside the same running CLI
process. They do not load jobs from previous terminal commands.

## Configuration

By default, profiles and secrets are stored in:

```text
~/.imagen-ps
```

Use `IMAGEN_CONFIG_DIR` to choose a different directory:

```bash
IMAGEN_CONFIG_DIR=./local-config imagen profile list
```

The CLI stores:

- `provider-profiles.json`
- `provider-secrets.json`

## Output

- Success: JSON on stdout, exit code `0`
- Error: `{"error":"<message>"}` on stderr, exit code `1`

Use `imagen --help` or
`imagen <command> --help` for command-specific options.
