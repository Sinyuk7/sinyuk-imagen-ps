Status: draft
Authority: current user authorization (2026-07-04)
Owner: `packages/providers` chat-image transport / descriptor slices
Created: 2026-07-04

# Chat-Image Explicit Request Codec Foundation

## Context docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `packages/AGENTS.md`
- `packages/providers/AGENTS.md`

Design / historical references:

- User-supplied analysis document:
  `结论：方向正确，但抽象应收敛为“统一语义输入 + 显式 wire codec”，而不是继续让 chat-image 用一个 builder 猜所有上游协议。`
- `docs/loops/2026-07-04-openai-compatible-wire-compatibility.md`
  as a sibling transport-design reference for `image-endpoint`, not as active
  authority for `chat-image`

Current code references:

- `packages/providers/src/contract/request.ts`
- `packages/providers/src/contract/provider.ts`
- `packages/providers/src/providers/chat-image/config-schema.ts`
- `packages/providers/src/providers/chat-image/descriptor.ts`
- `packages/providers/src/providers/chat-image/provider.ts`
- `packages/providers/src/transport/chat-image/build-request.ts`
- `packages/providers/src/transport/chat-image/models.ts`
- `packages/providers/src/transport/chat-image/parse-response.ts`
- `packages/providers/tests/chat-image-provider.test.ts`
- `packages/providers/tests/registry-exports.test.ts`

## Goal

Establish a provider-owned, mock-testable explicit request-codec foundation for
`chat-image`, limited to extracting the current `/chat/completions` behavior as
an explicit legacy codec and tightening canonical-to-wire ownership, without
using `chat-image` as a catch-all home for unrelated image-generation
protocols.

## Non-goals

- No `apps/app`, `packages/application`, or `packages/core-engine` ownership
  changes unless a narrow provider contract change is proven necessary.
- No generic transport DSL, JSON templating engine, or schema-driven wire
  scripting system.
- No automatic cross-codec fallback, retry replay, or failover multiplication
  for `chat-image` in this Loop.
- No provider-family, endpoint-domain, model-substring, or error-prose guessing
  to infer protocol shape.
- No live provider proof, paid smoke, real Photoshop / UXP validation, or CORS
  claims.
- No `image-endpoint` request-codec redesign beyond read-only comparison.
- No `openrouter-images-v1` implementation under `chat-image`.
- No `gemini-interactions-v1beta` implementation under `chat-image`.
- No `gemini-generate-content` implementation under `chat-image`.
- No broad image-model catalog redesign, picker behavior change, or UI surfacing
  of codec names.
- No balance-query redesign.

## Scope

Allowed implementation scope:

- `packages/providers/src/contract/request.ts` for narrow canonical-request
  tightening only if required by the transport boundary
- `packages/providers/src/contract/provider.ts`
- `packages/providers/src/contract/index.ts`
- `packages/providers/src/providers/chat-image/config-schema.ts`
- `packages/providers/src/providers/chat-image/descriptor.ts`
- `packages/providers/src/providers/chat-image/provider.ts`
- `packages/providers/src/transport/chat-image/`
- focused tests under `packages/providers/tests/`
- `docs/ENGINEERING_CONTEXT.md` only if implementation produces durable
  contract knowledge
- `docs/TESTING.md` only if validation guidance materially changes

Forbidden scope:

- `apps/app/**`
- `packages/application/**` except read-only inspection of request builders or
  descriptor consumers
- `packages/core-engine/**`
- `packages/providers/src/providers/image-endpoint/**` except read-only pattern
  comparison
- provider profile persistence schema changes
- manual override UI for codec selection
- durable compatibility cache or host persistence for codec decisions
- provider discovery/catalog policy changes unrelated to request-codec routing
- adding unrelated image-generation protocols under `transport/chat-image/`

## Ownership boundary

- `packages/providers` owns canonical-request validation, transport codec
  declaration, request builders, execution response parsers, discovery routing,
  diagnostics, and any runtime-only codec resolution needed by `chat-image`.
- `packages/application` continues to own workflow-to-provider request mapping,
  but must not construct provider wire fields such as `messages`,
  `response_format`, `modalities`, or `image_config`.
- `packages/core-engine` remains unaware of request codec selection, upstream
  wire protocol names, and provider transport negotiation.
- `apps/app` remains unaware of codec names and must not branch on protocol
  shape.

## Baseline

Known current-state facts:

