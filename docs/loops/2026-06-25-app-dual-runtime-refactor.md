# Loop: App Dual Runtime Refactor

## Status

Status: completed
Authority: current user authorization on 2026-06-25
Owner: `apps/app`
Created: 2026-06-25
No follow-up: Repo Completion achieved; Product Completion still requires manual Photoshop / UXP and opt-in live-provider evidence.
Context docs:

- `AGENTS.md`
- `apps/app/AGENTS.md`
- `apps/app/SPEC.md`
- `apps/app/STATUS.md`
- `docs/agent/LOOP.md`
- `docs/TESTING.md`

Reference docs, read only when the matching slice needs that context:

- `docs/ENGINEERING_CONTEXT.md` for broader repository architecture context.
- `docs/dev-memory/memories/bug/uxp-css-compat.md`
- `docs/dev-memory/memories/bug/uxp-inline-svg-icons.md`
- `docs/dev-memory/memories/workflow/uxp-host-debugging.md`

## Goal

Refactor `@imagen-ps/app` into one UXP-constrained shared React/UI and
application surface with two environment shells:

- Photoshop UXP shell and adapters.
- Chrome/browser shell and adapters.

Both runtimes must use the same `apps/app/src/shared` UI, ports, view-model
logic, image attachment path, provider commands, diagnostics contract, and
capability/result semantics. Chrome must be a real browser development harness
for provider calls, image upload, persistent profile/history state, and
deterministic Photoshop simulation.

## Non-goals

- Do not split `apps/app` into multiple workspace packages in this Loop.
- Do not change provider request semantics, provider transport normalization, or
  provider descriptors outside what is required to consume existing
  `@imagen-ps/application` commands from the browser runtime.
- Do not change `packages/core-engine` `Asset` or introduce a competing global
  asset contract that bypasses the existing application/provider image input
  contract.
- Do not create a browser-only UI or Chrome-enhanced visual variant. Chrome must
  render the same UXP-safe UI and CSS.
- Do not claim real Photoshop / UXP host behavior from Chrome, jsdom, fake UXP
  tests, or Vite builds.
- Do not add live provider tests to default CI. Real provider execution remains
  opt-in.
- Do not store provider credentials, raw logs, uploaded images, generated
  images, screenshots, or local absolute paths in git.

## Architecture Contract

Target dependency direction:

```text
shared/ui               -> shared/ports
shared/domain           -> shared/ports
adapters/uxp            -> shared/ports
adapters/chrome         -> shared/ports
simulators/photoshop    -> shared/ports
composition/uxp         -> shared/ui + shared/ports + adapters/uxp
composition/chrome      -> shared/ui + shared/ports + adapters/chrome + simulators/photoshop
shells/uxp              -> composition/uxp
shells/chrome           -> composition/chrome
```

Required target layout:

```text
apps/app/src/
  shared/
    ports/
    domain/
    ui/
  adapters/
    uxp/
    chrome/
  simulators/
    photoshop/
      scenarios/
      fixtures/
  composition/
    uxp/
    chrome/
  shells/
    uxp/
    chrome/
```

Important contract decisions:

- Interface contracts belong in `src/shared/ports`, not in `src/adapters`.
- Shared UI must not import from `src/adapters`, `src/shells`, UXP APIs,
  Photoshop APIs, browser storage, or environment-specific log sinks.
- Shells own entrypoints only. Composition modules own runtime assembly and
  disposal. Adapters implement ports and must not create the whole runtime by
  themselves.
- UXP and Chrome adapters must implement the same shared ports, but identical
  interfaces must not fake identical host capability. Static capability state
  must distinguish unsupported host features from empty Photoshop documents
  before UI calls are made; typed result errors are for real runtime failures.
- Existing `@imagen-ps/application` / `@imagen-ps/core-engine` `Asset` remains
  the downstream AIGC asset contract. App-local host image metadata may wrap it
  for UI preview and source tracking, but must submit the existing `Asset` to
  application commands.
