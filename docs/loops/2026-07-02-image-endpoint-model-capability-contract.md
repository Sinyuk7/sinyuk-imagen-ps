# Image Endpoint Model Capability Contract

Status: draft
Authority: current user authorization on 2026-07-02
Owner: cross-boundary slices under `apps/app`, `packages/application`, and `packages/providers`
Created: 2026-07-02
No follow-up: pending

## Context docs

- Current authority: `AGENTS.md`
- Current authority: `docs/agent/LOOP.md`
- Current authority: `docs/ENGINEERING_CONTEXT.md`
- Current authority: `docs/TESTING.md`
- Current authority: `apps/app/AGENTS.md`
- Current authority: `packages/application/AGENTS.md`
- Current authority: `packages/providers/AGENTS.md`
- Related draft: `docs/loops/2026-07-01-global-generation-settings.md`
- Manual host evidence: Photoshop UXP `PluginData/logs/2026-07-02/imagen.jsonl`

## Goal

Introduce a repo-owned image-model capability contract so the app only shows
locally configured model IDs, and the same local capability data participates
in provider settings, model listing, connectivity feedback, request validation,
and request building before invalid model/size combinations reach live
transport.

## Problem summary

The current chain treats remote discovery as the primary source of model
candidates and treats output-size presets as provider-agnostic buckets.
Real Photoshop UXP evidence showed that this is insufficient:

- `gpt-image-1` failed at 2026-07-02 20:51 CST because the app sent
  `size=1536x1536` from local `2k -> 1536` mapping.
- `dall-e-3` failed immediately after because the same `2k -> 1536x1536`
  mapping is invalid for `dall-e-3`.
- later requests failed with `No endpoint candidates were available.` because
  failover/cooldown reacted to transport-classified upstream failures.
- `refresh models` and `test connection` still passed because they only proved
  `discoverModels()` reachability, not `images/generations` request validity.

The result is a product contract gap:

- the UI can offer models whose effective generation contract is unknown;
- `discoverModels()` can return many remote models that should never be
  user-selectable in this product;
- provider-specific size/aspect limits are not represented in local config;
- invalid combinations are rejected only after paid/live requests.

## Explored code paths

Current source of truth and gaps:

- `packages/providers/src/transport/image-endpoint/models.ts`
  filters `/v1/models` with heuristic `id.includes('image')` or `startsWith('dall-e')`.
- `packages/application/src/commands/profile-models.ts`
  uses `profile.models -> descriptor.defaultModels -> []`, then merges
  `profile.config.defaultModel`.
- `packages/application/src/commands/provider-profiles.ts`
  `testProviderProfile({ connect: true })` only runs `discoverModels()`;
  generate smoke is a separate opt-in layer.
- `packages/providers/src/transport/image-endpoint/build-request.ts`
  maps `2k/4k -> 1536` and then `aspectRatio=auto -> 1536x1536`.
- `packages/providers/src/transport/image-endpoint/error-map.ts`
  and `failover.ts` classify transport failures and can put endpoints into
  cooldown before the user sees another request.
- `apps/app/src/shared/ui/app-shell.tsx`
  and settings pages consume application model lists directly and use
  `profile.config.defaultModel` as the active/default selection value.

Observed contract mismatch:

- remote discovery answers `what upstream exposes`;
- the product needs `what this repo intentionally supports`.

## Non-goals

- No live provider smoke in default validation.
- No real Photoshop host IO redesign.
- No secret storage or credential-handling changes.
- No broad provider-surface redesign outside the shared model-rule contract and
  touched image-generation implementations.
- No automatic support for every remotely discovered model.
- No UI support for rendering thousands of remote model rows.
- No `packages/core-engine` job-lifecycle redesign.
- No requirement that every provider-specific capability value be decided in
  the planning slice; this Loop defines the contract and harnesses so values
  can be added safely.

## Product design target

Remote discovery must stop being the source of selectable product models.

The product should own a local model capability catalog. Discovery becomes an
auxiliary signal only.

Desired user-visible behavior:

