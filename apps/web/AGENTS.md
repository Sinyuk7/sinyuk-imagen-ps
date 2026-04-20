# AGENTS.md — apps/web

## Overview

Browser-based job console: upload image, configure provider params, submit jobs, view results. Uses shared runtime via browser-safe adapters.

---

## Structure

```
src/
├── main.tsx        # React entry point
└── (TODO: components/, hooks/, adapters/)
```

---

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Add UI component | `src/components/` | React + TypeScript |
| Add browser adapter | `src/adapters/` | Implement `AssetIOAdapter` for browser |
| Wire runtime | `src/hooks/` | Subscribe to engine store/events |
| Add form validation | `src/components/` | Schema-driven from provider contract |

---

## Host Responsibilities

1. **Upload input image** → Convert to `ArrayBuffer/Uint8Array`
2. **Render provider params** → From provider's `inputSchema`
3. **Local validation** → Block invalid submission BEFORE job creation
4. **Submit job** → Assemble valid `JobRequest`, call engine
5. **Display status** → Subscribe to lifecycle events
6. **Render result** → Show completed output assets

---

## Browser Adapter Contract

```ts
// Browser-specific AssetIOAdapter
interface BrowserAssetAdapter extends AssetIOAdapter {
  // Use File API, Blob, createObjectURL internally
  // Return ArrayBuffer/Uint8Array to shared runtime
}
```

---

## Critical Rules

### Separation of Concerns
- **NO** engine logic in components (use hooks)
- **NO** provider-specific UI assumptions (render from schema)
- **NO** cross-provider field normalization

### Error Handling
- **Local validation errors** → Block submission, show form errors
- **Runtime failures** → Display from `JobError`, don't conflate with preview errors
- **Preview failures** → Job stays `completed`, surface separately

### State Flow
```
Browser state (local) → JobRequest → Engine store → Events → UI update
```

---

## Anti-Patterns

- Hard-coded provider fields → Use `inputSchema` to render
- Mixing preview failure with job failure → Keep distinct
- Direct engine store mutation → Subscribe only, never write
- Using `fetch` without error handling → Always structured errors

---

## Dependencies

- `@imagen-ps/core-engine` — Shared types + error factories
- React + Vite
- No server-side rendering in v1