- Chrome direct provider execution is first-priority, but only for provider
  transports proven browser-bundle-compatible and CORS-compatible. Unsupported
  provider families must surface typed browser-incompatible capability/result
  state instead of crashing or pretending support exists. Default tests must use
  mock providers or deterministic fakes; opt-in live-provider smoke is separate.
- Chrome persistent state must use IndexedDB for profiles, job history, asset
  refs, and binary image assets. `localStorage` may be used only for small,
  non-binary UI/dev preferences.
- Chrome simulator must support switchable Photoshop-like scenarios, including
  a seeded active document with at least 10 fixed image-backed layers. Simulator
  image fixtures must be generated from code, not committed as binary files.

## Scope

Allowed:

- `apps/app/src/**`
- `apps/app/tests/**`
- `apps/app/index.html`
- `apps/app/public/**`
- `apps/app/package.json`
- `apps/app/vite.base.config.ts`
- `apps/app/vite.uxp.config.ts`
- `apps/app/vite.chrome.config.ts`
- `apps/app/vite.config.ts`
- `apps/app/vitest.config.ts`
- `apps/app/tsconfig*.json`
- `apps/app/SPEC.md`
- `apps/app/STATUS.md`
- `apps/app/README.md`
- `scripts/policy/**`
- `docs/TESTING.md`
- `docs/loops/**`
- `docs/dev-memory/_inbox/**` for sanitized feasibility notes and manual result
  summaries only

Forbidden:

- `packages/providers` provider behavior, transport semantics, and descriptors,
  unless a Decision Packet is approved.
- `packages/core-engine` asset/job/runtime contracts, unless a Decision Packet
  is approved.
- `packages/application` command semantics, except app-side dependency wiring
  may continue to call the existing command facade.
- `apps/cli`.
- Real provider credentials or network-dependent default tests.
- Raw UXP PluginData JSONL, crash reports, uploaded/generated images,
  screenshots, local absolute paths, or secrets in git.

Ownership boundary:

- CLI: unchanged.
- Provider: unchanged; browser shell consumes existing application commands.
- Application: unchanged command semantics; browser/UXP adapters inject app-side
  persistence and host ports.
- Core: unchanged `Asset`, job lifecycle, and dispatch contracts.
- UXP: owns Photoshop/UXP shell, UXP storage, secureStorage, data-folder logging,
  host bridge, and manual host proof.
- Chrome: owns browser shell, IndexedDB adapters, browser file picker, browser
  diagnostics sink, and deterministic Photoshop simulator.
- Composition: owns runtime assembly, dependency injection, lifecycle handles,
  and teardown for each shell.
- Simulator: owns deterministic Photoshop-like scenarios and generated image
  fixtures used by the Chrome runtime.
- Shared app: owns UI, ports, UXP-safe CSS/components, i18n, view models,
  app-local image metadata wrappers, and capability/result handling.

## Baseline

