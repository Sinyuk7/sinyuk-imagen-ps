# Open Items — @imagen-ps/workflows

跨包兼容性边界问题，由 `add-provider-bridge-compatibility-tests` 测试实施过程暴露，当前通过测试夹具 workaround 绕过，需后续独立 change 修复。

---

## OI-1: `diagnostics: undefined` 导致 `assertSerializable` 失败 ✅ resolved

- **resolution**:
  - 引擎侧：`core-engine/src/invariants.ts` → `assertSerializable` 已按 `JSON.stringify` 语义忽略对象属性中的 `undefined`，顶层与数组元素仍拒绝。
  - 契约侧：`providers/src/contract/result.ts` 注释明确约定"无诊断时省略 `diagnostics` 字段"；`mock` 与 `openai-compatible` provider 已改为构造时按需添加，不再写入 `diagnostics: undefined`，与引擎修复形成双重保障。
- **commit_scope**: `packages/core-engine/src/invariants.ts`、`packages/providers/src/contract/result.ts`、`packages/providers/src/providers/mock/provider.ts`、`packages/providers/src/providers/openai-compatible/provider.ts`
- **follow_up**: 无（已闭环）。

---

## OI-2: `Uint8Array` 导致 `deepFreeze` 抛出 TypeError ✅ resolved

- **resolution**: `core-engine/src/dispatch.ts` → `deepFreeze` 与 `assertSerializable` 均通过 `ArrayBuffer.isView` 跳过 typed array / DataView，视为不可分解的二进制载荷直通。
- **commit_scope**: `packages/core-engine/src/dispatch.ts`、`packages/core-engine/src/invariants.ts`
- **follow_up**: dispatch 边界对 buffer 内容不再承诺 immutability，调用方若需保护原始 buffer 应在 provider 内自行拷贝；workflows 跨包测试夹具中针对 OI-2 的 workaround 可移除。

---

## OI-3: workflow binding 缺失字段时不自动报错 ✅ resolved

- **resolution**: 选择行为修复 —— `core-engine/src/runner.ts` 的 `resolveValue` 现在对 `${key}` 完全匹配字符串做即时校验：命中 context 时按原始类型替换；未命中则抛出 `JobError`（`category: 'workflow'`），workflow 层即时失败，不再延后到 provider validation。
- **commit_scope**: `packages/core-engine/src/runner.ts`、`packages/core-engine/SPEC.md`
- **follow_up**: `SPEC.md` "稳定边界"已写明 binding 校验语义；workflows 跨包测试中先前依赖"占位符穿透到 provider"的用例需要更新断言（错误 category 由 `validation` 变为 `workflow`）。

---

## OI-4: edit 错误 category 映射错误（`provider` vs `validation`） ✅ resolved

- **resolution**: `providers/src/bridge/create-dispatch-adapter.ts` → `toJobError` 已改为"保留上游显式 category"策略：当 thrown 值已是结构化 `JobError` 时无条件保留其 `category`（如 invoke 阶段抛出的 `validation` 错误不再被 `defaultCategory: 'provider'` 覆盖），仅对裸 `Error` 与未知 thrown value 沿用 `defaultCategory` 推断。`workflow` / `runtime` 等其它 category 也将原样穿透，不再在 bridge 层被改写。
- **commit_scope**: `packages/providers/src/bridge/create-dispatch-adapter.ts`
- **follow_up**: workflows 跨包测试需要补充对 `edit` 操作 validation 错误的断言（`category === 'validation'` 而非 `'provider'`）。
