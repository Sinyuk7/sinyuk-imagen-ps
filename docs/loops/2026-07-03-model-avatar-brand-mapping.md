Status: draft
Authority: current user authorization (2026-07-03)
Owner: cross-boundary slices under `packages/providers`, `packages/application`, and `apps/app`
Created: 2026-07-03

# Model Avatar Brand Mapping

## Context docs

Current authority:

- `AGENTS.md`
- `docs/agent/LOOP.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/TESTING.md`
- `apps/app/AGENTS.md`
- `packages/AGENTS.md`
- `packages/providers/AGENTS.md`
- `packages/application/AGENTS.md` (verify scope before Slice 2)

Current code references:

- `packages/providers/src/contract/image-model-capability.ts` (`ImageModelCapability`, `resolveImageModelRule`, `validateImageModelCatalog`, `providerUsesImageModelCatalog`)
- `packages/providers/src/contract/image-model-catalog/rules/image-endpoint.ts`
- `packages/providers/src/contract/image-model-catalog/rules/chat-image.ts`
- `packages/providers/src/contract/capability.ts` (`ProviderFamily`)
- `packages/providers/src/contract/model.ts` (`ProviderModelInfo`)
- `packages/providers/scripts/check-image-model-catalog.mjs`
- `packages/application/src/commands/types.ts` (re-export boundary to app)
- `apps/app/src/shared/ui/components/provider-identity.tsx`
- `apps/app/src/shared/ui/components/model-avatar-rules.ts`
- `apps/app/src/shared/ui/components/model-avatar-icon.tsx`
- `apps/app/src/shared/ui/components/generated/model-avatar-icons.ts`
- `apps/app/src/shared/ui/pages/main-page.tsx` (ProviderIdentity call sites)
- `apps/app/src/harness/components/uxp-css-contract/uxp-css-contract-harness.tsx` (ProviderIdentity call site)
- `apps/app/tests/model-avatar-rules.test.ts`
- `scripts/build-model-avatar-icons.mjs`
- `asset/model-avatar-icons/*.svg`

Scope-overlap note:

- Draft `docs/loops/2026-07-03-main-page-status-readiness.md` already claims
  `packages/providers/src/contract/image-model-capability.ts`,
  `packages/providers/src/contract/image-model-catalog/*`, and
  `apps/app/src/shared/ui/components/*`. This Loop overlaps those files. Before
  executing any slice, confirm whether this work should merge as a slice under
  the main-page-status Loop or proceed standalone. Root `AGENTS.md` declares no
  active Loop, so both are currently drafts.

## Goal

Make the provider/model avatar icon derivation follow the providers image-model
catalog as the single source of model identity, removing the parallel
substring matcher in `apps/app`, with mock-only tests proving every
picker-visible catalog rule resolves to a non-default icon.

## Non-goals

- No live provider smoke, paid billing proof, or real account balance proof.
- No real Photoshop / UXP host proof.
- No new SVG asset design beyond the single `doubao.svg` added in Slice 3.
- No change to `ProviderFamily` values or provider registry.
- No change to catalog matching semantics (`resolveImageModelRule` algorithm
  stays as-is); only a new `brand` field is read off the resolved capability.
- No change to `packages/core-engine`.
- No new icon slugs beyond `doubao`; no icon redesign for existing slugs.
- No claims that mock tests prove real Photoshop host behavior.

## Scope

Allowed implementation scope:

- `packages/providers/src/contract/image-model-capability.ts`
- `packages/providers/src/contract/image-model-catalog/rules/image-endpoint.ts`
- `packages/providers/src/contract/image-model-catalog/rules/chat-image.ts`
- `packages/providers/src/contract/index.ts` (export `ModelBrand`)
- `packages/providers/scripts/check-image-model-catalog.mjs` (brand coverage)
- focused provider tests under `packages/providers`
- `packages/application/src/commands/*` (new brand resolver + re-export)
- focused application tests under `packages/application`
- `apps/app/src/shared/ui/components/provider-identity.tsx`
- `apps/app/src/shared/ui/components/model-avatar-icon.tsx`
- `apps/app/src/shared/ui/components/generated/model-avatar-icons.ts`
- `apps/app/src/shared/ui/components/model-avatar-rules.ts` (delete or repurpose)
- new `apps/app/src/shared/ui/components/brand-to-icon.ts` (or chosen name)
- `apps/app/src/shared/ui/pages/main-page.tsx` (ProviderIdentity call sites)
- `apps/app/src/harness/components/uxp-css-contract/uxp-css-contract-harness.tsx`
- `apps/app/tests/model-avatar-rules.test.ts` (rewrite)
- `apps/app/tests/*` for focused avatar/brand coverage
- `scripts/build-model-avatar-icons.mjs`
- `asset/model-avatar-icons/*.svg` (add `doubao.svg`, delete `openapi.svg` and
  `debug-mock.svg`)

