# app Specification

- Status: current app contract
- Authority: root `AGENTS.md`, `../../docs/ENGINEERING_CONTEXT.md`, `STATUS.md`

## Purpose

`@imagen-ps/app` provides one shared UXP-safe React UI and app-local contract surface with two runtime shells:

- Photoshop UXP shell and adapters.
- Chrome browser shell and adapters.

Both shells consume the same shared UI, ports, view-model helpers, command facade, host image wrapper, diagnostics contract, and capability state.

## Boundaries

- Shared UI lives under `src/shared/ui` and may import only shared ports/domain and React-local code.
- Interface contracts live under `src/shared/ports`.
- App-local domain helpers and host image wrappers live under `src/shared/domain`.
- UXP IO, secureStorage, data-folder persistence, diagnostics, and Photoshop bridge code live under `src/adapters/uxp` or `src/shells/uxp`.
- Chrome File API, IndexedDB storage, browser diagnostics, and browser host port code live under `src/adapters/chrome`.
- Deterministic Photoshop-like browser scenarios live under `src/simulators/photoshop`.
- `apps/app` may call `@imagen-ps/application` commands and adapter injection hooks, but must not directly import `@imagen-ps/core-engine`, `@imagen-ps/providers`, or `@imagen-ps/cli`.

## AppServices

```ts
interface AppServices {
  readonly commands: CommandsPort;
  readonly host: HostBridge;
  readonly diagnostics?: DiagnosticsPort;
}
```

- `CommandsPort` mirrors the application/session command facade.
- `HostBridge` exposes host capabilities and host IO.
- `DiagnosticsPort` is injected by the runtime; shared UI does not import UXP log sinks.
- UI must branch on capabilities/result state, not on runtime or adapter kind.

## Host Image Contract

Host image selection and simulator/layer reads return `HostImageAsset`:

```ts
interface HostImageAsset {
  readonly asset: Asset;
  readonly metadata: HostImageMetadata;
  readonly preview: HostImagePreviewHandle;
  readonly payload: HostImagePayloadRef;
}
```

React state may keep preview handles and payload refs. Provider submissions must pass the downstream `Asset` to `@imagen-ps/application`; the app must not replace the core/application `Asset` contract.

## Runtime Notes

- UXP build output is `dist/`; UXP Developer Tool loads `dist/manifest.json`.
- Chrome build output is `dist/web/`; Chrome uses the same shared UI/ports and a deterministic Photoshop simulator.
- Chrome IndexedDB storage owns profiles, secrets, job history, and binary asset refs. `localStorage` is reserved for small developer preferences.
- Chrome real-provider execution is conditional on browser-compatible transport and provider CORS policy. Default tests use mock provider state and deterministic simulator data.

## Not Proven By Repo Tests

- Real Photoshop panel load, reload, close/reopen behavior.
- Real Photoshop layer read, mask read, file picker, or `placeEvent` behavior.
- Live provider browser calls with real credentials or network.
- Provider CORS policy for user-selected endpoints.

Repository validation for those boundaries must be reported separately as manual-only or live-provider evidence.
