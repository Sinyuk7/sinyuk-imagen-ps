Status: draft
Authority: current user authorization to draft plan; not active until root `AGENTS.md` points here or the user explicitly starts execution
Owner: `packages/providers` contract with `packages/application` profile/runtime coordination
Created: 2026-07-04

# API Format Provider Contract

## Context Docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `packages/providers/AGENTS.md`
- `packages/providers/ARCHITECTURE.md`
- `packages/providers/TESTING.md`

Related draft:

- [`2026-07-04-api-format-profile-ui.md`](2026-07-04-api-format-profile-ui.md)

## Goal

Replace the user/profile-facing provider-family concept with a single persisted API format contract while preserving the current one-profile-one-adapter dispatch model.

## Non-Goals

- No Profile / Surface / ModelRoute architecture.
- No video, media-asset, or deferred execution lifecycle.
- No provider native adapter such as GRSAI `/v1/api/generate`.
- No compatibility migration for existing profiles; current-state assumption is zero users and never-launched product.
- No legacy profile/data compatibility layer; remove or replace stale provider-family/profile-type fields cleanly.
- No UI implementation in this Loop; UI work belongs to the related app Loop.
- No live provider proof or real network requirement.

## Scope

Allowed:

- `packages/providers/src/contract/**`
- `packages/providers/src/providers/**`
- `packages/providers/src/transport/**`
- `packages/providers/src/registry/**`
- `packages/providers/tests/**`
- `packages/application/src/commands/**`
- `packages/application/src/runtime.ts`
- `packages/application/src/requests/**`
- focused application tests for profile resolve, model listing, and dispatch
- canonical docs updates only if durable terminology changes must be promoted

Forbidden:

- `apps/app/src/**` UI changes.
- `packages/core-engine` job lifecycle changes.
- UXP host IO, Photoshop bridge, or storage implementation changes.
- Full media/deferred execution contracts.
- Raw provider request/response logging.

## Ownership Boundary

- `packages/providers` owns API format descriptors, internal adapter resolution, path config validation, request builders, response parsers, and provider diagnostics.
- `packages/application` owns persisted profile input/output shape, secret resolution, profile runtime config resolution, model commands, and dispatch adapter selection.
- `packages/core-engine` remains opaque dispatch only.
- `apps/app` consumes application commands only in the related UI Loop.

## Baseline

Before implementation:

- Run `pnpm --filter @imagen-ps/providers test`.
- Run `pnpm --filter @imagen-ps/application test`.
- If either fails before edits, report baseline failure and stop unless the failure is clearly unrelated and the user approves continuing.

## Slices

1. Contract naming and shape
   - Goal: introduce `ApiFormat` terminology in provider/application contracts.
   - Allowed scope: provider contract types, application command types, registry typing.
   - Required behavior:
     - new profile data persists one canonical `apiFormat`.
     - provider registry resolves the implementation adapter from `apiFormat`.
     - implementation IDs may exist in descriptors/logs but are not persisted profile state.
     - no legacy persisted `providerId` / `family` profile shape remains after this Loop.
   - Stop rule: produce a Decision Packet if a public type cannot be renamed without broad app changes.
   - Validation: `pnpm --filter @imagen-ps/providers test`, `pnpm --filter @imagen-ps/application test`.

2. Adapter identity mapping
   - Goal: map current implementations to API formats.
   - Required mapping:
     - `image-endpoint` behavior becomes `apiFormat: openai-images`.
     - `chat-image` behavior becomes `apiFormat: openai-chat-completions`.
     - `gemini-generate-content` remains `apiFormat: gemini-generate-content`.
   - Adapter implementations may keep existing file paths during this Loop, but exported descriptors and persisted profile-facing names must stop presenting them as provider families.
   - `apiFormat` is the protocol interface. Internal adapter IDs are strategy keys and must be derived by the registry/application, not saved in profiles, until a real same-format multi-adapter need appears.
   - Stop rule: produce a Decision Packet if `apiFormat` cannot remain the only persisted implementation selector.
   - Validation: provider descriptor tests and application profile tests.

