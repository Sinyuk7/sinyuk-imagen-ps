## 1. Shared Helpers

- [x] 1.1 Create `src/shared/id.ts` with a lightweight unique ID generator for synthetic assets
- [x] 1.2 Create `src/shared/asset-normalizer.ts` with `createSyntheticAssets(count)` returning `Asset[]`

## 2. Provider Registry

- [x] 2.1 Create `src/registry/provider-registry.ts` implementing `ProviderRegistry` with `register`, `get`, `list`
- [x] 2.2 Add duplicate-id guard in `register()` throwing structured validation error
- [x] 2.3 Create `src/registry/builtins.ts` with `registerBuiltins(registry)` registering mock provider
- [x] 2.4 Export registry types and functions from `src/registry/index.ts`

## 3. Mock Provider

- [x] 3.1 Create `src/providers/mock/descriptor.ts` exporting `mockDescriptor: ProviderDescriptor`
- [x] 3.2 Create `src/providers/mock/config-schema.ts` with Zod schema for `MockProviderConfig` (base fields + `delayMs`, `failMode`)
- [x] 3.3 Create `src/providers/mock/request-schema.ts` with Zod schema for canonical request validation
- [x] 3.4 Create `src/providers/mock/provider.ts` implementing `Provider` interface
- [x] 3.5 Implement `describe()` returning `mockDescriptor`
- [x] 3.6 Implement `validateConfig()` using Zod schema, throwing structured error on failure
- [x] 3.7 Implement `validateRequest()` using Zod schema, throwing structured error on failure
- [x] 3.8 Implement `invoke()` with `setTimeout` delay simulation respecting `AbortSignal`
- [x] 3.9 Implement `invoke()` fixed failure mode (`failMode: { type: 'always' }`)
- [x] 3.10 Implement `invoke()` probability failure mode (`failMode: { type: 'probability', rate: number }`)
- [x] 3.11 Implement `invoke()` success path returning synthetic `Asset[]` via shared normalizer
- [x] 3.12 Ensure `invoke()` errors contain `message` and `details` mappable to `JobError`
- [x] 3.13 Export mock provider factory from `src/providers/mock/index.ts`

## 4. Provider Dispatch Bridge Adapter

- [x] 4.1 Create `src/bridge/create-dispatch-adapter.ts` with `createDispatchAdapter(args)` factory
- [x] 4.2 Implement `ProviderDispatchAdapter.dispatch(params)` calling `validateRequest` then `invoke`
- [x] 4.3 Implement error mapping in dispatch: structured provider errors → `JobError { category: 'provider' }`
- [x] 4.4 Implement error mapping in dispatch: unexpected errors → `JobError { category: 'provider' }`
- [x] 4.5 Pass `AbortSignal` through to `provider.invoke()` when available in params
- [x] 4.6 Export bridge factory from `src/bridge/index.ts`

## 5. Package Exports

- [x] 5.1 Update `src/index.ts` to export registry public surface (`ProviderRegistry`, `createProviderRegistry`, `registerBuiltins`)
- [x] 5.2 Update `src/index.ts` to export mock provider (`createMockProvider`, `mockDescriptor`)
- [x] 5.3 Update `src/index.ts` to export bridge adapter (`createDispatchAdapter`)
- [x] 5.4 Verify `pnpm --filter @imagen-ps/providers build` compiles without errors
- [x] 5.5 Verify no type errors in cross-package references to `@imagen-ps/core-engine`

## 6. Documentation & Status

- [x] 6.1 Update `packages/providers/STATUS.md` marking `implement-registry-and-mock` artifacts as in-progress or complete
- [x] 6.2 Record any spec/design deviations discovered during implementation in `STATUS.md`
