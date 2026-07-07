# Repo Playbook For New Models And New Providers

Use this document only after one of the information briefs is complete.
This document is repository-specific.

## 1. Decide Change Type First

Use the briefs to classify the work:

- `Scenario A`: add one new model under an existing `ApiFormat`
- `Scenario B`: add a new protocol / new provider family / new relay boundary

Do not start from UI. Start from provider boundary ownership.

Core boundary references:

- [docs/ENGINEERING_CONTEXT.md](../ENGINEERING_CONTEXT.md)
- [packages/providers/ARCHITECTURE.md](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/ARCHITECTURE.md)
- [packages/providers/TESTING.md](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/TESTING.md)

## 2. Scenario A: Add One New Model Under Existing `ApiFormat`

### Provider-layer source of truth

Add or extend local curated rules under:

- [packages/providers/src/contract/image-model-catalog/catalog.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/src/contract/image-model-catalog/catalog.ts)
- [packages/providers/src/contract/image-model-catalog/rules/](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/src/contract/image-model-catalog)
- [packages/providers/src/contract/image-model-catalog/matrix/](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/src/contract/image-model-catalog/matrix)

Each picker-visible model rule must provide enough facts for:

- identity matching
- `displayName`
- `brand`
- provider applicability
- picker/default eligibility
- output capability truth
- output exposure
- output matrix projection
- edit-input capability when relevant
- optional discovery policy

Repo contracts that consume those facts:

- `listLocalCatalogModels()` for descriptor defaults
- `listOfficialModelPresets()` for official presets
- `resolveImageModelRule()` for identity matching
- `resolveProviderResolvedOutput()` for provider-facing output payload
- `validateImageModelCatalog()` for fail-closed catalog validation

Primary file:

- [packages/providers/src/contract/image-model-capability.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/src/contract/image-model-capability.ts)

### Application follow-through

The application layer reconciles four different facts:

- remote discovery cache
- saved user model configs
- official catalog presets
- profile `selectedModelIds` / `defaultModelId`

Primary files:

- [packages/application/src/commands/profile-models.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/application/src/commands/profile-models.ts)
- [packages/application/src/commands/model-config-resolution.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/application/src/commands/model-config-resolution.ts)
- [packages/application/src/commands/model-configs.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/application/src/commands/model-configs.ts)
- [packages/application/src/commands/model-generation-preference-resolution.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/application/src/commands/model-generation-preference-resolution.ts)

Important repo-specific model identities:

- `configModelId`: saved user-facing config key
- `capabilityModelId`: local catalog identity used for capability resolution
- `wireModelId`: actual upstream model ID sent on the request

Do not collapse these three identities.

### UI / app surfaces to verify

The UI should not own model truth, but it will break if required metadata is missing.

Check:

- label fallback: `displayName -> wireModelId -> id`
- default model and selected model lists
- official preset availability in model configuration editor
- output exposure / matrix rendering

Primary files:

- [apps/app/src/shared/ui/model-info.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/apps/app/src/shared/ui/model-info.ts)
- [apps/app/src/shared/ui/pages/settings-page.tsx](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/apps/app/src/shared/ui/pages/settings-page.tsx)
- [apps/app/src/shared/ui/pages/settings-add-page.tsx](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/apps/app/src/shared/ui/pages/settings-add-page.tsx)
- [apps/app/src/shared/ui/pages/settings-detail-page.tsx](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/apps/app/src/shared/ui/pages/settings-detail-page.tsx)
- [apps/app/src/shared/ui/pages/model-configuration-page.tsx](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/apps/app/src/shared/ui/pages/model-configuration-page.tsx)

Current repo note:

- `resolveModelBrand()` exists in application, but the current app surface does not appear to actively consume that command for icon rendering yet.

## 3. Scenario B: Add New Protocol / New Provider Family

This is wider than adding one model. Treat it as a contract expansion.

### Contract surface

Extend the protocol boundary under:

- [packages/providers/src/contract/api-format.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/src/contract/api-format.ts)
- [packages/providers/src/contract/config.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/src/contract/config.ts)
- [packages/providers/src/contract/request.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/src/contract/request.ts)
- [packages/providers/src/contract/provider.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/src/contract/provider.ts)
- [packages/providers/src/contract/image-model-capability.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/src/contract/image-model-capability.ts)

Typical additions:

- new `ApiFormat`
- new `ProviderImplementationId`
- new `ProviderFamily`
- new default paths / path normalization rules
- new endpoint classification behavior
- new config union branch
- new request / resolved-output union branch, if existing kinds do not fit
- new request strategy, if existing strategies do not fit
- new provider-specific resolved output mapping, if existing output builders do not fit

### Provider implementation

Add provider-owned files under:

- `packages/providers/src/providers/<provider>/descriptor.ts`
- `packages/providers/src/providers/<provider>/config-schema.ts`
- `packages/providers/src/providers/<provider>/provider.ts`
- `packages/providers/src/providers/<provider>/index.ts`

Then register and export it through:

- [packages/providers/src/registry/builtins.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/src/registry/builtins.ts)
- [packages/providers/src/index.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/src/index.ts)

Descriptor and schema must accurately declare:

- `apiFormat`
- `family`
- supported operations
- default models, if any
- wire capability
- billing capability
- connectivity capability
- config normalization constraints

### Application follow-through

Application maps `apiFormat` to provider/catalog assumptions. Extend:

- [packages/application/src/commands/api-format-profile.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/application/src/commands/api-format-profile.ts)
- any command that branches on supported `ApiFormat`

Key requirement:

- profile `apiFormat` mapping must stay canonical and consistent with provider registry lookup.

### UI / app follow-through

When a truly new `ApiFormat` is introduced, update UI protocol surfaces too.

Check at minimum:

- apiFormat label rendering
- settings add/edit protocol options
- path editor branches
- provider capability dependent UI, such as billing, connection test, endpoint measurement

Primary files:

- [apps/app/src/shared/ui/hooks/use-provider-settings.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/apps/app/src/shared/ui/hooks/use-provider-settings.ts)
- [apps/app/src/shared/ui/components/provider-settings-sections.tsx](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/apps/app/src/shared/ui/components/provider-settings-sections.tsx)
- [apps/app/src/shared/ui/pages/settings-add-page.tsx](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/apps/app/src/shared/ui/pages/settings-add-page.tsx)
- [apps/app/src/shared/ui/pages/settings-detail-page.tsx](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/apps/app/src/shared/ui/pages/settings-detail-page.tsx)
- [apps/app/src/shared/ui/pages/main-page.tsx](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/apps/app/src/shared/ui/pages/main-page.tsx)
- [apps/app/src/shared/ui/pages/model-configuration-page.tsx](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/apps/app/src/shared/ui/pages/model-configuration-page.tsx)

## 4. Minimum Validation

### For Scenario A

Run at least:

```bash
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test
node packages/providers/scripts/check-image-model-catalog.mjs
```

Focus coverage on:

- catalog validation
- official preset generation
- output resolution
- user model config save/validation
- generation preference validation

Existing reference tests:

- [packages/providers/tests/image-output-capability.test.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/tests/image-output-capability.test.ts)
- [packages/application/src/commands/model-configs.test.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/application/src/commands/model-configs.test.ts)
- [packages/application/src/commands/model-generation-preferences.test.ts](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/application/src/commands/model-generation-preferences.test.ts)

### For Scenario B

Run at least:

```bash
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test
pnpm validate
```

Add or extend coverage for:

- provider descriptor contract
- config schema normalization
- request builder behavior
- response parsing / normalization
- model discovery, if supported
- registry / builtin registration
- application `apiFormat` mapping

If the new protocol should participate in the existing catalog harness, also update:

- [packages/providers/scripts/check-image-model-catalog.mjs](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/scripts/check-image-model-catalog.mjs)

Prefer expanding stable suites and case banks over adding many narrow one-off test files. See:

- [packages/providers/TESTING.md](/Users/sinyuk/Documents/github/sinyuk-imagen-ps/packages/providers/TESTING.md)
- [docs/TESTING.md](../TESTING.md)

## 5. Common Failure Modes

- Treating a new model as “just another string” and forgetting output capability truth
- Forgetting `requestStrategyId` compatibility with `ApiFormat`
- Collapsing `configModelId`, `capabilityModelId`, and `wireModelId`
- Adding a new provider implementation without extending `apiFormat` mapping
- Adding a new protocol but forgetting `contract/config.ts` or `contract/request.ts` unions
- Fixing provider boundary code but forgetting settings/path/billing UI branches
- Guessing unknown upstream capability instead of marking it unknown and failing closed