3. Path config contract
   - Goal: make path config explicit and keep endpoint nodes as base URLs only.
   - Required behavior:
     - `connection.endpoints[].url` remains base URL / node only.
     - `openai-images` supports `paths.generation` and optional `paths.edit`.
     - `openai-chat-completions` supports `paths.invoke`.
     - `gemini-generate-content` supports `paths.invokeTemplate`; do not also persist `apiVersion`.
     - URL splitting keeps the stable protocol suffix in path config and keeps site prefixes/version prefixes in the endpoint base URL.
     - examples:
       - `https://foo.com/openai/v1/chat/completions` -> base URL `https://foo.com/openai/v1`, path `/chat/completions`.
       - `https://foo.com/proxy/v1/images/generations` -> base URL `https://foo.com/proxy/v1`, path `/images/generations`.
       - `https://llm-api.net/v1beta/models/gemini-2.5-flash-image:generateContent` -> base URL `https://llm-api.net/v1beta`, invoke template `/models/{model}:generateContent`, extracted model `gemini-2.5-flash-image`.
     - final URL assembly is `canonicalBaseUrl + normalizedPath` and must preserve base URL path prefixes; do not use `new URL(path, baseUrl)` when `path` starts with `/`.
     - safe assembly normalizes slash boundaries, for example `baseUrl.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '')`.
     - base URL canonicalization rejects username/password, query, hash, backslashes, and unsafe dot segments unless explicitly normalized by the URL parser.
     - path config rejects backslashes and unsafe `.` / `..` path segments.
     - URL assembly must preserve the expected origin and base path prefix.
   - Stop rule: stop if path overrides require UI-owned validation copy or host storage.
   - Validation: transport request URL assembly tests.

4. Endpoint classifier helper
   - Goal: add a deterministic helper that can classify full URLs or paths into supported API formats for UI/application use.
   - Required behavior:
     - return a structured `EndpointClassification`, not only an API format.
     - result status is `supported`, `incomplete`, or `unsupported`.
     - supported result includes `apiFormat`, optional `baseUrl`, `paths`, optional `extractedModel`, and `source: full-url | path`.
     - incomplete result is allowed for edit-only OpenAI Images input and must expose a reason such as `missing-generation-path`.
     - unsupported result includes a reason such as `invalid-url`, `unsupported-scheme`, `unsupported-query`, `unrecognized-path`, or `ambiguous-endpoint`.
     - parse full URLs with native URL parsing, reject non-empty `search`, ignore `hash`, and classify only `pathname`.
     - `/chat/completions/?$` maps to `openai-chat-completions`.
     - `/images/generations/?$` maps to `openai-images` generation path.
     - `/images/edits/?$` maps to incomplete `openai-images` edit path unless a generation path is already present.
     - `/models/[^/]+:generateContent/?$`, `/models/{model}:generateContent/?$`, and `/models/%7Bmodel%7D:generateContent/?$` map to `gemini-generate-content`.
     - fixed Gemini model paths are normalized to `{model}` templates and return `extractedModel`.
     - unrecognized paths return unsupported, never guessed.
     - uppercase path segments are not silently lowercased.
     - `/chat/completions/status` and `/chat/completions-backup` must not match.
   - Stop rule: stop if classification needs provider-specific live docs not already evidenced.
   - Validation: classifier table tests covering query strings, fragments, whitespace, illegal schemes, suffix false positives, Gemini fixed-model paths, Gemini template paths, and `%7Bmodel%7D` template paths.

5. Profile command rewrite
   - Goal: save, resolve, test, measure, and list model commands use `apiFormat` as the only persisted implementation selector.
   - Required behavior:
     - new persisted profiles do not require legacy `providerId/family`.
     - `apiFormat` resolves the provider implementation through registry/application mapping.
     - `defaultModel` remains profile config for this Loop.
     - zero-user, never-launched current-state means no legacy migration path, compatibility parser, or dual-write.
     - save commands derive or revalidate `apiFormat` from the final path config at save time.
     - caller-provided `apiFormat` is never accepted as authoritative unless it matches classification.
     - persisted `apiFormat` and path config cannot disagree.
     - all stored nodes share one profile-level `apiFormat` and path config.
     - base-URL-only nodes are not independently classified; they get URL validity and duplicate checks.
     - when a full endpoint URL is pasted while adding a node, its classified format and protocol suffix must match the profile, otherwise it is rejected and should become a separate profile.
   - Stop rule: stop if prompt optimizer profile special-case needs a separate slice.
   - Validation: `packages/application` profile tests.

