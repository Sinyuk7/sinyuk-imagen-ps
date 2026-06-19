# UXP log chain host check

## Problem or context

Real Photoshop / UXP host validation was needed for the app log chain:
application runtime logging should mirror JSONL to the UXP Debug console and
append the same records under the plugin data folder at
`logs/YYYY-MM-DD/imagen.jsonl`.

## Root cause or decision

The original UXP log sink did not create the real data-folder log file because
real UXP `Entry.getEntry(name)` throws when an entry is missing. The sink only
handled the alternate "missing returns null" shape. Real UXP also requires
`storage.formats.utf8` for text file writes; passing the string `"utf8"` is not
portable in the Photoshop UXP host.

## Fix or outcome

`apps/app/src/host/uxp-log-sink.ts` now catches missing-entry throws when
creating `logs/`, the date folder, and `imagen.jsonl`, and uses the host-provided
UTF-8 format token. `apps/app/src/host/uxp-host-adapters.test.ts` now covers
folder creation and append writes through a fake that matches real UXP missing
entry behavior.

## Validation

- `pnpm --filter @imagen-ps/app test`
- `pnpm --filter @imagen-ps/app build`
- UXP Developer Tool reload of `apps/app/dist/manifest.json`
- Real Photoshop UXP Debug console capture through the local DevTools target
- Real UXP data-folder readback after two mock panel submissions
- `pnpm check:policy`
- `pnpm validate`

## Regression risk

The sink still writes fail-open and asynchronously. It appends records, but file
line order can differ from console observation if multiple writes race. Runtime
logging also currently reuses one runtime logger trace across multiple panel
commands. Future debug ergonomics should add a host-only read/export logs helper
instead of relying on manual DevTools snippets.

## Keywords

UXP, Photoshop, log sink, data folder, getDataFolder, getEntry, JSONL, append,
Debug console, `imagen.jsonl`, `createUxpLogSink`.