Quick:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`
- `pnpm check:policy`

Known failing baseline:

- None currently documented for repo-side app validation.
- Real Photoshop / UXP loading and Settings Save crash behavior are separate
  manual-only gates and must not block repo-side refactor slices unless a slice
  claims host proof.

Decision if baseline fails:

- Stop and attribute the failure before restructuring.
- If the failure is unrelated to this Loop and already documented, report it and
  continue only when it cannot affect app dual-runtime attribution.

## Slices

### Slice 0: Architecture Feasibility And Decision Freeze

Goal:

- Prove browser/provider feasibility and freeze the target dependency shape
  before the large file move.

Allowed:

- `apps/app/src/shared/**`
- `apps/app/src/shells/chrome/**`
- `apps/app/src/composition/chrome/**`
- `apps/app/src/adapters/chrome/**`
- `apps/app/tests/**`
- `apps/app/package.json`
- `apps/app/vite.base.config.ts`
- `apps/app/vite.chrome.config.ts`
- `docs/loops/**`
- `docs/dev-memory/_inbox/**` for sanitized feasibility notes only

Required shape:

- Build a minimal Chrome entry that imports the existing application command
  facade and provider runtime path expected by the browser shell.
- Run the minimal browser target in real Chromium or the repository's browser
  harness with mock provider configuration.
- Check for Node-only imports, forbidden polyfills, SDK browser restrictions,
  stream/multipart/image payload behavior, timeout and `AbortSignal` behavior,
  and browser output compatibility.
- Produce a provider-family capability matrix covering at least bundle support,
  CORS expectations, auth/header behavior, streaming support, image input
  support, and direct-browser support status.
- Freeze whether Chrome provider mocks use MSW/fetch interception, an app-level
  mock transport, or a local dev proxy. MSW is the preferred high-fidelity
  option when it does not break build policy or UXP separation.

Validation:

- `pnpm --filter @imagen-ps/app build:chrome` or a temporary documented
  feasibility build command before Slice 5 scripts exist.
- Browser-harness smoke for the minimal Chrome target.
- `pnpm check:policy`

Stop:

- Stop if importing provider/application runtime into Chrome requires changes
  outside the allowed app boundary.
- Stop if the direct browser provider path is blocked by CORS, SDK, or Node API
  assumptions for required provider families. Produce a Decision Packet choosing
  browser direct mode, local bridge/backend transport, or mock-only harness for
  the incompatible families.
- Stop if provider mocking requires Service Worker or package changes that
  conflict with UXP output constraints.

Report evidence:

- Capability matrix.
- Feasibility build and browser smoke result.
- Frozen provider mock strategy.

### Slice 1: Shared Ports And Result Semantics

Goal:

- Establish `apps/app/src/shared/ports` as the app-owned contract layer for UI,
  UXP adapters, and Chrome adapters.

Allowed:

- `apps/app/src/app-services/**`
- `apps/app/src/shared/**`
- `apps/app/tests/**`
- `apps/app/SPEC.md`
- `apps/app/STATUS.md`

Required shape:

- Move or recreate `CommandsPort`, `AppServices`, app services context,
  mappers, and `HostBridge` into `shared/ports` or `shared/domain` as
  appropriate.
- Define `HostPort`, `HostResult<T>`, `HostError`, `RuntimeCapabilities`, and
  `DiagnosticsPort`.
- `RuntimeCapabilities` must be a readonly, synchronous property available at
  app-services initialization. UI must branch on capabilities before offering
  unsupported host actions. `HostError` is reserved for runtime failures such as
  host busy, cancelled file selection, IO failure, or provider/browser
  incompatibility discovered during execution.
- Define an app-local host image wrapper that keeps downstream
  `@imagen-ps/application` `Asset` intact while separating preview handles from
  binary payload materialization, for example:

  ```ts
  interface HostImageAsset {
    readonly asset: Asset;
    readonly metadata: HostImageMetadata;
    readonly preview: HostImagePreviewHandle;
    readonly payload: HostImagePayloadRef;
  }
  ```

- React state may keep preview handles and payload refs, but must not keep
  long-lived full `Uint8Array` or Base64 copies solely for thumbnails.
- Do not add a second global `AssetPayload` that replaces core/application
  `Asset`.

Validation:

- `pnpm --filter @imagen-ps/app test -- tests/main-page.test.tsx tests/mappers.test.ts tests/use-conversation.test.tsx`
- `pnpm --filter @imagen-ps/app build`

Stop:

- Stop if shared ports need to change `packages/core-engine` `Asset` or
  `packages/application` command input semantics.
- Stop if UI code needs to branch on `adapter.kind` instead of capability/result
  state.

Report evidence:

- Port files created or moved.
- Tests proving existing attachment and preview writeback seams still route
  through the host port.

### Slice 2: Move Shared UI And Remove Environment Imports

Goal:

- Move the single React UI, hooks, components, i18n, CSS, and view model helpers
  under `apps/app/src/shared` and remove all environment-specific imports from
  shared UI.

Allowed:

- `apps/app/src/ui/**`
- `apps/app/src/shared/**`
- `apps/app/tests/**`
- `apps/app/vitest.config.ts`
- `apps/app/tsconfig*.json`

Required shape:

- Move `src/ui/**` to `src/shared/ui/**`.
- Move environment-neutral helpers such as image preflight, locale, plugin app
  model, and UI mappers into `src/shared/domain/**` or equivalent.
- Replace direct `writeUxpUiCheckpoint()` / `writeUxpUiFailure()` imports with
  `DiagnosticsPort`.
- Preserve UXP-safe form controls, icon strategy, CSS compatibility tests, and
  one shared page implementation.
- Ensure shared UI has no imports from `src/adapters/**`, `src/shells/**`, or
  UXP/Photoshop/browser globals except ambient DOM types needed by React.

Validation:

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`
- `pnpm check:policy`

Stop:

- Stop if a UI behavior requires separate Chrome and UXP page files.
- Stop if Chrome-only CSS/DOM APIs are introduced into shared UI.

Report evidence:

- Import-boundary grep or policy output.
- `uxp-css-compat` still covers shared UI/CSS.

### Slice 3: UXP Adapter And Shell Extraction

Goal:

- Move existing UXP/Photoshop lifecycle and host IO into `adapters/uxp` and
  `shells/uxp`, while preserving current UXP behavior and tests.

Allowed:

- `apps/app/src/host/**`
- `apps/app/src/adapters/uxp/**`
- `apps/app/src/shells/uxp/**`
- `apps/app/src/index.tsx`
- `apps/app/public/manifest.json`
- `apps/app/tests/**`
- `apps/app/vite.base.config.ts`
- `apps/app/vite.uxp.config.ts`
- `apps/app/vite.config.ts`

Required shape:

- `shells/uxp` owns UXP entrypoint registration, panel runtime, React root
  lifecycle, UXPDT reload cleanup, startup error rendering, and host smoke
  handle exposure.
- `adapters/uxp` owns UXP module resolution, Photoshop host port, data-folder
  profile/job/asset persistence, secureStorage, UXP diagnostics sink, and UXP
  runtime dependency creation.
- UXP adapter implements `shared/ports` exactly; it must not expose raw
  Photoshop/UXP objects to shared UI.
- Keep host image preflight before passing image bytes to Photoshop native IO.

Validation:

- `pnpm --filter @imagen-ps/app test -- src/adapters/uxp/**/*.test.ts tests/index-reload.test.tsx`
- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`