6. Model catalog compatibility audit
   - Goal: ensure catalog lookup does not depend on removed user-facing provider-family values.
   - Required behavior:
     - existing model capability and brand resolution remains unchanged for the three supported API formats.
     - preserve the existing dynamic/fallback model precedence.
     - unsupported model discovery is a capability state, not a profile connection failure.
   - Non-goal: no catalog identity redesign in this Loop.
   - Stop rule: Decision Packet if catalog identity must be redesigned to complete the terminology change.
   - Validation: provider catalog harness after build if catalog files change.

7. Auth and connection-test contract
   - Goal: make auth defaults and non-billable connection testing explicit.
   - Required behavior:
     - `openai-images` defaults to Bearer.
     - `openai-chat-completions` defaults to Bearer.
     - `gemini-generate-content` defaults to `x-goog-api-key`, with Bearer allowed for compatible relays.
     - minimum `AuthMode`: `bearer`, `x-goog-api-key`, `none`.
     - API key secrets do not move into plain `extraHeaders`.
     - Test Connection is not Generate Image; it uses model/lightweight endpoints when available.
     - connection test result is tri-state: `verified`, `unverified` with reason `no-free-probe`, or `failed`.
     - paid generation smoke remains explicit live/release-only work outside this Loop.
   - Stop rule: stop if a connection test would require a paid generation call.
   - Validation: application/provider command tests.

8. Long-chain request evidence
   - Goal: prove classifier -> save profile -> resolve runtime -> dispatch URL/body/parser behavior for supported formats.
   - Required cases:
     - Gemini full URL extracts base URL, invoke template, and model; dispatch preserves base URL prefix, uses `contents.parts`, and parses fixture assets.
     - OpenAI Chat full URL dispatches `messages` request and parses markdown/data-url image assets.
     - OpenAI Images full URL dispatches generation path and parses `data[].url` / `data[].b64_json`.
   - Stop rule: stop if any proof requires live network.
   - Validation: mock/fetch fixture tests.

9. URL safety evidence
   - Goal: prove URL classification and assembly are deterministic and safe.
   - Required cases:
     - base URL with and without trailing slash.
     - base URL with `/v1` and with relay prefix.
     - path with and without leading slash.
     - multi-node profiles with different base prefixes.
     - no generated `//` path separators.
     - no lost base path prefix.
     - reject or canonicalize dot segments.
     - reject backslashes.
     - reject username/password, query, and hash in base URLs.
     - final assembled URL preserves origin and expected base prefix.
   - Stop rule: stop if URL safety cannot be proven without live network.
   - Validation: deterministic URL unit tests.

10. Documentation writeback
   - Goal: promote durable terminology to `docs/ENGINEERING_CONTEXT.md` and `packages/providers/ARCHITECTURE.md` only after implementation.
   - Required behavior: no permanent doc keeps stale "provider family means site/provider" wording.
   - Stop rule: stop if docs policy rejects new permanent docs; update existing whitelisted docs only.
   - Validation: `pnpm check:policy`.

## Validation

Quick:

- `pnpm check:policy`

Per-slice:

- `pnpm --filter @imagen-ps/providers test`
- `pnpm --filter @imagen-ps/application test`
- `node packages/providers/scripts/check-image-model-catalog.mjs` after providers build if catalog rules change

Final:

- `pnpm validate`

Manual-only:

- None.

Live-provider:

- None.

## Decision Packet Triggers

Produce an A/B/C Decision Packet if:

- implementation lookup cannot be derived from persisted `apiFormat` alone.
- internal adapter strategy identity leaks into persisted profile state.
- path override behavior cannot be validated with mock/fetch tests.
- URL assembly risks dropping base URL path prefixes or producing duplicate slashes.
- URL safety rules allow backslashes, dot-segment traversal, username/password, query/hash on base URLs, or origin/prefix drift.
- classifier ambiguity would silently store the wrong base URL/path/API format.
- save-time validation can trust stale UI classification instead of deriving/revalidating from final path config.
- model catalog identity needs redesign rather than a compatibility audit.
- existing prompt optimizer behavior conflicts with the new profile shape.
- any slice needs app UI imports or host storage changes.

## Completion Report

Executor must report:

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Boundary evidence:
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

## Memory Note Candidate

Yes: architecture, if implementation confirms the durable `apiFormat` / path-config terminology.
