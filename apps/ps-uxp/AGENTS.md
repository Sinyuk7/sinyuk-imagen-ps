# AGENTS.md — apps/ps-uxp

## Overview

Photoshop UXP plugin: read active layer, submit job, write result as new layer. Respects UXP runtime constraints.

---

## Structure

```
src/
├── index.tsx                 # UXP app entry
├── app/                      # App shell, routes, top-level composition
├── ui/                       # Pure UI components, no Photoshop/runtime logic
├── features/
│   ├── main-page/            # Main page composition from UI_MAIN_PAGE.md
│   └── settings/             # Settings page composition
├── view-models/              # UI-facing models + mapping layer
├── runtime-client/           # Thin bridge to shared runtime facade
├── adapters/
│   ├── asset-io/             # Photoshop/UXP asset read/write adapters
│   └── settings-storage/     # UXP local persistence adapters
├── host/                     # Photoshop guards, permission checks, host helpers
└── utils/                    # UXP-safe low-level helpers only
```

Directory intent:

- `ui/` only solves presentation.
- `view-models/` converts shared/runtime data into UI-facing data.
- `runtime-client/` is the only place in the app layer that talks to shared runtime APIs.
- `adapters/` and `host/` hold UXP-specific IO and capability code.
- `features/` assembles screens from `ui/` + `view-models/` + adapters, but does not own business semantics.

---

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add app entry / shell | `src/app/` | Top-level composition only |
| Add main page UI | `src/features/main-page/`, `src/ui/` | Follow `docs/UI_MAIN_PAGE.md` |
| Add settings UI | `src/features/settings/`, `src/ui/` | Presentation only |
| Add UI-facing mapping | `src/view-models/` | Map shared/runtime data into UI data |
| Wire runtime facade | `src/runtime-client/` | Thin integration layer, no Photoshop API |
| Add UXP asset adapter | `src/adapters/asset-io/` | Implement `AssetIOAdapter` for Photoshop |
| Add UXP settings adapter | `src/adapters/settings-storage/` | Host-local persistence only |
| Layer read/write guards | `src/host/` | Use Photoshop APIs with permission checks |
| Binary conversion | `src/utils/` | Memory-safe chunking for large payloads |

---

## Host Responsibilities

1. **Read active layer** → Verify single eligible layer, convert to binary
2. **Guard submission** → Reject: no document, no layer, multi-selection, unsupported type
3. **Submit job** → Via shared runtime facade with UXP-safe adapters
4. **Map runtime data to UI** → Through `view-models/`, never directly in leaf UI
5. **Display progress** → In plugin panel
6. **Write result** → New non-destructive layer, preserve original

---

## Boundary Rules

### UI Layer
- `src/ui/` MUST NOT import Photoshop APIs
- `src/ui/` MUST NOT import `@imagen-ps/core-engine` directly
- `src/ui/` MUST receive only UI-facing props / view-models

### Feature Layer
- `src/features/*` composes screens from UI pieces and hooks/view-models
- `src/features/*` MUST NOT contain low-level UXP IO
- `src/features/*` MUST NOT define provider semantics

### View-Model Layer
- `src/view-models/` owns the translation from runtime/domain data to UI data
- UI should consume `conversationRounds`, `composer`, `header`, and similar UI-facing structures
- Do not pass raw runtime store objects deep into UI components

### Runtime Client Layer
- `src/runtime-client/` is the boundary to shared runtime packages
- It may know runtime contract names
- It MUST NOT know Photoshop document APIs

### Adapter / Host Layer
- `src/adapters/` and `src/host/` are the only places that touch UXP / Photoshop APIs
- All host IO must stay here
- Keep these modules explicit and side-effect-aware

---

## UXP Constraints (CRITICAL)

### String Allocation Limits
- UXP crashes on large contiguous string allocations
- **MUST** use chunked Base64 encoding for payloads >5MB
- Base64 is adapter-internal only — shared runtime uses `ArrayBuffer`

### Memory-Safe Conversion
```ts
// CORRECT: Chunked conversion
function arrayBufferToBase64Chunked(buffer: ArrayBuffer): string {
  const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
  // ... safe concatenation with yield
}

// WRONG: Single allocation (will crash on large images)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))); // CRASH
}
```

### Manifest Permissions
- Declare `network` permission for provider API calls
- Declare `localFileSystem` if needed for temp storage
- Check capabilities at runtime before operations

---

## Pre-Submission Guards

| Guard | Error Category | Message |
|-------|----------------|---------|
| No active document | `host_capability_error` | "Open a document first" |
| No active layer | `host_capability_error` | "Select a layer" |
| Multi-selection | `host_capability_error` | "Select one layer only" |
| Unsupported layer type | `host_capability_error` | "Layer type not supported" |
| Missing permission | `host_capability_error` | "Plugin needs X permission" |

---

## Result Writeback

1. Create new layer (non-destructive)
2. On success → Layer visible, original preserved
3. On writeback failure → Job stays `completed`, surface error separately
4. **NEVER** overwrite or modify source layer

---

## Anti-Patterns

- UI components importing Photoshop APIs → Move to `host/` or `adapters/`
- UI components consuming raw runtime records directly → Map in `view-models/`
- Feature modules containing binary conversion / permission logic → Move to `utils/` or `host/`
- Direct filesystem calls → Use UXP FS API via adapter
- Large single-allocation Base64 → Use chunked conversion
- Implicit document assumptions → Always verify active target
- Swallowing Photoshop errors → Surface as `host_capability_error`
- Writing to source layer → Always create new layer

---

## Dependencies

- `@imagen-ps/core-engine` — Shared types
- Photoshop UXP APIs (`photoshop`, `uxp`)
- React for panel UI

Related docs:

- `docs/BOUNDARIES.md`
- `docs/UI_MAIN_PAGE.md`
- `docs/DESIGN.md`
- `docs/TOKEN.md`

---

## Testing Notes

- Unit tests run in Node (mock UXP APIs)
- Integration tests require UXP Developer Tool
- Test guards explicitly: no-doc, no-layer, multi-select, bad-type
