Status: draft
Authority: current user authorization (2026-07-04)
Owner: `packages/providers` gemini-generate-content implementation slices
Created: 2026-07-04

# Gemini Generate-Content Provider Implementation

## Context docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `packages/AGENTS.md`
- `packages/providers/AGENTS.md`

Current Loop references:

- `docs/loops/2026-07-04-chat-image-request-codec-foundation.md`
- `docs/loops/2026-07-04-openai-compatible-wire-compatibility.md`

User / design references:

- User-supplied analysis document:
  `对。按你现有的抽象，最合理的是新增第三类内部 Provider 实现：gemini-generate-content`

External protocol references:

- Google Gemini API `models.generateContent` reference:
  `https://ai.google.dev/api/generate-content`
- Google Gemini image-generation guide:
  `https://ai.google.dev/gemini-api/docs/image-generation`
- Google Gemini API auth reference:
  `https://ai.google.dev/gemini-api/docs/api-key`
- n1n Gemini image generation official-format example:
  `https://docs.n1n.ai/en/329862069e0`

Current code references:

- `packages/providers/src/contract/capability.ts`
- `packages/providers/src/contract/config.ts`
- `packages/providers/src/contract/provider.ts`
- `packages/providers/src/contract/request.ts`
- `packages/providers/src/contract/image-model-capability.ts`
- `packages/providers/src/contract/image-model-catalog/rules/chat-image.ts`
- `packages/providers/src/providers/chat-image/`
- `packages/providers/src/providers/image-endpoint/`
- `packages/providers/src/registry/builtins.ts`
- `packages/providers/src/index.ts`

## Goal

Implement a new internal provider implementation
`gemini-generate-content`, owned by `packages/providers`, so Gemini
`models/{model}:generateContent` image generation and editing are modeled as a
separate wire-family provider rather than as `chat-image` codec expansion or
`image-endpoint` dialect branching, with the provider boundary, request / path
ownership, response-selection rules, and model-catalog identity fixed before
transport code lands.

## Non-goals

- No implementation of `openrouter-images-v1` in this Loop.
- No implementation of `gemini-interactions` in this Loop.
- No expansion of `chat-image` beyond its own `/chat/completions` legacy codec.
- No broad "google" super-provider that mixes Generate Content, Interactions,
  and unrelated Gemini methods behind one provider id.
- No UI-level protocol selection or codec/family branching by model substring,
  endpoint domain, or provider error prose.
- No claim that mock-only tests prove real n1n or Google gateway compatibility.
- No live provider smoke or paid verification in this Loop.
- No workflow, UI, persistence, picker, hint, or protocol-selection behavior
  changes in `packages/application` or `apps/app`.

## Scope

Allowed implementation scope:

- `packages/providers` provider family, config, descriptor, request builder,
  response parser, error mapping, model catalog, and registry boundaries
- read-only verification of `packages/application` / `apps/app` exhaustiveness
  impact for a new provider family or provider id
- `docs/ENGINEERING_CONTEXT.md` only if durable ownership knowledge changes
- `docs/TESTING.md` only if validation guidance materially changes

Forbidden implementation scope:

- Photoshop / UXP host IO
- `packages/core-engine` ownership changes
- chat-image protocol expansion
- image-endpoint request-codec redesign
- live compatibility claims for third-party gateways
- prompt-optimize redesign
- `packages/application/**` or `apps/app/**` behavior changes beyond strictly
  mechanical exhaustiveness fixes if a new family literal causes compile
  failure

## Ownership boundary

- `packages/providers` owns the new provider implementation
  `gemini-generate-content`.
- `gemini-generate-content` is a provider boundary, not a codec under
  `transport/chat-image/`, because its path, request envelope, media-input
  shape, response envelope, and error envelope are all protocol-distinct.
- `ProviderFamily` should gain a new wire-family literal
  `'gemini-generate-content'` rather than reusing `'chat-image'` or
  `'image-endpoint'`.
- `packages/application` continues to own workflow-to-provider request mapping
  only. It must keep passing the same `CanonicalImageJobRequest`.
- `packages/application/**` and `apps/app/**` are read-only verification scope
  only. They must not gain workflow, UI, persistence, picker, hint, or
  protocol-selection behavior changes from this Loop.
- `packages/core-engine` remains unaware of Gemini protocol details.

## Baseline

Known current-state facts:

- `ProviderFamily` currently allows only `'image-endpoint'`, `'chat-image'`,
  and `'prompt-optimize'`.
- `ProviderConfig` currently has dedicated config shapes for
  `ImageEndpointProviderConfig`, `ChatImageProviderConfig`, and
  `PromptOptimizeProviderConfig`.
- `ImageCatalogProviderId` currently allows only `'image-endpoint'` and
  `'chat-image'`.
- `chat-image` currently mixes Google-compatible image models into a
  chat-completions wire path, which is exactly the boundary this Loop avoids
  widening.
- `image-endpoint` owns OpenAI-like image endpoints and explicit image-edit
  codecs; it is not the right place for Gemini `generateContent`.
- Google documents `models.generateContent` as a distinct endpoint family and
  current REST image-generation examples use `/v1/models/{model}:generateContent`.
- n1n documents a Gemini official-format image-generation endpoint under the
  same `:generateContent` path family but with `/v1beta/models/{model}:generateContent`.
- Google documents Gemini API authentication with `x-goog-api-key`.
- Google docs currently show both `generationConfig.imageConfig` and
  `generationConfig.responseFormat.image` shapes in different Generate Content
  references/examples, so image-output mapping is a real wire-revision concern,
  not a solved constant.
- Google image-generation docs describe native image generation/editing as a
  Gemini capability and note that Gemini 3.1 Flash Lite Image supports only
  `1K`, while larger Gemini image models support `2K` and `4K`.
- Gemini image-generation docs also note thought/interim image behavior, so a
  parser that collects every `inlineData` part as a final asset would be
  incorrect.

Baseline validation before implementation claims:

```bash
pnpm check:policy
pnpm --filter @imagen-ps/providers test -- registry-exports chat-image-provider image-endpoint-provider
pnpm --filter @imagen-ps/application test -- resolve-model-brand profile-models
```

If baseline validation fails before implementation:

- report whether the failure is pre-existing or branch drift;
- do not use it to justify widening scope;
- produce a Decision Packet if it blocks provider-boundary attribution.

## Target boundary

The first boundary decision is explicit:

```text
Provider abstraction
├── image-endpoint
├── chat-image
├── gemini-generate-content
└── prompt-optimize
```

Required boundary properties:

- `gemini-generate-content` is a new provider implementation with its own
  config schema, descriptor, provider factory, transport folder, tests, and
  registry export.
- It is protocol-owned, not vendor-host-owned: Google official endpoints, n1n,
  and other Gemini-compatible gateways may all fit if they serve the same
  `generateContent` wire contract.
- It reuses the same upper-layer `CanonicalImageJobRequest` for
  `text_to_image` and `image_edit`.
- Both generation and editing are expressed through the same
  `generateContent` endpoint family; edit is distinguished by image-bearing
  `parts`, not by a separate provider id or separate endpoint provider.
- Model discovery is provider-owned and separate from execution request build.
  It must not be coupled to the execution builder unless a real common
  discovery contract is evidenced.
- Response parsing is Gemini-specific and semantic. It must not reuse
  `chat-image` markdown/image-message parsing assumptions.

Provider config direction:

- start from a dedicated `GeminiGenerateContentProviderConfig`
- keep the shared `connection`, `defaultModel`, `extraHeaders`, and `timeoutMs`
  semantics aligned with existing providers
- add an explicit auth contract for this provider family instead of relying on
  accidental `Authorization: Bearer ...` defaults

Recommended auth boundary for first implementation:

```ts
type GeminiGenerateContentAuthMode =
  | 'x-goog-api-key'
  | 'bearer';
```

Rules:

- `x-goog-api-key` is required for Google official Gemini API compatibility.
- `bearer` is required for documented gateway compatibility such as n1n.
- `query-key` is out of scope unless a harness-backed requirement appears
  during execution; current Google docs prefer the header form.
- `extraHeaders` may add gateway-specific headers, but must not silently
  override provider-owned auth headers without explicit validation or warning.

API-version ownership:

- the provider must not hardcode `/v1beta/`
- version ownership must be explicit and single-sourced
- recommended first contract:

```ts
interface GeminiGenerateContentProviderConfig {
  apiVersion: 'v1' | 'v1beta';
}
```

- if `baseUrl` stays versionless, path assembly must be:

```ts
`/${config.apiVersion}/models/${encodeURIComponent(normalizeGeminiModelId(model))}:generateContent`
```

