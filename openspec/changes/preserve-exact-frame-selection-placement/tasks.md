## 1. Contract Tests

- [x] 1.1 更新 `apps/app/tests/shared/domain/photoshop-placement.contract.test.ts`，把“unverifiable exact-frame output downgrades to document-only”改为“有效 `exact-frame` 保留 frame intent”。
- [x] 1.2 在 domain contract 中覆盖 `actualOutputSize` 缺失、provider-default/无 `outputSelection`、explicit pixels mismatch、ratio-resolution match/mismatch 都不因输出尺寸降级。
- [x] 1.3 更新 `apps/app/tests/adapters/uxp/photoshop-host-bridge.write.contract.test.ts`，断言 `exact-frame` 在 `1024x1024`、`2048x2048`、explicit mismatch asset 下都会调用 `scalePlacedLayer()` 和 `translatePlacedLayer()`。
- [x] 1.4 增加 host telemetry 断言：成功置入时 `placement:"exact-frame"`，包含 `assetWidth/assetHeight` 与 frame-transform bounds，且不会仅因输出尺寸 mismatch 记录 `requestedPlacement:"exact-frame"` + `placement:"document-only"`。

## 2. Placement Semantics

- [x] 2.1 修改 `apps/app/src/shared/domain/photoshop-placement.ts`，让输出尺寸不可验证或不匹配不再把有效 `ExactFramePlacementIntent` 转为 `DocumentOnlyPlacementIntent`。
- [x] 2.2 保留 `matchPlacementIntent()` / `resolvePlacementTarget()` 的 document identity、dimension drift、ambiguous document、active-document fallback 安全边界。
- [x] 2.3 若仍需要 request/output conformance 判断，将其拆成 diagnostics helper 或 telemetry attrs，不参与 placement authority 决策。

## 3. Host Bridge Integration

- [x] 3.1 调整 `apps/app/src/adapters/uxp/photoshop-host-bridge.ts` 的 `placeAssetOnCanvas()`，确保 resolved `exact-frame` 进入 `transformActivePlacedLayer()`。
- [x] 3.2 确认 `usedActiveDocumentFallback` 时不会应用 captured `placementRect` transform。
- [x] 3.3 确认 `document-only` 与 `unbound` placement 行为不变，特别是 `unbound` 的 intrinsic-size normalization。

## 4. Validation

- [x] 4.1 运行 targeted domain suite：`pnpm --filter @imagen-ps/app exec vitest run tests/shared/domain/photoshop-placement.contract.test.ts`。
- [x] 4.2 运行 targeted UXP host suite：`pnpm --filter @imagen-ps/app exec vitest run tests/adapters/uxp/photoshop-host-bridge.write.contract.test.ts`。
- [x] 4.3 运行 app UXP gate：`pnpm test:uxp`。
- [ ] 4.4 运行 repo gate：`pnpm validate`。
