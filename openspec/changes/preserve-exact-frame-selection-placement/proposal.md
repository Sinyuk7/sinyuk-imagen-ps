## Why

选区或图层框选来源的 `exact-frame` 表示用户明确要求把生成结果放回捕获时的画布框内。当前实现会在实际输出尺寸不可验证或与请求尺寸不一致时把 `exact-frame` 降级为 `document-only`，导致 Photoshop 仅执行普通置入而不做 scale/translate，结果偏离用户选区。

## What Changes

- 将 Photoshop 手动置入语义改为：只要 capture 产生了有效 `placementRect` 且目标文档仍可强匹配，就必须保留 `exact-frame` 并把结果变换到该框。
- 停止把“输出尺寸不可验证、provider-default、或 provider 返回非预期像素尺寸”作为 `exact-frame` 降级到 `document-only` 的理由。
- 保留文档匹配、文档尺寸漂移、ambiguous/weak reopened document 等安全边界；目标文档不可信时仍不得盲目写入旧坐标。
- 为输出尺寸与请求配置不一致的情况增加可诊断证据，而不是改变 placement intent。
- 更新 placement contract tests 与 UXP host write tests，覆盖 selection/layer exact-frame 在 `1024x1024`、`2048x2048`、unknown expected size 等输出下都执行 transform。
- 不处理任务 history 中 `running` 未闭环、`executionJobId` 缺失、或 session queue lifecycle 问题；这些属于独立 change。

## Capabilities

### New Capabilities
- `photoshop-exact-frame-placement`: 定义 Photoshop capture 后手动置入生成资产时，`exact-frame` placement 的保留、变换、降级边界与诊断要求。

### Modified Capabilities

## Impact

- Affected code:
  - `apps/app/src/shared/domain/photoshop-placement.ts`
  - `apps/app/src/adapters/uxp/photoshop-host-bridge.ts`
  - placement / host bridge contract tests under `apps/app/tests`
- Affected behavior:
  - 选区、layer bounds、或其他有效 `placementRect` 来源的结果会被拉伸/平移到原框内。
  - provider 返回尺寸不再决定是否执行 `exact-frame` transform。
- No provider API, model config schema, task history schema, or durable queue contract changes.
