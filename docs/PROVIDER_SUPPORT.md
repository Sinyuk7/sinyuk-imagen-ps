# Provider Model Support

This document mirrors the provider image-model catalog declared in
`packages/providers/src/contract/image-model-catalog/rules/*.ts`. The catalog
is the single source of truth for which models are declared; this document
records the verification status of each declared rule.

Catalog declaration is not verification. A rule listed here has passed only the
checks cited in its row. Models that appear in provider `/models` responses but
match no catalog rule are filtered out before the picker; they are not
"supported but unverified", they are out of scope.

## Verification Levels

Levels reuse the test tiers defined in [docs/TESTING.md](docs/TESTING.md):

| Level | Meaning | Command |
|---|---|---|
| catalog | Rule is declared and the catalog harness accepts it. | `node packages/providers/scripts/check-image-model-catalog.mjs` |
| contract | Mock transport test exercises request build, response parse, or rule resolution for this rule. | `pnpm --filter @imagen-ps/providers test` |
| release | Real provider interface exercised through `*.release.test.ts`. | `pnpm test:release` |
| manual | Real Photoshop / UXP host or live provider smoke observed by a human. | Recorded here with date and command. |

`unverified` means no evidence at that level. `passed` means the cited command
was run and the rule was exercised. `n/a` means the level does not apply (for
example, default fallback rules have no real provider endpoint).

## chat-image provider

Source: `packages/providers/src/contract/image-model-catalog/rules/chat-image.ts`
Constraint strategy: `CHAT_IMAGE_DEFAULT_STRATEGY` (label-based)
Transport: `packages/providers/src/transport/chat-image/`

| ruleId | brand | displayName | match ids | catalog | contract | release | manual |
|---|---|---|---|---|---|---|---|
| chat-image-gemini-flash-image-preview | Google | Gemini 2.5 Flash Image Preview | google/gemini-2.5-flash-image-preview | passed | transport + models | unverified | unverified |
| chat-image-gemini-3-pro-image | Google | Gemini 3 Pro Image | gemini-3-pro-image, google/gemini-3-pro-image | passed | models + resolve | unverified | unverified |
| chat-image-gemini-3.1-flash-image | Google | Gemini 3.1 Flash Image | gemini-3.1-flash-image, google/gemini-3.1-flash-image | passed | models | unverified | unverified |
| chat-image-openai-gpt-image-2 | OpenAI | OpenAI GPT Image 2 | openai/gpt-image-2 | passed | models | unverified | unverified |
| chat-image-default | — | Default Chat Image Rule | (fallback) | passed | resolve | n/a | n/a |

Contract column key: `transport` = full request build and response parse in
`packages/providers/tests/chat-image-provider.test.ts`; `models` = appears in
the `discoverModels` list test; `resolve` = `resolveImageModelRule` match-kind
assertion.

## image-endpoint provider

Source: `packages/providers/src/contract/image-model-catalog/rules/image-endpoint.ts`
Transport: `packages/providers/src/transport/image-endpoint/`

| ruleId | brand | displayName | match ids | catalog | contract | release | manual |
|---|---|---|---|---|---|---|---|
| image-endpoint-gpt-image-2 | OpenAI | GPT Image 2 | gpt-image-2, chatgpt-image-latest | passed | transport + resolve | unverified | unverified |
| image-endpoint-gpt-image-1 | OpenAI | GPT Image 1 | gpt-image-1 | passed | models + rejection | unverified | unverified |
| image-endpoint-dall-e-3 | OpenAI | DALL-E 3 | dall-e-3 | passed | transport + rejection | unverified | unverified |
| image-endpoint-grok-imagine-image-pro | xAI | Grok Pro | grok-imagine-image-pro, grok-imagine-image-quality | passed | models + resolve | unverified | unverified |
| image-endpoint-grok-imagine-image | xAI | Grok | grok-imagine-image | passed | models | unverified | unverified |
| image-endpoint-doubao-seedream-5-0-260128 | ByteDance | Doubao Seedream 5.0 Lite | doubao-seedream-5-0-260128 | passed | models | unverified | unverified |
| image-endpoint-qwen-image-2.0-2026-03-03 | Alibaba | Qwen Image 2.0 | qwen-image-2.0-2026-03-03 | passed | models | unverified | unverified |
| image-endpoint-default | — | Default Image Endpoint Rule | (fallback) | passed | resolve | n/a | n/a |

Contract column key: `transport` = full request build and response parse in
`packages/providers/tests/image-endpoint-provider.test.ts`; `models` = appears
in the `discoverModels` list test; `resolve` = `resolveImageModelRule` match-kind
assertion; `rejection` = unsupported semantic output is rejected locally before
transport.

## Sync Rule

Editing
`packages/providers/src/contract/image-model-catalog/rules/*.ts` requires
updating the corresponding row in this document in the same change.
`pnpm check:policy` does not enforce this sync; it is a review-time obligation.