- `CanonicalImageJobRequest` already acts as the stable provider-facing image
  request contract under `packages/providers/src/contract/request.ts`.
- `chat-image` currently routes generation and edit traffic through one
  `buildChatImageRequestBody()` builder under
  `packages/providers/src/transport/chat-image/build-request.ts`.
- The current builder owns protocol-specific fields such as `messages`,
  `modalities`, and `image_config`, and also merges
  `providerOptions.image_config`.
- `chat-image` provider currently posts to `/chat/completions` and discovers
  models from `/models`.
- `chat-image` descriptor currently declares `responseCodecs: ['json']` only;
  it does not declare request-codec capabilities.
- `image-endpoint` already demonstrates the preferred ownership pattern for
  explicit transport compatibility: descriptor declaration plus provider-owned
  runtime resolution under `descriptor.transport.wire`.
- `packages/application` request builders already pass canonical image requests
  through unchanged and do not need protocol awareness.
- Current `chat-image` model discovery is provider-owned and routed through
  `/models`; it is not inherently the same contract as execution request shape.

Baseline validation before implementation claims:

```bash
pnpm check:policy
pnpm --filter @imagen-ps/providers test -- registry-exports chat-image-provider
```

If baseline validation fails before implementation:

- report whether the failure is pre-existing or local-branch drift;
- do not use a failing baseline to justify widening scope;
- produce a Decision Packet if baseline failure blocks transport attribution.

## Target contract

This Loop introduces one stable abstraction boundary for `chat-image` only:
canonical image semantics stay in `CanonicalImageJobRequest`; the current
`/chat/completions` wire path moves behind an explicit legacy request codec
declared by the provider.

Required first-loop properties:

- keep one canonical image request as the only provider input from upper layers;
- make `chat-image` request protocol selection explicit and descriptor-driven,
  even if the first implementation has only one request codec;
- make the codec own complete execution-request build and semantic execution
  response parse;
- keep model discovery provider-owned rather than attaching it to an execution
  codec contract;
- keep runtime behavior deterministic and mock-testable;
- preserve current `/chat/completions` behavior by extracting it as an
  explicit legacy codec without adding unrelated protocols to `chat-image`.

Recommended first-loop contract shape:

```ts
export type ChatImageRequestCodec =
  | 'chat-completions-image-legacy';

export interface ChatImageWireCodec {
  readonly id: ChatImageRequestCodec;

  buildRequest(
    request: CanonicalImageJobRequest,
    context: ChatImageCodecContext,
  ): BuiltHttpRequest;

  parseExecutionResponse(raw: unknown): ParsedChatImageResponse;
}
```

The exact type names may differ, but the boundary must preserve these rules:

- a request codec is a complete execution wire unit, not only a body-shape
  enum;
- path ownership stays inside `buildRequest()` so dynamic paths such as
  `/v1beta/models/{model}:generateContent` remain representable in future
  provider-local codecs;
- no single builder may continue to guess protocol shape from `model`,
  endpoint, or provider option keys;
- model discovery parsing stays on the provider / model-source side unless a
  later provider proves discovery cannot be separated from execution protocol;
- `providerOptions` remains a controlled escape hatch, but must not deep-merge
  over codec-owned wire structures;
- adding a new unrelated upstream protocol should require a new provider or a
  provider-local Loop, not another branch under `chat-image` by default.

Descriptor recommendation:

```ts
interface ProviderWireCapability {
  readonly supportedEditCodecs?: readonly ImageEditCodec[];
  readonly defaultEditCodecOrder?: readonly ImageEditCodec[];
  readonly supportedImageRequestCodecs?: readonly ChatImageRequestCodec[];
  readonly defaultImageRequestCodec?: ChatImageRequestCodec;
  readonly responseCodecs?: readonly ProviderResponseCodec[];
}
```

Rules:

- `supportedImageRequestCodecs` and `defaultImageRequestCodec` are provider
  transport declarations, not UI-facing choices.
- `chat-image` first extracts current behavior as
  `chat-completions-image-legacy`.
- This Loop must not introduce automatic fallback from one request codec to
  another after a failed paid request.
- This Loop must not treat `openrouter-images-v1`,
  `gemini-interactions-v1beta`, or `gemini-generate-content-v1beta` as
  `chat-image` codecs.

Provider-options ownership rules for this Loop:

