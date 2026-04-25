## 1. Builtin Contract Alignment

- [x] 1.1 收敛 `packages/workflows/src/builtins/provider-generate.ts` 与 `provider-edit.ts` 的代码注释，明确当前稳定字段、稳定输出 key 和 tentative 字段边界
- [x] 1.2 保持 `provider-generate` 与 `provider-edit` 的最小 request binding 只覆盖当前稳定 happy path，不额外承诺 `maskAsset`、`output`、`providerOptions`

## 2. Specification And Module Docs

- [x] 2.1 更新 `openspec/changes/stabilize-builtin-request-contract/specs/builtin-workflow-contract/spec.md`，显式写出 tentative 字段不属于当前稳定 contract
- [x] 2.2 更新 `packages/workflows/SPEC.md`，使“当前公开面”和 contract 边界与代码现实一致
- [x] 2.3 更新 `packages/workflows/STATUS.md`，让 Change 1 与 Change 2 在最小 bridge 验证和更完整跨包验证上的分工一致

## 3. Verification

- [x] 3.1 更新 `packages/workflows/tests/builtins.test.ts`，断言 `provider-generate` / `provider-edit` 的稳定 binding 字段与 `image` 输出 key
- [x] 3.2 在 `packages/workflows/tests` 中增加最小 bridge 兼容 happy path，使用 `mock provider` 的真实 dispatch adapter 验证 workflow request shape 可被消费
- [x] 3.3 运行 `pnpm --filter @imagen-ps/workflows build` 与 `pnpm --filter @imagen-ps/workflows test`，确认 contract 收敛后仍通过包级验证