- model pickers show only locally configured models;
- model pickers hide locally configured models when the current runtime
  discovery result does not include them;
- a model can be visible even if remote discovery returns 10,000 models;
- a remote model that is not declared locally must not become selectable just
  because `/v1/models` returned it;
- invalid `model + outputSizePreset + aspectRatio + operation` combinations
  should fail in local validation before transport;
- provider settings should distinguish:
  - remote connectivity works;
  - local catalog has selectable models;
  - chosen model is locally supported;
  - chosen model is remotely discovered or not discovered.

User decisions captured on 2026-07-02:

- custom model IDs must remain allowed as an explicit exception path;
- allowlist/catalog rules should support model-ID-based fuzzy matching, not
  exact-ID-only lookup;
- non-critical capability fields must support defaults/omission;
- capability reasoning should be model-ID-driven first, even when both
  `image-endpoint` and `chat-image` consume similar model families;
- locally described but currently undiscovered models must not be shown in
  normal picker UI;
- the canonical configuration is model-scoped and repo-scoped, not
  profile-scoped;
- provider/profile differences should be implementation overrides only, not a
  first-class planning split;
- the first implementation slice should wire the shared model-rule module into
  both `image-endpoint` and `chat-image`;
- the first catalog should be bootstrapped from the repo's current effective
  code behavior as the explicit default configuration baseline;
- custom model IDs should resolve through the same config-loading pipeline and
  fall back to default model behavior, not through scattered business `if/else`
  branches.

## Canonical design target

### 1. Local model capability catalog

Add a repo-owned capability record for each selectable model.

Illustrative shape:

```ts
type ModelMatcher = {
  readonly ids?: readonly string[];
  readonly aliases?: readonly string[];
  readonly prefixes?: readonly string[];
  readonly patterns?: readonly Array<{ readonly source: string; readonly flags?: string; readonly priority: number }>;
};

interface ImageOutputVariant {
  readonly operation: 'text_to_image' | 'image_edit';
  readonly preset: '512' | '1k' | '2k' | '4k';
  readonly aspectRatio: 'auto' | '1:1' | '16:9' | '9:16';
  readonly wireSize?: string;
  readonly useProviderAuto?: boolean;
}

interface ImageOutputConstraintStrategy {
  readonly kind: 'constraint-strategy';
  readonly sizeMultiple?: number;
  readonly maxSide?: number;
  readonly minPixels?: number;
  readonly maxPixels?: number;
  readonly maxAspectRatio?: number;
}

interface ImageModelCapability {
  readonly ruleId: string;
  readonly match: ModelMatcher;
  readonly displayName: string;
  readonly selection: {
    readonly visibleInPicker: boolean;
    readonly allowAsDefault?: boolean;
  };
  readonly appliesToFamilies?: readonly ('image-endpoint' | 'chat-image')[];
  readonly variants?: readonly ImageOutputVariant[];
  readonly constraintStrategy?: ImageOutputConstraintStrategy;
  readonly discovery?: {
    readonly requireRemotePresence?: boolean;
  };
}

interface ResolvedImageModelRule {
  readonly ruleId: string;
  readonly concreteModelId: string;
  readonly capability: ImageModelCapability;
  readonly matchKind: 'exact' | 'alias' | 'prefix' | 'pattern' | 'default';
}
```

This loop does not require these exact field names, but it does require one
local contract that can answer:

- how a rule matches a concrete model ID;
- which stable repo rule identity matched;
- which concrete model ID must be sent to the provider;
- should the model appear in UI;
- can it be saved as a profile default;
- which operations it supports;
- which semantic combinations are valid;
- which wire request should be emitted for each valid semantic combination;
- whether remote discovery is advisory or required.

Defaults policy:

- a shared default rule must be constructible from the repo's current behavior
  so the first rollout can externalize today's implicit logic before refining
  model-specific overrides;
- non-critical fields may be omitted and fall back to shared generic
  defaults;
- critical fields are the matcher and whether the rule is picker-visible;
- fields such as `maxSide`, `maxPixels`, or explicit constraint strategy should
  remain optional.

Default-resolution policy:

- every execution path should resolve a model rule through the same loader:
  `exact/fuzzy match -> explicit model rule -> shared default rule`;
- unmatched custom model IDs should therefore reuse the default rule object
  instead of triggering handwritten per-call branching;
- later model-specific improvements should mostly mean changing config data,
  not adding more runtime condition trees.

Single-source-of-truth policy:

- do not separately maintain `allowed preset`, `allowed ratio`, and
  `allowed wire sizes` as independent facts;
- for fixed-shape models, use `variants` as the only legal-combination table;
- for flexible models, use one `constraintStrategy` object instead of parallel
  preset/ratio matrices;
- validation, UI option derivation, and request building must all read from the
  same rule data.

Resolver priority policy:

- exact ID
- explicit alias
- longest prefix
- pattern by explicit priority
- shared default

Any same-priority ambiguous match for one concrete model ID is a catalog
configuration error and must fail deterministically in tests.

### 2. Discovery semantics

`discoverModels()` should no longer directly define the picker list.

Planned semantics:

- local catalog = authoritative rule source;
- remote discovery = availability filter over the local catalog;
- application picker lists = intersection of local-rule-supported models and
  remote-discovered models;
- settings/status surfaces may still expose discovery annotations for saved or
  custom models that are not currently selectable;
- raw remote-only models stay invisible unless they are declared locally.

### 3. Custom model semantics

Decision captured: custom model IDs remain supported as the only sanctioned
escape hatch outside the local curated catalog.

Planned semantics:

- curated picker models come from the local capability catalog only;
- the user may still enter or save a custom model ID explicitly;
- if a custom model ID does not match any local capability rule, the request
  runs through the shared default rule logic;
- fallback execution is best-effort only: the product does not guarantee local
  validation coverage, correct wire mapping for provider quirks, or successful
  upstream execution for unmatched custom IDs;
- unmatched custom IDs should be visibly marked as `custom / unchecked`, not
  silently treated as first-class supported models.

This preserves the user-requested escape hatch while keeping the curated
catalog meaningful.

### 4. Request validation ownership

`packages/providers` should own the rule that turns semantic output settings
into provider-valid wire parameters.

That means:

- local validation must reject unsupported `model + preset + aspect` before
  `httpRequest`;
- request builders must use capability-aware mapping rather than one shared
  generic `2k -> 1536` rule for every model;
- transport should receive already-legal combinations whenever the selected
  model is locally supported;
- unmatched custom model IDs may still use the generic fallback path and fail
  upstream; that failure is acceptable by design.

Transport error classification must also be corrected in this slice:

- upstream `400/422` invalid-request style errors must be classified as
  request-invalid, not endpoint-health failures;
- request-invalid errors must not trigger retry, failover, or cooldown;
- only network errors, timeouts, `429`, and explicitly retryable `5xx`
  categories may affect endpoint health.

### 5. Profile persistence semantics

Profile persistence should continue to store only the concrete selected/default
model identifier:

- `config.defaultModel`

Do not move model capability ownership into persisted host settings if the same
data is repo-owned and versioned in source.

### 6. Shared model rule module

Decision captured: the primary authority should be a shared repo-owned
model-rule module, not a family-first planning split.

Planned layering:

- layer 1: shared model rule resolution by exact ID and fuzzy matcher;
- layer 2: provider implementations consume the resolved model rule and apply
  it to discovery, validation, and request building;
- layer 3: provider-internal override is allowed only when a provider truly
  cannot honor the shared default mapping.

This keeps the contract centered on `model id`. `image-endpoint` and
`chat-image` should follow the same model rule by default; a provider override
is an implementation escape hatch, not the main design structure.

### 7. Config-first runtime target

The implementation target is config-first runtime resolution, not branching
logic spread across request builders and UI.

Desired shape:

- load shared model rules;
- resolve one concrete rule for the chosen model ID;
- execute validation and wire mapping from that resolved rule;
- use the shared default rule when no explicit model rule matches;
- keep provider-side overrides behind the same resolution boundary.

