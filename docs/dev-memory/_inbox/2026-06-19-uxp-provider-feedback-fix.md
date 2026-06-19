# UXP provider feedback fix

- Context: real Photoshop / UXP smoke showed `command.model.refresh.fail` and provider generate failures with `Cannot read properties of undefined (reading 'addEventListener')`.
- Evidence source: sanitized app JSONL event names and error summaries from the UXP data-folder log path pattern `logs/YYYY-MM-DD/imagen.jsonl`; no raw provider payloads, secrets, or local absolute paths are stored here.
- Cause: image-endpoint transport passed a `signal` key with value `undefined` into `fetch()`. The real UXP fetch path can dereference `signal.addEventListener` when the key exists.
- Fix: omit the `signal` property unless an actual `AbortSignal` is present.
- Adjacent UX fix: `testProviderProfile({ connect: true })` now preserves a safe `connectivity.errorMessage`; provider settings pages render operation-scoped, copyable inline notices instead of converting all connection failures into "config valid; no models".
- Validation: `pnpm validate`.