Forbidden scope:

- `packages/core-engine`
- `packages/providers/src/transport/*` (no transport behavior change)
- `packages/providers/src/providers/*` provider implementations (descriptors,
  configs, invoke)
- Photoshop / UXP host adapters
- `apps/app/src/shared/ui/styles/*` (no styling change)
- i18n message catalog (brand is an identifier, not localized copy)

## Ownership boundary

- `packages/providers`: owns `ModelBrand` type, `brand` field on
  `ImageModelCapability`, catalog rule annotation, catalog validation.
- `packages/application`: owns the brand resolver command that calls
  `resolveImageModelRule` and returns `ModelBrand | undefined`; re-exports
  `ModelBrand` through `commands/types.ts`.
- `apps/app`: owns SVG assets, `ModelAvatarIconName`, the `BRAND_TO_ICON` map,
  `ModelAvatarIcon` rendering, and the ProviderIdentity presentational
  component. Reads brand through the application command seam only; never
  imports `@imagen-ps/providers`.

## Baseline

Run before any slice:

```bash
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app test
node packages/providers/scripts/check-image-model-catalog.mjs
pnpm check:policy
```

If any baseline command fails, report it and decide whether it blocks the
slice. Do not proceed on top of a red baseline.

## Decisions (user-confirmed 2026-07-03)

1. Google brand split: keep both `nano-banana` and `google` icons. `ModelBrand`
   distinguishes `'google-gemini'` (maps to `nano-banana`) from
   `'google-other'` (maps to `google`). All current google catalog entries are
   gemini → `'google-gemini'`. `'google-other'` is reserved with no current
   catalog entries.
2. Doubao: add a new `doubao` SVG asset and a new `doubao` icon slug. Catalog
   rule `image-endpoint-doubao-seedream-5-0-260128` gets `brand: 'doubao'`,
   mapped to the `doubao` icon (not `jimeng`).
3. OpenAPI icon: historical remnant; no catalog model id contains `openapi`.
   Delete the `openapi` slug, its SVG asset, and its rule entry.