- tests must prove both `gemini-3.1-flash-image` and
  `models/gemini-3.1-flash-image` normalize to the same valid path
- the implementation must not allow doubled version segments such as
  `/v1beta/v1beta/models/...`

Provider-local wire revision ownership:

```ts
type GeminiGenerateContentWireRevision =
  | 'response-format-image'
  | 'image-config-legacy';
```

Rules:

- this revision is provider-internal only
- it must not leak to upper layers
- one request must use exactly one revision
- the provider must not send both `generationConfig.imageConfig` and
  `generationConfig.responseFormat.image` in the same request
- the provider must not automatically retry a paid request with the alternate
  revision after failure
- current Google REST default should prefer `response-format-image`
- gateway support for either revision must be evidenced by official docs,
  reproducible fixtures, or approved live proof; mock-only implementation must
  not claim real ratio compatibility for n1n or other gateways

Provider request / response ownership:

- request builder owns `contents[].parts[]`, `inlineData` / URI-style media
  references, and `generationConfig`
- output mapping owns `generationConfig.responseModalities` and
  one provider-local image-output revision under `generationConfig`
- response parser owns `candidates[].content.parts[]` extraction
- error mapping owns Gemini error envelopes separately from OpenAI-like error
  mapping

Response-selection policy:

- candidate selection must be explicit; the parser must not blindly flatten all
  candidates and parts into user assets
- preserve original part order within the selected candidate
- prefer non-thought image parts as final assets
- if all image parts are marked thought/interim, select only the last image as
  the final asset candidate
- thought text/image may appear in diagnostics, but must not enter surfaced
  user assets by default
- tests must cover:
  - thought text + interim thought images + final image
  - all image parts marked thought, with the last image treated as final

Model-catalog boundary:

- `ImageCatalogProviderId` should expand to include
  `'gemini-generate-content'`
- `gemini-generate-content` gets its own model rules file instead of reusing
  `chat-image` rules
- capability differences such as `1K`-only models versus `2K` / `4K` models
  belong in provider-local catalog rules, not in ad hoc builder special cases
- the same `modelId` may validly appear under both `chat-image` and
  `gemini-generate-content`; identity, cache, capability, and catalog keys must
  include `providerId` / family together with `modelId`
- tests must prove same-model-id coexistence across provider families without
  cross-provider deduplication
- image-size wire values must be exact and explicit:
  - `512`
  - `1K`
  - `2K`
  - `4K`
- tests must reject or normalize unsupported loose forms such as:
  - `1k`
  - `2k`
  - `512px`
  - `1024`
  - `0.5K`

Discovery boundary:

- remote discovery is optional in the first implementation
- if a stable `models.list`-style contract is not evidenced across target
  gateways, the first implementation may rely on local catalog defaults plus
  saved-model support
- do not block the provider boundary on universal remote discovery

## Slices

## Slice 0: Freeze the provider identity

Goal:

- Define `gemini-generate-content` as a distinct provider family and provider
  id without implementing transport behavior yet.

Allowed scope:

- `packages/providers/src/contract/capability.ts`
- `packages/providers/src/contract/config.ts`
- `packages/providers/src/contract/provider.ts`
- `packages/providers/src/index.ts`
- `packages/providers/src/registry/builtins.ts`
- read-only inspection of application / app consumers

Required outputs:

- explicit provider-family decision
- explicit provider-id decision
- no reuse of `chat-image` or `image-endpoint` family literals for this
  protocol

Validation:

```bash
pnpm --filter @imagen-ps/providers test -- registry-exports
```

Stop rule:

- Stop and produce a Decision Packet if introducing a new provider family would
  force upper layers to understand Gemini wire semantics rather than only a new
  provider identity.

## Slice 1: Freeze config and auth ownership

Goal:

- Define the dedicated config shape and auth boundary for
  `gemini-generate-content`, including explicit API-version ownership.

Allowed scope:

- `packages/providers/src/contract/config.ts`
- new provider config schema files under `packages/providers/src/providers/gemini-generate-content/`
- focused provider config tests

Required outputs:

- dedicated config type
- explicit auth mode contract
- explicit `apiVersion` or equivalent single-source version ownership
- no accidental fallback to `Authorization: Bearer` for all cases
- no dependence on endpoint-domain guessing to decide auth behavior
- no doubled version ownership between `baseUrl` and request path builder

