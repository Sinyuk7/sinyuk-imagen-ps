# Chrome provider feasibility note

Date: 2026-06-25
Loop: `docs/loops/2026-06-25-app-dual-runtime-refactor.md`
Slice: 0

## Decision

Chrome can bundle the existing `@imagen-ps/application` command facade and the
provider runtime path for a mock-only development harness. The default browser
harness should use the built-in mock provider for deterministic tests.

Direct browser provider execution remains conditional for real network-backed
families. `image-endpoint` and `chat-image` can build browser request bodies
with Fetch, Blob, AbortController, and Headers, but real execution depends on
provider CORS policy and on the user's acceptance that credentials are present
inside the browser runtime. Default validation must not require network,
credentials, paid APIs, or provider account state.

## Provider Family Matrix

| Family | Bundle support | CORS expectation | Auth/header behavior | Streaming | Image input | Direct browser status |
|---|---|---|---|---|---|---|
| `mock` | supported | none | in-memory mock secret only | not used | synthetic generation/edit assets | supported |
| `image-endpoint` | supported | provider endpoint must allow browser origin | Authorization-like headers expose credentials to browser runtime | not used | generation JSON and edit multipart Blob bodies are browser-buildable | conditional |
| `chat-image` | supported | provider endpoint must allow browser origin | Authorization-like headers expose credentials to browser runtime | not used | URL/base64 inputs are browser-buildable; fileId depends on provider upload policy | conditional |

## Frozen Mock Strategy

Slice 0 freezes the default Chrome provider mock strategy as application-level
mock provider execution. Fetch-layer interception remains a later option for
network-backed provider transport tests, but it is not required to prove the
first Chrome command path because the built-in mock provider already exercises
the application submit/job/materialization path without network.

## Evidence

- Minimal Chrome shell: `apps/app/src/shells/chrome/main.ts`.
- Composition proof: `apps/app/src/composition/chrome/chrome-feasibility-runtime.ts`.
- Browser-safe app storage proof: `apps/app/src/adapters/chrome/browser-app-storage.ts`.
- Repo-side smoke: `apps/app/tests/chrome-feasibility.test.ts`.
