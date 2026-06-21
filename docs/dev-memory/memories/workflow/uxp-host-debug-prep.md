# UXP host debug preparation

- Context: `apps/app` is ready for the next manual Photoshop / UXP host smoke gate. Default repo validation remains mock-only and does not prove real Photoshop host IO.
- Scope owner: `apps/app`.
- Entry artifact: build `apps/app/dist/`, then load `apps/app/dist/manifest.json` in UXP Developer Tool.
- Do not record a host smoke as passed until Photoshop + UXP Developer Tool has loaded the panel and the manual checks below have been executed.

## Required local prerequisites

1. Latest supported Photoshop installed through Creative Cloud Desktop.
2. UXP Developer Tool installed through Creative Cloud Desktop.
3. UXP Developer Mode enabled. UXP Developer Tool can prompt for this; manual fallback is the Adobe Developer Tool settings file:

```json
{"developer": true}
```

4. Repo JavaScript toolchain available:

```sh
node -v
pnpm -v
corepack --version
```

The root `package.json` pins `pnpm@9.15.4`; use the pinned package manager behavior when possible.

## Local inspection commands

Use these as current-state checks. Do not hard-code one machine's output as project state.

```sh
find /Applications /Applications/Utilities -maxdepth 5 \
  \( -iname '*Photoshop*.app' -o -iname '*UXP*Developer*.app' -o -iname '*Creative Cloud*.app' \) \
  -print 2>/dev/null | sort

defaults read '/Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app/Contents/Info' \
  CFBundleShortVersionString 2>/dev/null || true

test -f '/Library/Application Support/Adobe/UXP/Developer/settings.json' \
  && sed -n '1,80p' '/Library/Application Support/Adobe/UXP/Developer/settings.json' \
  || echo 'NO_UXP_DEVELOPER_SETTINGS'
```

## Project build and load flow

```sh
pnpm --filter @imagen-ps/app build
```

Load this file in UXP Developer Tool:

```text
apps/app/dist/manifest.json
```

Development watch flow:

```sh
pnpm --filter @imagen-ps/app dev
```

Then use UXP Developer Tool reload/watch against the same `dist/manifest.json` artifact.

## Manifest facts to verify

Current `apps/app/public/manifest.json` uses:

- `manifestVersion: 5`
- `main: "index.html"`
- Photoshop host app `PS`
- `host.minVersion: "25.0.0"`
- panel entrypoint id `imagen-ps-panel`
- `requiredPermissions.network.domains: "all"`
- `requiredPermissions.localFileSystem: "request"`

`network.domains: "all"` is a development-friendly setting, not a final provider-domain policy. Tighten it only in a dedicated manifest/network-policy slice. In Photoshop 27.7 / UXP 9.3 host smoke, `["all"]` loaded but did not grant all-domain network access; use the manifest v5 string form for the development all-domain case.

## Repeated load / CDT automation crash boundary

For native crashes during repeated UXP Developer Tool `Plugin.load`, CDT DOM
automation, or visible UI interaction, keep the proof in Photoshop / UXP. UXP
uses web-like HTML, CSS, and JavaScript, but host lifecycle, native drawing,
file/storage APIs, and Photoshop APIs are not browser behavior.

Debug in narrow host layers:

- Load/reload lifecycle without DOM interaction.
- Read-only CDT selector, style, and rect probes.
- Visible navigation actions without input mutation.
- Input mutation without provider/network commands.
- Test, Save, Refresh Models, picker, and Photoshop IO actions as separate
  host-only smokes.

For each crash or timeout, record Photoshop PID/start time, latest crash report
name/timestamp, UXP Developer Tool action, loaded `dist/manifest.json` identity,
and the last sanitized app JSONL event before changing code.

Do not use CDT `dispatchEvent()` on inputs as a substitute for user-visible
keyboard/mouse behavior after it has triggered UXP internal dispatch errors.
Use CDT read-only probes for DOM state, and use real keyboard/mouse input or a
source-level UXP design comparison before attempting another full visible
Test/Save automation run.

## Manual host smoke checklist

Run this only after UXP Developer Tool loads the plugin into Photoshop:

- Panel appears under Photoshop plugin UI and renders the React shell.
- Console shows no startup error from `require('photoshop')` / `require('uxp')` module resolution.
- Settings can create, save, reload, and delete a provider profile.
- API key write-only input stores through UXP `secureStorage`; it must not appear in ordinary profile JSON, logs, job records, or UI readback.
- Model refresh / provider test works for a configured real provider.
- `listLayers()` returns the active document layer tree.
- `readLayerAsAsset()` can read a selected layer through Photoshop imaging and disposes image data.
- `pickImageFile()` opens the UXP picker and reads binary file data.
- `submitJob()` can complete a provider-generate or provider-edit flow using a real profile.
- `placeAssetOnCanvas()` writes a generated asset into the active Photoshop document.
- Durable job history and asset refs survive panel reload / Photoshop restart through UXP data-folder backed adapters.

## Known implementation-sensitive host paths

- `src/host/uxp-api.ts` resolves host modules through UXP `require('photoshop')` and `require('uxp')`.
- `src/host/create-plugin-host-shell.ts` is the composition root for UXP profile repository, secure storage, job history, asset store, log sink, and Photoshop host bridge.
- `src/host/photoshop-host-bridge.ts` performs Photoshop host IO:
  - layer list from `photoshop.app.activeDocument.layers`
  - layer and mask read through `photoshop.imaging`
  - image file pick through `uxp.storage.localFileSystem`
  - writeback through temporary UXP file, `createSessionToken()`, `photoshop.core.executeAsModal()`, and `photoshop.action.batchPlay(placeEvent)`

## Official references checked

- Adobe Photoshop UXP Getting Started and UXP Developer Tool installation docs.
- Adobe Manifest v5 guide for `main`, `entrypoints`, `requiredPermissions.network`, and `requiredPermissions.localFileSystem`.
- Adobe UXP persistent file storage / `localFileSystem` docs for data folder, temporary folder, picker entries, and session tokens.
- Adobe UXP secure storage docs for secret-like key/value storage.
- Adobe Photoshop modal execution docs for document-modifying operations through `executeAsModal()`.

## Validation boundary

The following commands validate only the repo-side harness and packaging, not real Photoshop host behavior:

```sh
pnpm --filter @imagen-ps/app build
pnpm --filter @imagen-ps/app test
pnpm validate
```

Do not convert fake UXP tests or successful Vite build into claims that real Photoshop host IO has passed.