This means the first migration step should convert current implicit defaults
into explicit config, then move existing code to consume that config. The
steady-state goal is "change config, not branches" for most future model
support work.

### 8. Seed catalog baseline

The first seed catalog must include the currently exercised legacy paths:

- `gpt-image-1`
- `dall-e-3`

It should also explicitly decide one of:

- include `gpt-image-2` with a constraint strategy in the first slice; or
- mark `gpt-image-2` as explicitly deferred in the implementation report.

Do not silently imply broad model generality while only encoding legacy fixed
variants.

## Scope

Allowed files and areas:

- `apps/app/src/shared/ui/pages/settings-page.tsx`
- `apps/app/src/shared/ui/pages/settings-detail-page.tsx`
- `apps/app/src/shared/ui/pages/settings-add-page.tsx`
- `apps/app/src/shared/ui/hooks/*provider*`
- `apps/app/src/shared/ui/components/*`
- `apps/app/src/shared/ui/app-shell.tsx`
- `apps/app/tests/*provider*`
- `apps/app/tests/*settings*`
- `packages/application/src/commands/profile-models.ts`
- `packages/application/src/commands/provider-profiles.ts`
- `packages/application/src/commands/types.ts`
- `packages/application/src/requests/*`
- `packages/providers/src/contract/*`
- `packages/providers/src/providers/image-endpoint/*`
- `packages/providers/src/providers/chat-image/*`
- `packages/providers/src/transport/image-endpoint/*`
- `packages/providers/src/transport/chat-image/*`
- `packages/providers/tests/*`
- focused harness scripts under `apps/app/scripts/` or `packages/providers/scripts/`

Forbidden files and areas:

- `packages/core-engine/*` unless a compile-time boundary extension is proven
  necessary and explicitly re-scoped.
- UXP secret storage adapters.
- Photoshop placement contract except where request-shape validation needs the
  shared global generation settings already owned elsewhere.
- live provider credentials, live smoke automation, or paid default tests.
- broad settings redesign unrelated to model capability selection and
  validation.

## Ownership boundary

- `packages/providers` owns the shared model-rule module, discovery-to-rule
  reconciliation, model-aware request validation, and model-aware wire mapping.
- `packages/application` owns command-layer list/refresh/test semantics and
  profile save/load integration with the local capability catalog.
- `apps/app` owns picker rendering, status messaging, custom model workflow,
  and UX rules for what the user can select or save.
- `packages/core-engine` remains out of scope.

## Baseline

Before any implementation:

```bash
pnpm check:policy
```

If baseline fails, classify failures as pre-existing or Loop-caused before
continuing.

## Slices

### Slice 1: Capability contract and catalog ownership

Goal: define the repo-owned capability schema, matcher resolution, and shared
model-rule module/default fallback for touched provider implementations.

Allowed scope:

- `packages/providers/src/contract/*`
- `packages/providers/src/providers/image-endpoint/*`
- `packages/providers/src/providers/chat-image/*`
- `packages/providers/tests/*`

Validation:

```bash
pnpm --filter @imagen-ps/providers test
```

Stop rule: stop if the contract cannot express required size/aspect/request
mapping without leaking UI or host state into `packages/providers`.

### Slice 2: Application command semantics

Goal: make list/refresh/test commands use the shared model-rule module as
authoritative selection state and remote discovery as runtime filtering.

Allowed scope:

- `packages/application/src/commands/profile-models.ts`
- `packages/application/src/commands/provider-profiles.ts`
- `packages/application/src/commands/types.ts`
- focused application tests

Validation:

```bash
pnpm --filter @imagen-ps/application test
```

Stop rule: stop if command semantics need React/UI state or direct transport
ownership.

### Slice 3: UI selection and status contract

Goal: change settings/main-page model pickers so they show only local catalog
models and surface discovery/support status clearly.

Allowed scope:

- `apps/app/src/shared/ui/*`
- app tests and deterministic harnesses

Validation:

```bash
pnpm --filter @imagen-ps/app test
```

Stop rule: stop if the UI slice needs to infer provider transport rules that
should live in `packages/providers`.

