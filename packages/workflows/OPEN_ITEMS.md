# Open Items — @imagen-ps/workflows

跨包兼容性边界问题，由 `add-provider-bridge-compatibility-tests` 测试实施过程暴露，当前通过测试夹具 workaround 绕过，需后续独立 change 修复。

---

## OI-1: `diagnostics: undefined` 导致 `assertSerializable` 失败

- **type**: confirmed_debt
- **location**: `core-engine/src/dispatch.ts` → `assertSerializable(result)`
- **evidence**: mock 与 openai-compatible provider 在 diagnostics 为空时返回 `diagnostics: undefined`，被 `assertSerializable` 以 `"Value at \"root.diagnostics\" is undefined and not serializable."` 拒绝
- **impact**: 任何通过 `createDispatchAdapter` 且 diagnostics 为空的 provider，经 `core-engine` runtime 调用时都会失败
- **next_action**: 在 provider 层统一返回 `diagnostics: null`，或在 engine 层过滤掉 `undefined` diagnostics

---

## OI-2: `Uint8Array` 导致 `deepFreeze` 抛出 TypeError

- **type**: confirmed_debt
- **location**: `core-engine/src/dispatch.ts` → `deepFreeze(snapshot)`
- **evidence**: provider 返回的 `Asset.data` 为 `Uint8Array` 时，`Object.freeze` 抛出 `"Cannot freeze array buffer views with elements"`
- **impact**: 任何返回包含 `Uint8Array` assets 的 provider，经 `core-engine` runtime 调用时都会失败
- **next_action**: 在 engine dispatch 边界跳过对 typed array 的 freeze，或在 provider 层统一归一化数据格式（如 base64 string）

---

## OI-3: workflow binding 缺失字段时不自动报错

- **type**: needs_decision
- **location**: `core-engine/src/runner.ts` → `resolveValue`
- **evidence**: job input 缺少 workflow step 绑定字段（如 `prompt`）时，`resolveValue` 保留占位符字符串（`'${prompt}'`），不抛出 validation 错误；错误延后到 provider `validateRequest` 阶段
- **impact**: workflow 层无法独立保证输入完整性；部分缺失字段场景以 provider 错误而非 workflow validation 错误暴露
- **next_action**: 在 `SPEC.md` 中显式声明"workflow binding 不承担 validation 语义"（文档修复），或在 runner 层增加缺失绑定校验（行为修复）

---

## OI-4: edit 错误 category 映射错误（`provider` vs `validation`）

- **type**: confirmed_debt
- **location**: `providers/src/bridge/create-dispatch-adapter.ts` → `toJobError`
- **evidence**: `openai-compatible` provider 在 `invoke` 阶段对 `edit` 操作抛出 validation 错误，但 invoke catch 块使用 `defaultCategory: 'provider'`，导致错误 category 为 `'provider'`
- **impact**: 调用方无法通过 `category === 'validation'` 区分请求参数问题与 provider 运行时问题
- **next_action**: 在 bridge adapter 中细化错误分类逻辑，区分 invoke 阶段的 validation 错误与运行时错误
