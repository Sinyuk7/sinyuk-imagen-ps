# AGENTS.md — apps/ps-uxp

## Overview

Photoshop UXP plugin: read active layer, submit job, write result as new layer. Respects UXP runtime constraints.

---

## Structure

```
src/
├── index.tsx       # UXP panel entry point
└── (TODO: adapters/, panel/, utils/)
```

---

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add panel UI | `src/panel/` | React for UXP |
| Add UXP adapter | `src/adapters/` | Implement `AssetIOAdapter` for Photoshop |
| Layer read/write | `src/adapters/` | Use Photoshop APIs with permission checks |
| Binary conversion | `src/utils/` | Memory-safe chunking for large payloads |

---

## Host Responsibilities

1. **Read active layer** → Verify single eligible layer, convert to binary
2. **Guard submission** → Reject: no document, no layer, multi-selection, unsupported type
3. **Submit job** → Via shared runtime with UXP-safe adapters
4. **Display progress** → In plugin panel
5. **Write result** → New non-destructive layer, preserve original

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

---

## Testing Notes

- Unit tests run in Node (mock UXP APIs)
- Integration tests require UXP Developer Tool
- Test guards explicitly: no-doc, no-layer, multi-select, bad-type