4. Mock: no provider-level special-casing. Mock provider's models flow through
   the same catalog resolution path. `providerUsesImageModelCatalog('mock')`
   returns false (mock's `providerId` is `'mock'`, not `'image-endpoint'`),
   so mock models resolve to `undefined` brand → `default` icon. Delete the
   `debug-mock` slug and its SVG asset.

5. jimeng icon: no catalog rule maps to a `jimeng` brand (doubao gets its own
   icon per decision 2). Delete the `jimeng` slug and `asset/model-avatar-icons/jimeng.svg`.
   Re-add only when a jimeng-branded catalog rule is added.
6. Scope overlap with the main-page-status draft Loop: proceed standalone and
   independent. This Loop is not merged as a slice under
   `docs/loops/2026-07-03-main-page-status-readiness.md`.

Final icon slug set after decisions: `gpt`, `nano-banana`, `google`, `qwen`,
`grok`, `doubao`, `default` (7 slugs; down from 9, with `doubao` added and
`openapi`/`debug-mock`/`jimeng` removed).

Final `ModelBrand` set: `'openai' | 'google-gemini' | 'google-other' | 'xai' | 'qwen' | 'doubao'`.

## Brand annotation table

| ruleId | brand |
|---|---|
| image-endpoint-gpt-image-2 | `openai` |
| image-endpoint-gpt-image-1 | `openai` |
| image-endpoint-dall-e-3 | `openai` |
| image-endpoint-grok-imagine-image-pro | `xai` |
| image-endpoint-grok-imagine-image | `xai` |
| image-endpoint-doubao-seedream-5-0-260128 | `doubao` |
| image-endpoint-qwen-image-2.0-2026-03-03 | `qwen` |
| image-endpoint-default | _(none, fallback)_ |
| chat-image-gemini-flash-image-preview | `google-gemini` |
| chat-image-gemini-3-pro-image | `google-gemini` |
| chat-image-gemini-3.1-flash-image | `google-gemini` |
| chat-image-openai-gpt-image-2 | `openai` |
| chat-image-default | _(none, fallback)_ |

## Brand → icon mapping (app side)

| brand | icon slug |
|---|---|
| `openai` | `gpt` |
| `google-gemini` | `nano-banana` |
| `google-other` | `google` |
| `xai` | `grok` |
| `qwen` | `qwen` |
| `doubao` | `doubao` |

## Slices

### Slice 1 — providers: add `ModelBrand` to catalog contract

Goal: add `ModelBrand` type and optional `brand` field to
`ImageModelCapability`; annotate all picker-visible curated catalog rules per
the table above; extend `validateImageModelCatalog` to require `brand` on
picker-visible non-default rules.

Allowed scope:

- `packages/providers/src/contract/image-model-capability.ts`
- `packages/providers/src/contract/image-model-catalog/rules/image-endpoint.ts`
- `packages/providers/src/contract/image-model-catalog/rules/chat-image.ts`
- `packages/providers/src/contract/index.ts`
- `packages/providers/scripts/check-image-model-catalog.mjs`
- `packages/providers/tests/*` for brand coverage

Forbidden: transport, provider implementations, `ProviderFamily` change.

Validation:

- per-slice: `pnpm --filter @imagen-ps/providers test`
- per-slice: `node packages/providers/scripts/check-image-model-catalog.mjs`
  (must print brand coverage; extend it to assert every picker-visible rule
  has a brand, or rely on `validateImageModelCatalog` for that)

Stop rule: if any picker-visible catalog rule has no clear brand assignment
(the `jimeng` gap — see Decision Packet below), stop and produce a Decision
Packet before annotating that rule.

### Slice 2 — application: brand resolver command

Goal: expose a sync command
`resolveModelBrand({ providerId, modelId }): ModelBrand | undefined` that
returns `undefined` when `providerUsesImageModelCatalog(providerId)` is false,
otherwise returns `resolveImageModelRule(...).capability.brand`. Re-export
`ModelBrand` through `commands/types.ts` so `apps/app` can import the type
from `@imagen-ps/application`.

Allowed scope:

- `packages/application/src/commands/*` (new resolver + wiring into the
  command facade + `types.ts` re-export)
- `packages/application/tests/*` for the resolver

Forbidden: app-side code, providers contract change (Slice 1 owns that).

Validation:

- per-slice: `pnpm --filter @imagen-ps/application test`

Stop rule: if the command facade pattern requires the resolver to be async
(it should not — `resolveImageModelRule` is pure/sync), stop and produce a
Decision Packet on whether to make it async or compute brand at round-build
time instead.

### Slice 3 — app: brand→icon map, new `doubao` asset, ProviderIdentity refactor

Goal: add `asset/model-avatar-icons/doubao.svg`; remove `openapi.svg` and
`debug-mock.svg`; update `ICON_SLUGS` in `scripts/build-model-avatar-icons.mjs`
(remove `openapi`, `debug-mock`; add `doubao`); regenerate
`generated/model-avatar-icons.ts`. Add a new app-side `BRAND_TO_ICON` module
mapping `ModelBrand` → `ModelAvatarIconName`. Refactor `ProviderIdentity` to
accept an `iconName: ModelAvatarIconName` prop and drop its internal
`resolveModelAvatarIcon` call (becomes purely presentational). Update both
call sites (`main-page.tsx` and `uxp-css-contract-harness.tsx`) to resolve
brand via `services.commands.resolveModelBrand` and map to the icon slug
locally.

Allowed scope:

- `asset/model-avatar-icons/*.svg`
- `scripts/build-model-avatar-icons.mjs`
- `apps/app/src/shared/ui/components/provider-identity.tsx`
- `apps/app/src/shared/ui/components/model-avatar-icon.tsx`
- `apps/app/src/shared/ui/components/generated/model-avatar-icons.ts`
- `apps/app/src/shared/ui/components/model-avatar-rules.ts` (delete or
  repurpose; see Slice 4)
- new `apps/app/src/shared/ui/components/brand-to-icon.ts`
- `apps/app/src/shared/ui/pages/main-page.tsx`
- `apps/app/src/harness/components/uxp-css-contract/uxp-css-contract-harness.tsx`
- `apps/app/tests/*`

Forbidden: importing `@imagen-ps/providers` anywhere under `apps/app`. The
`ModelBrand` type must come from `@imagen-ps/application`.

Validation:

- per-slice: `pnpm --filter @imagen-ps/app build`
- per-slice: `pnpm --filter @imagen-ps/app test`

Stop rule: if any ProviderIdentity caller beyond the two known sites needs
icon resolution, or if `main-page` cannot reach `services.commands` at the
call sites, stop and produce a Decision Packet on where to resolve.

### Slice 4 — cleanup, test rewrite, final gate

Goal: delete `model-avatar-rules.ts` if fully replaced by `brand-to-icon.ts`
plus the application resolver; remove the `MODEL_RULES_SOURCE` constant and
the `model-avatar-rules.ts` write step from
`scripts/build-model-avatar-icons.mjs` (the script keeps generating the SVG
map only). Rewrite `apps/app/tests/model-avatar-rules.test.ts` (or its
replacement) into two groups: (a) catalog coverage — iterate
`IMAGE_MODEL_CAPABILITIES` picker-visible rules, resolve each id/prefix via
the application resolver, assert `BRAND_TO_ICON[brand]` exists and is not
`default`; (b) fallback — non-catalog providerId or unknown modelId resolves
to `default`.

Allowed scope:

- `apps/app/src/shared/ui/components/model-avatar-rules.ts` (delete)
- `scripts/build-model-avatar-icons.mjs`
- `apps/app/tests/*`

Forbidden: providers/application contract changes (owned by Slices 1–2).

Validation:

- final: `pnpm validate`
- quick: `pnpm check:policy`

Stop rule: if `pnpm check:policy` reports a boundary violation or stale
generated file, fix before claiming completion.

## Validation

| category | command | notes |
|---|---|---|
| quick | `pnpm check:policy` | Boundary + generated-file freshness. |
| per-slice | `pnpm --filter @imagen-ps/providers test` | Slice 1. |
| per-slice | `node packages/providers/scripts/check-image-model-catalog.mjs` | Slice 1 brand coverage. |
| per-slice | `pnpm --filter @imagen-ps/application test` | Slice 2. |
| per-slice | `pnpm --filter @imagen-ps/app build` | Slice 3 generated module compiles. |
| per-slice | `pnpm --filter @imagen-ps/app test` | Slice 3 + 4. |
| final | `pnpm validate` | Default closeout gate. |
| manual-only | UXP Developer Tool + Photoshop icon visual harness (`apps/app/harness/icon-visual/`) | Only if the `ModelAvatarIcon` rendering internals change; required if inline SVG mapping changes. |
| release | _(none)_ | No live provider behavior touched. |

`pnpm lint` is not a supported Loop gate per `docs/TESTING.md`.

## Decision Packet triggers

Produce a Decision Packet (A/B/C with evidence and recommendation) and stop
when:

1. **jimeng icon has no brand mapping.** RESOLVED 2026-07-03: option A — delete
   `jimeng` slug and `asset/model-avatar-icons/jimeng.svg` (decision 5).
2. **Scope overlap with the main-page-status draft Loop.** RESOLVED 2026-07-03:
   proceed standalone and independent (decision 6); not merged under
   `docs/loops/2026-07-03-main-page-status-readiness.md`.
3. **ProviderIdentity can no longer be a pure presentational component** if
   `services.commands` is not reachable at both call sites. Options: inject
   brand via `ConversationRound`; add a hook; keep a thin app-local resolver
   that calls the application command.
4. **Brand resolver must be async** per the command facade pattern. Options:
   make it async and memoize at call site; precompute brand at round-build
   time and carry it on `ConversationRound`; reject and keep it sync.
5. **A picker-visible catalog rule has no clear brand** (e.g. a future
   multi-brand rule). Stop and produce a Decision Packet before annotating.

## Completion report

The executing agent must report:

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Boundary evidence (confirm no `@imagen-ps/providers` import under
  `apps/app`):
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

## Memory note candidate

`yes: architecture` — the brand-routing boundary (providers owns `ModelBrand`,
application owns the resolver command, app owns brand→icon + SVG) is a durable
architectural fact that belongs in `docs/ENGINEERING_CONTEXT.md` or the
relevant module `AGENTS.md` once the Loop completes. Propose the writeback
after Slice 4; do not write during execution.
