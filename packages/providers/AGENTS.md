# AGENTS.md

## Hard Rules

- `@imagen-ps/providers` stays the provider adapter layer.
- No app/session state, job lifecycle ownership, host IO, or settings persistence.
- No dependency on surface modules.
- Async Provider code owns only submit/poll wire protocol. Application owns scheduling, `jobId` deduplication, timers, and local cancellation.
- Canonical Provider descriptors own local `defaultModelTemplates`; generic remote model discovery, cache, and suggestion APIs are not provider contracts.
- Async adapters expose remote task facts and result URLs through `ProviderAsyncPollResult`; URL materialization belongs to an injected materializer boundary. Provider adapters must never retry an unknown submit, and signed URL query values must not enter diagnostics.