- each codec declares its own reserved / codec-owned wire fields;
- reserved top-level and nested structural keys from `providerOptions` must not
  overwrite canonical or codec-owned structures through spread or deep merge;
- passthrough is allowlist-based per codec, not "merge anything unknown";
- ignored or rejected reserved keys must be observable through validation or
  structured warning logs;
- tests must cover nested collision cases such as canonical
  `output.aspectRatio = '1:1'` versus `providerOptions.image_config`.

## Slices

## Slice 0: Freeze boundary and naming

Goal:

- Define the `chat-image` request-codec contract and descriptor shape without
  changing user-visible behavior.

Allowed scope:

- `packages/providers/src/contract/provider.ts`
- `packages/providers/src/contract/index.ts`
- `packages/providers/src/providers/chat-image/descriptor.ts`
- focused provider contract tests

Required outputs:

- explicit request-codec type for `chat-image`;
- descriptor declaration for supported/default `chat-image` request codecs;
- no `packages/application` or `apps/app` consumer awareness of codec names.

Validation:

```bash
pnpm --filter @imagen-ps/providers test -- registry-exports chat-image-provider
```

Stop rule:

- Stop and produce a Decision Packet if the descriptor shape would require
  `packages/application` or `apps/app` to understand codec names.

## Slice 1: Extract the current chat-completions flow as a legacy codec

Goal:

- Move the current `chat-image` request construction and response parsing into
  an explicit legacy codec module while preserving exact behavior.

Allowed scope:

- `packages/providers/src/providers/chat-image/provider.ts`
- `packages/providers/src/transport/chat-image/`
- focused `chat-image` provider tests

Required outputs:

- current `/chat/completions` path is owned by the legacy codec;
- current body-building logic is moved behind the codec boundary;
- current response parsing stays behaviorally identical;
- current model discovery path and parser remain provider / model-source-owned
  and behaviorally identical; the legacy execution codec must not absorb
  discovery.

Validation:

```bash
pnpm --filter @imagen-ps/providers test -- chat-image-provider
```

Stop rule:

- Stop and produce a Decision Packet if preserving current behavior requires
  keeping protocol inference spread across provider, builder, and parser layers
  instead of behind a codec boundary.

## Slice 2: Tighten canonical-to-wire mapping rules

Goal:

- Reduce wire-field leakage through `providerOptions` so surfaced canonical
  semantics remain the primary source of truth.

Allowed scope:

- `packages/providers/src/contract/request.ts`
- `packages/providers/src/transport/chat-image/`
- focused provider tests

Required outputs:

- documented precedence for surfaced canonical output fields versus
  provider-specific passthrough keys;
- no silent duplicate ownership where both canonical fields and raw wire fields
  can define the same behavior without deterministic precedence;
- no unconstrained spread or deep merge of `providerOptions` into codec-owned
  top-level or nested wire structures;
- explicit reserved-key handling policy for codec-owned fields plus focused
  tests for nested collisions;
- narrow contract tightening only if harness-backed and required.

Validation:

```bash
pnpm --filter @imagen-ps/providers test -- chat-image-provider
```

Stop rule:

- Stop and produce a Decision Packet if meaningful tightening would require a
  cross-package request-contract change in `packages/application` or UI changes
  to keep existing workflows usable.

## Validation

Quick:

```bash
pnpm check:policy
```

Per-slice:

```bash
pnpm --filter @imagen-ps/providers test -- registry-exports chat-image-provider
```

Final:

```bash
pnpm validate
```

Manual-only:

- none required for this Loop

Live-provider:

- out of scope for this Loop
- mock-only evidence from this Loop must not be used to claim real gateway
  compatibility for any new non-legacy protocol

Follow-up authority:

- `docs/loops/2026-07-04-next-provider-wire-planning.md`

Execution dependency:

- this Loop executes first:
  - Slice 0
  - Slice 1
  - Slice 2
- `gemini-generate-content` implementation work must start only after
  `chat-image` legacy extraction and `providerOptions` ownership tightening are
  complete

## Decision Packet triggers

Produce a Decision Packet instead of guessing when:

- the requirement splits between “one provider with multiple protocols” and
  “separate providers per protocol” and the chosen ownership is no longer
  obvious from current authority;
- adding request-codec declarations would require upper layers to branch on
  codec names;
- preserving current compatibility would require automatic cross-codec replay or
  retry multiplication for paid requests;
- canonical request tightening would break existing request-builder usage
  outside `packages/providers`.

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
