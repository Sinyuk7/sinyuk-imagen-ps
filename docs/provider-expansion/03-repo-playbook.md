# Repo Playbook For New Models And Providers

Use this repository-specific playbook after the matching information brief is
complete. The product exposes named Provider integrations, not a generic API
protocol configurator.

## 1. Classify The Change

- `Scenario A`: change the curated model inventory of an existing Provider.
- `Scenario B`: add a new named Provider integration or upstream protocol.

Start from Provider ownership. Do not start by adding endpoint, protocol, auth,
billing, or model editors to the UI.

Canonical boundary references:

- [docs/ENGINEERING_CONTEXT.md](../ENGINEERING_CONTEXT.md)
- [packages/providers/ARCHITECTURE.md](../../packages/providers/ARCHITECTURE.md)
- [packages/providers/TESTING.md](../../packages/providers/TESTING.md)
- [docs/TESTING.md](../TESTING.md)

## 2. Current Product Shape

Product-visible Provider implementations are independent vertical slices:

```text
packages/providers/src/providers/
  grsai/
  gemini/
  openai/
```

Each slice owns:

```text
<provider>/
  index.ts
  models.ts
  profile-template.ts
  config-schema.ts
  descriptor.ts
  provider.ts
  transport/
```

Ownership rules:

- `models.ts` is the single source for model IDs, wire IDs, base IDs,
  capabilities, and the Provider default model.
- `profile-template.ts` is the single source for fixed endpoint, paths, auth,
  and billing defaults.
- `descriptor.ts` derives default model templates and Profile metadata from
  those two owners. It must not contain duplicate inventories.
- `provider.ts` coordinates the existing Provider contract and owns no
  Application scheduling or UI state.
- `transport/` owns Provider-specific request builders, parsers, codecs, error
  mapping, and polling.
- A shared primitive belongs in `shared/` only when at least two current
  Providers use the same semantics.
- Provider slices never import one another.

The dependency direction remains:

```text
provider contracts + shared primitives
                 -> named Provider slices
                 -> registry
                 -> application
                 -> app UI

core-engine <- application/provider execution adapter
```

The app consumes sanitized Application projections. It must not import
`@imagen-ps/providers` directly or rebuild Provider model/config truth.

## 3. Scenario A: Change An Existing Provider Model Inventory

### 3.1 Update The Owning Slice

Modify only the matching source of truth:

- [Provider catalogs](../../packages/providers/catalog/)

Every product-visible model must define enough local facts to resolve:

- stable `modelId`, `wireModelId`, and `baseModelId` identity;
- display name and brand;
- Provider applicability and request strategy;
- picker/default eligibility;
- text-to-image and image-edit input capability, when supported;
- output capability, exposure, and output matrix.

Do not add a second array in a descriptor, Application command, Composer, or
Profile page. `ProviderDescriptor.defaultModelTemplates`, Official Model
Catalog entries, Profile initialization, and UI model projections must derive
from the Provider-owned inventory.

If the upstream model needs different wire behavior, keep that mapping in the
same Provider's `transport/`. Extract shared code only when another current
Provider already needs identical behavior.

### 3.2 Preserve Profile Semantics

New Profiles atomically copy the Provider's complete default templates into
internal `UserModelConfig` rows and then become `ready`. Existing ready Profiles
are not silently backfilled or synchronized when a catalog changes. Any future
backfill is a separate product and persistence decision.

Users may select curated models and output preferences. They may not create,
edit, delete, rename, or override model wire/capability configuration.

### 3.3 Verify The Change

Update the matching Provider tests under:

```text
packages/providers/tests/providers/<provider>/
packages/providers/tests/registry/
packages/providers/tests/shared/
```

Also verify Application initialization and Composer selection behavior when the
default model or inventory changes.

Minimum gate:

```bash
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/providers build
pnpm --filter @imagen-ps/application test
node packages/providers/scripts/check-image-catalog.mjs
pnpm check:policy
```

## 4. Scenario B: Add A Named Provider Integration

Treat a new relay or official API as a named product integration with its own
request logic and Profile page. Do not route it through a generic endpoint or
protocol form.

### 4.1 Add The Provider Vertical Slice

Create `packages/providers/src/providers/<provider>/` with the standard files:

- `models.ts`: curated local inventory and default model;
- `profile-template.ts`: fixed Profile config without secrets;
- `config-schema.ts`: persisted config validation and normalization;
- `descriptor.ts`: existing `ProviderDescriptor` assembly;
- `provider.ts`: synchronous `invoke()` or the existing async lifecycle;
- `transport/`: Provider-local wire request and response logic;
- `index.ts`: narrow slice entrypoint.