Manual-only:

- Required for Product Completion, not for repo-side slice attribution: load
  `apps/app/dist/manifest.json` in UXP Developer Tools and record a sanitized
  load result.

Stop:

- Stop if UXP extraction changes provider/application/core command semantics.
- Stop before claiming Product Completion if real host proof is required but not
  run.

Report evidence:

- UXP adapter contract tests.
- Index/reload lifecycle tests.
- Whether manual host smoke was run.

### Slice 4: Chrome IndexedDB Adapter And Simulator

Goal:

- Add a Chrome/browser runtime adapter that implements the same shared ports,
  supports real browser image upload, persists app state in IndexedDB, runs
  real provider commands through the existing application layer, and provides a
  deterministic switchable Photoshop simulator.

Allowed:

- `apps/app/src/adapters/chrome/**`
- `apps/app/src/shared/**`
- `apps/app/tests/**`
- `apps/app/package.json`

Required shape:

- Browser `pickImage` uses real File API and returns a `HostImageAsset` wrapping
  the existing downstream `Asset`.
- Browser image preview uses `URL.createObjectURL(file)` or an equivalent
  browser-native preview handle and revokes it through lifecycle cleanup. Full
  bytes are read lazily when the asset is submitted, persisted, or otherwise
  materially required.
- Browser storage uses IndexedDB for profiles, job history, asset refs, and
  binary image assets. React state stores handles/refs, not long-lived binary
  blobs or Base64 copies.
- Browser diagnostics writes to console and an in-memory/retrievable recent
  record buffer. It must redact through shared/foundation redaction utilities
  when applicable.
- Browser provider calls use the same `@imagen-ps/application` commands and
  provider runtime path as UXP for provider families marked browser-compatible
  by Slice 0, with default tests using mock provider profiles.
- Browser provider mock transport should prefer MSW or equivalent fetch-layer
  interception so transport, headers, timeout, and network-error behavior are
  exercised. If Service Worker constraints or dependency policy make this
  brittle, use a Decision Packet before falling back to app-level stubs.