Acceptance additions:

- UI should disable or hide invalid semantic choices before submit where
  possible, using the same resolved rule data as provider validation;
- provider validation remains the final guard even when UI pre-disables
  impossible combinations.

### Slice 4: Model-aware request validation and wire mapping

Goal: prevent invalid `model + preset + aspect` combinations from reaching live
transport, replace generic size mapping where needed, and prevent invalid
request errors from poisoning endpoint health.

Allowed scope:

- `packages/providers/src/transport/image-endpoint/*`
- `packages/providers/src/transport/chat-image/*`
- `packages/application/src/requests/*`
- focused provider/application tests

Validation:

```bash
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test
```

Stop rule: stop if provider-aware mapping requires app-owned UI logic or
profile persistence semantics outside approved scope.

Acceptance additions:

- request-invalid upstream errors do not trigger retry, failover, or cooldown;
- the next legal request may immediately reuse the same endpoint.

### Slice 5: Harnesses and policy checks

Goal: add deterministic checks that keep the catalog and request mapping from
drifting silently.

Allowed scope:

- `packages/providers/tests/*`
- `apps/app/tests/*`
- one focused script under `packages/providers/scripts/` or `apps/app/scripts/`

Validation:

```bash
pnpm test
```

Stop rule: stop if the harness depends on live provider traffic or real
Photoshop proof.

## Harness design target

Required deterministic coverage:

- provider catalog contract test:
  - every visible model has non-empty capability declarations;
  - no ambiguous matcher ordering for the same concrete model ID;
  - declared request mappings are internally consistent.
- provider request validation test:
  - `gpt-image-1 + 2k + auto` rejects locally before transport;
  - the rejection asserts `httpRequest` call count is `0`;
  - `gpt-image-1 + 1k + auto` passes;
  - `dall-e-3 + 2k + auto` rejects locally before transport;
  - at least one supported `dall-e-3` combination passes with asserted full
    wire body.
- provider fallback test:
  - unmatched custom model IDs bypass strict curated validation and use the
    shared default rule with explicit status.
- transport health test:
  - upstream invalid-size `400/422` style failure returns request-invalid;
  - it does not try the next endpoint;
  - it does not put the endpoint into cooldown;
  - a later legal request can still use the same endpoint immediately.
- application command test:
  - remote discovery returning 10,000 models still yields only local catalog
    models in list results.
- app UI test:
  - settings detail page and main page show only local catalog models;
  - unsupported saved/default models render explicit status instead of silently
    disappearing.
- resolver contract test:
  - resolved value distinguishes `ruleId` from `concreteModelId`;
  - same-priority fuzzy double-match is a deterministic failure.
- compatibility harness script:
  - read the shared model-rule module and print/validate effective selectable
    models per provider implementation;
  - fail fast on impossible mappings or missing declarations.

Optional but useful harness:

- Chrome deterministic test-harness scenario where `/v1/models` returns a huge
  remote list including unsupported IDs, proving the UI remains stable and only
  shows the local subset.

## Validation

Quick:

```bash
pnpm check:policy
```

Per-slice:

```bash
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app test
```

Final:

```bash
pnpm validate
```

Manual-only:

- none required for the planning slice;
- later implementation may still cite Photoshop UXP smoke as extra evidence,
  but not as default proof.

Live-provider:

- not part of this plan by default.

## Decision Packet triggers

Produce a Decision Packet instead of guessing when:

- the user wants arbitrary freeform model IDs but also wants deterministic
  local capability validation;
- the capability catalog needs per-endpoint differences that cannot be modeled
  as provider-internal overrides;
- one saved profile must keep a legacy unsupported model ID and there is no
  agreed degraded UX for it;
- provider API docs or code do not evidence the required capability field
  values, especially for new constraint-strategy models;
- one slice requires `packages/core-engine` changes.

## Remaining design questions for the user

No blocking product questions remain for the initial implementation slice.

## Completion report

When executing this Loop, report:

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

Yes: `architecture` if the final capability contract becomes the stable source
of truth for provider-model selection and request validation across this repo.