Extend shared contracts only when the new Provider cannot fit them honestly.
Typical contract work may include:

- a new `ApiFormat` and canonical implementation mapping;
- a new `ProviderImplementationId` or family;
- a new request strategy or resolved-output kind;
- new capability primitives with more than one real consumer.

Keep synchronous upstream APIs as Promise-returning `invoke()` implementations.
Use `ProviderAsyncLifecycle` only for real submit/poll APIs. Core Task/Job state
remains the common asynchronous product lifecycle; do not add fake polling.

### 4.2 Register And Project The Provider

Update:

- [builtin registry](../../packages/providers/src/registry/builtins.ts);
- [Provider package exports](../../packages/providers/src/index.ts);
- Application canonical `providerId` admission and Provider surface projection;
- catalog harness inventory.

The Application surface may expose only sanitized identity, operations, model
IDs, default model, and safe connection-test capability. API keys stay in
`SecretStorageAdapter`; endpoint, paths, auth, billing, codecs, and diagnostics
must not leak through the UI projection.

Profile creation must continue through `saveProviderSurfaceProfile()` and the
existing setup path. Generation must continue through shared Application
admission, Provider Execution Adapter, and Core workflow. Do not add a
Provider-specific backend or request branch to Application/Core.

### 4.3 Add A Dedicated Product Surface

Add a named route and page under:

```text
apps/app/src/shared/ui/features/provider-profiles/<provider>/
```

Update the app-owned definitions in:

- [Provider Profile routes](../../apps/app/src/shared/ui/features/provider-profiles/routes.ts);
- Provider Picker labels/icons/i18n;
- AppShell route mounting;
- matching UI, Chrome E2E, and visual harnesses.

The page may reuse the narrow shared Profile form and frame. It must own its
Provider-specific copy and actions, while fixed config assembly remains
Provider/Application-owned.

Allowed Profile controls:

- Profile name;
- API Key visibility, replacement, and removal;
- Save, Cancel, and Delete;
- Test Connection only when the descriptor declares a no-generation, no-cost
  safe probe.

Do not restore a generic editor for `ApiFormat`, endpoint collection,
measurement, paths, auth mode, billing protocol, system instruction, wire model,
request strategy, capability matrix, remote discovery, or model CRUD.

### 4.4 Verify The Full Integration

Provider coverage must prove descriptor/config validation, model inventory,
request building, response parsing, error mapping, registry composition, and
real async lifecycle behavior when applicable. Tests must be deterministic and
must not call live APIs.

Application coverage must prove sanitized projection, atomic Profile setup,
secret cleanup, explicit `modelId` admission, and shared execution routing.

UI coverage must prove:

- `+ -> Provider Picker -> dedicated create page`;
- Profile row -> matching edit page;
- save/delete -> Provider list;
- multiple Profiles;
- field allowlist, busy/error states, key visibility, and long names;
- narrow and wide viewport rendering;
- Composer default selection and model switching.

Full gate:

```bash
pnpm --filter @imagen-ps/providers test
pnpm --filter @imagen-ps/application test
pnpm --filter @imagen-ps/app test:ui
pnpm --filter @imagen-ps/app test:chrome
pnpm --filter @imagen-ps/app test:uxp
pnpm --filter @imagen-ps/app test:visual
pnpm --filter @imagen-ps/app test:chrome-e2e -- --grep providers
pnpm --filter @imagen-ps/app build:chrome
pnpm --filter @imagen-ps/app build:uxp
node packages/providers/scripts/check-image-catalog.mjs
pnpm check:policy
pnpm validate
```

Do not drive Photoshop or UXP Developer Tool as part of this automated change.
Real credential checks remain explicit opt-in release work.

## 5. Common Failure Modes

- Adding a model to a descriptor or UI instead of the Provider's `models.ts`.
- Duplicating model, endpoint, path, auth, or billing constants across layers.
- Treating a new relay as a user-editable endpoint for an existing Provider.
- Adding a Provider slice without canonical `ApiFormat` registry mapping.
- Letting a Profile page assemble wire config or bypass Application commands.
- Showing Test Connection when validation would generate an image or incur cost.
- Reintroducing remote discovery or model CRUD for a curated inventory.
- Backfilling ready Profiles implicitly after a catalog release.
- Moving Provider-specific schemas, codecs, polling, or error mapping into
  `shared/` without a second identical consumer.
- Adding Provider-specific request parsing to Application or Core.
- Forgetting Composer explicit `modelId` selection after changing defaults.