- Simulator supports switchable scenarios, at minimum:
  - no document;
  - empty document;
  - seeded document with at least 10 fixed image-backed layers;
  - mask-capable layer;
  - host busy;
  - file picker cancelled;
  - place asset failure.
- The 10 fixed simulator images must be zero-blob, code-backed fixtures. Generate
  them with Canvas at simulator initialization or test setup, then store them as
  deterministic Blob/ArrayBuffer records in IndexedDB or memory. They must not
  be committed as binary media files.
- Generated fixtures must cover enough variation for future host behavior:
  different aspect ratios, clear layer labels, grid/solid fills, and at least
  one alpha or mask-like transparency case.

Validation:

- `pnpm --filter @imagen-ps/app test -- tests/chrome-adapter.test.ts tests/main-page.test.tsx`
- `pnpm --filter @imagen-ps/app build`

Stop:

- Stop if browser adapter requires provider credentials in default tests.
- Stop if simulator semantics require pretending Photoshop capabilities exist
  without explicit capability/result state.
- Stop if IndexedDB implementation becomes too large for this Loop without a
  smaller contract-tested adapter boundary.
- Stop if code-backed Canvas fixtures cannot run deterministically in tests and
  browser smoke without committing binary fixtures.

Report evidence:

- Chrome file upload path creates an asset accepted by shared preview and
  submit flow.
- IndexedDB adapter persistence test.
- Scenario switch test for the 10-layer simulator.
- Provider command path test using mock provider.
- Provider fetch interception or approved mock strategy evidence.

### Slice 5: Dual Shell Build

Goal:

- Add separate UXP and Chrome shell entrypoints and build outputs while keeping
  shared UI and ports single-sourced.

Allowed:

- `apps/app/src/shells/uxp/**`
- `apps/app/src/shells/chrome/**`
- `apps/app/index.html`
- `apps/app/public/**`
- `apps/app/vite.base.config.ts`
- `apps/app/vite.uxp.config.ts`
- `apps/app/vite.chrome.config.ts`
- `apps/app/vite.config.ts`
- `apps/app/package.json`
- `apps/app/tests/bundle/**`

Required shape:

- UXP build keeps `dist/` output, manifest copy, relative assets, and classic
  script HTML transform required by UXP.
- Chrome build outputs a separate browser target such as `dist-chrome/` or
  `dist/web/`.
- Build configuration uses physical split files:
  - `vite.base.config.ts` for shared aliases/plugins/test-safe defaults;
  - `vite.uxp.config.ts` for UXP quirks and `dist/` output;
  - `vite.chrome.config.ts` for browser output.
- Avoid target-wide `process.env.TARGET` conditionals in one large Vite config.
  Small shared helpers are allowed; environment-specific build behavior belongs
  in the environment-specific config file.
- Scripts expose at least:
  - `build:uxp`
  - `build:chrome`
  - `build` running both, or an explicitly documented default if UXP remains the
    default package build.
- Browser shell can run in Chrome without Photoshop or UXP Developer Tools.
- UXP shell remains loadable by UXP Developer Tools from `apps/app/dist/manifest.json`.

Validation:

- `pnpm --filter @imagen-ps/app build:uxp`
- `pnpm --filter @imagen-ps/app build:chrome`
- `pnpm --filter @imagen-ps/app test -- tests/bundle`

Manual-only:

- Optional during this slice: open Chrome build and verify visible shared UI.
- Optional during this slice: load UXP build in UXP Developer Tools.
  UXP host proof remains required before Product Completion.

Stop:

- Stop if split Vite configs cannot express both outputs without duplicating
  large plugin graphs or introducing brittle environment globals. Produce a
  Decision Packet before falling back to a single multi-mode config.

Report evidence:

- Bundle paths.
- UXP manifest output.
- Chrome entry output.

### Slice 6: Policy, Docs, And Final Gate

Goal:

- Lock the new architecture in docs and mechanical checks, then run the final
  repository gate.

Allowed:

- `scripts/policy/**`
- `apps/app/SPEC.md`
- `apps/app/STATUS.md`
- `apps/app/README.md`
- `docs/TESTING.md`
- `docs/ENGINEERING_CONTEXT.md`
- `docs/loops/**`