Validation:

```bash
pnpm --filter @imagen-ps/providers test -- provider-config-endpoints registry-exports
```

Stop rule:

- Stop and produce a Decision Packet if auth support requires a broad generic
  config rewrite across all providers instead of a narrow provider-family
  addition.

## Slice 2: Freeze request / response semantics

Goal:

- Define the canonical-to-wire mapping and semantic response ownership for
  `generateContent`, including provider-local image-output revision and thought
  image selection policy.

Allowed scope:

- new transport files under
  `packages/providers/src/transport/gemini-generate-content/`
- new provider files under
  `packages/providers/src/providers/gemini-generate-content/`
- focused provider tests

Required outputs:

- `text_to_image` and `image_edit` both route through
  `models/{model}:generateContent`
- request path is version-owned and normalized from one source only
- request body uses Gemini-native shapes such as `contents`, `parts`,
  `generationConfig`, and `responseModalities`
- image output config uses exactly one provider-local wire revision per request:
  `responseFormat.image` or legacy `imageConfig`
- edit inputs use Gemini-native image parts rather than chat-image message
  content or image-endpoint multipart fields
- response parsing extracts image/text output from Gemini-native response
  structures, not from OpenAI-like `data[]` or chat-like `message`
- parser applies explicit thought/interim image filtering and candidate
  selection rules instead of flattening every inline image part

Validation:

```bash
pnpm --filter @imagen-ps/providers test -- gemini-generate-content-provider
```

Stop rule:

- Stop and produce a Decision Packet if the claimed request/response structure
  cannot be evidenced from official docs or reproducible fixtures without paid
  live probing.

## Slice 3: Freeze model-catalog and discovery boundaries

Goal:

- Define how provider-local model capability rules and optional remote
  discovery fit the new provider.

Allowed scope:

- `packages/providers/src/contract/image-model-capability.ts`
- new catalog rules under
  `packages/providers/src/contract/image-model-catalog/rules/`
- focused provider and application tests if provider ids become visible to
  shared commands

Required outputs:

- new provider id participates in the local image-model catalog
- model capability differences live in catalog rules, not builders
- remote discovery remains optional and must not redefine local catalog
  authority
- same `modelId` may coexist across `chat-image` and
  `gemini-generate-content` without cross-provider deduplication
- catalog / capability / selection identity includes provider plus model, not
  model alone

Validation:

```bash
pnpm --filter @imagen-ps/providers test -- gemini-generate-content-provider image-model-catalog-brand
pnpm --filter @imagen-ps/application test -- resolve-model-brand profile-models
```

Stop rule:

- Stop and produce a Decision Packet if adding the provider to the local model
  catalog would require broad UI ownership changes or if discovery semantics
  would overtake local catalog authority.

## Validation

Quick:

```bash
pnpm check:policy
```

Per-slice:

```bash
pnpm --filter @imagen-ps/providers test -- registry-exports
pnpm --filter @imagen-ps/providers test -- provider-config-endpoints
pnpm --filter @imagen-ps/providers test -- gemini-generate-content-provider
pnpm --filter @imagen-ps/application test -- resolve-model-brand profile-models
```

Final:

```bash
pnpm validate
```

Manual-only:

- none required for boundary planning

Live-provider:

- out of scope for this Loop
- mock-only implementation may ship only as non-default / unverified gateway
  compatibility; this Loop must not claim that ratio or image-output mapping is
  verified on n1n or any third-party gateway without separate evidence

Execution dependency:

- execute serially after `docs/loops/2026-07-04-chat-image-request-codec-foundation.md`
  completes:
  - Slice 0
  - Slice 1
  - Slice 2

## Decision Packet triggers

Produce a Decision Packet instead of guessing when:

- the provider should be split into more than one family
- auth requirements cannot be represented by a narrow provider-local contract
- version ownership cannot be made single-source without broad config churn
- current official docs and fixtures are insufficient to choose between
  `responseFormat.image` and `imageConfig` for the first shipped wire revision
- remote discovery is treated as mandatory but no stable common endpoint is
  evidenced
- response normalization would require reusing `chat-image` parser semantics
  instead of a Gemini-specific parser
- the new provider family would require `apps/app` or `packages/application` to
  own wire fields

## Completion report

The executing agent must report:

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

## Memory note candidate

yes: architecture