Required shape:

- Update app docs to describe:
  - shared UI/ports;
  - UXP adapter/shell;
  - Chrome adapter/shell;
  - Chrome IndexedDB and simulator role;
  - real provider path priority;
  - browser provider compatibility matrix;
  - default mock-only vs opt-in live-provider validation;
  - real Photoshop proof remaining manual-only.
- Add or update policy checks so `src/shared/**` cannot import from
  `src/adapters/**`, `src/shells/**`, UXP, Photoshop, or CLI.
- Add policy checks or tests so shared UI cannot branch on environment kind.

Validation:

- `pnpm check:policy`
- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`
- `pnpm validate`

Stop:

- Stop if policy enforcement conflicts with existing legitimate shared imports;
  produce a narrow Decision Packet instead of weakening the boundary broadly.

Report evidence:

- Docs updated.
- Policy checks added.
- Final validation result.

## Validation

Quick:

- `pnpm check:policy`
- `git diff --check`

Per-slice:

- Slice-specific app tests listed above.
- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`

Final:

- `pnpm validate`

Repo Completion:

- Repo Completion requires the final repository gate above and the Chrome
  browser smoke evidence. It does not prove Photoshop host behavior.

Product Completion:

- Product Completion additionally requires real Photoshop / UXP host evidence.
  If these checks are not run, report status as `implementation complete, host
  validation pending`, not `completed`.

Manual-only Product Completion checks:

- UXP Developer Tools loads `apps/app/dist/manifest.json`.
- Photoshop panel opens, reloads, closes, and reopens.
- Settings first profile Save succeeds twice.
- Photoshop restart keeps profile state readable.
- Secret read/reinput prompt behavior is verified without recording secrets.
- Layer list, layer read, mask-capable path, place asset, cancelled operations,
  host busy behavior, diagnostics, and crash delta are checked.
- Chrome browser smoke of the browser build.
- Manual evidence must be reported separately and cannot replace repo tests.

Live-provider:

- Required by product goal for Chrome runtime capability, but opt-in only:
  browser runtime must be able to call real provider commands through configured
  profiles for provider transports marked browser-compatible by the capability
  matrix.
- Default CI and default Loop validation must not require credentials, network,
  paid APIs, or provider-specific account state.
- If a live provider smoke is explicitly authorized, record only sanitized
  provider family/profile id, result status, and retained artifact path under
  ignored local output.

## Decision Packet Triggers

- A slice needs changes to `packages/core-engine` `Asset`, job lifecycle, or
  dispatch contracts.
- A slice needs changes to provider request/transport semantics.
- Browser real-provider support requires new credential or CORS policy decisions
  outside `apps/app`.
- Browser provider/application runtime cannot bundle without unauthorized
  provider/core/application changes.
- Browser provider mocking through MSW or equivalent fetch interception conflicts
  with package policy, Service Worker constraints, or UXP output constraints.
- IndexedDB adapter cannot be made deterministic in repo-side tests.
- Chrome simulator cannot provide stable seeded image-backed layers without
  generated code-backed fixtures.
- Shared UI requires environment-specific branching or separate page files.
- Dual Vite outputs require mutually incompatible build settings.
- A claim requires real Photoshop proof but manual host validation is not run.
- Baseline validation fails and blocks attribution.

## Completion Report

- Goal executed:
- Files inspected:
- Files changed:
- Commands run:
- Result:
- Behavior changed:
- Validation evidence:
- Boundary evidence:
- Chrome runtime evidence:
- UXP runtime evidence:
- Live-provider evidence:
- Repo Completion status:
- Product Completion status:
- Risk:
- Follow-up:
- Memory note candidate:
- Decision Packet, if blocked:

## Memory Note Candidate

Record if:

- The turn produces a durable project fact in one of these categories:
  `architecture`, `decision`, `workflow`, `bug`, `manual-host-result`.

Do not record:

- Raw logs, build output, secrets, uploaded/generated images, screenshots, local
  user habits, routine passing tests, or speculative plans.
