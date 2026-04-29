## 1. 基础设施：Smoke 测试框架搭建

- [x] 1.1 创建 `apps/cli/tests/smoke/` 目录结构
- [x] 1.2 在 `apps/cli/package.json` 新增 `test:smoke` script：`IMAGEN_RUN_SMOKE=1 vitest run tests/smoke/`
- [x] 1.3 创建 `apps/cli/tests/smoke/setup.ts`：实现 env var 检查与条件跳过逻辑（`describe.skipIf`），读取 `IMAGEN_SMOKE_OPENAI_API_KEY` / `IMAGEN_SMOKE_OPENAI_BASE_URL`
- [x] 1.4 确保默认 `pnpm test` 不触发 smoke 测试（smoke 目录不在 vitest 默认 include 中，或通过 `IMAGEN_RUN_SMOKE` 守卫）

## 2. Model 传递验证（无需真实网络）

- [x] 2.1 创建 `apps/cli/tests/smoke/model-pass-through.test.ts`：直接 import `buildRequestBody` 函数
- [x] 2.2 测试 explicit `providerOptions.model` 优先级最高（覆盖 defaultModel）
- [x] 2.3 测试 `defaultModel` 作为 fallback（无 explicit model 时）
- [x] 2.4 测试硬编码 fallback `'dall-e-3'`（无 explicit model 且无 defaultModel 时）
- [x] 2.5 测试 `providerOptions` 中其他字段（如 `response_format`）正确 pass-through

## 3. 端到端 Smoke 测试（需要真实网络，opt-in）

- [x] 3.1 创建 `apps/cli/tests/smoke/end-to-end.test.ts`：使用 in-memory adapter 构建测试上下文
- [x] 3.2 实现 `createSmokeProfile()` helper：通过 env var 创建 `openai-compatible` profile + secret
- [x] 3.3 测试：有效凭证 → `submitJob` 返回 `{ ok: true }`，job status `'completed'`，output 包含 Asset[]
- [x] 3.4 测试：无效 API key → job status `'failed'`，error category `'provider'`
- [x] 3.5 测试：profile 设置 `defaultModel` → job submit 使用该 model（通过检查 raw response 或 mock transport 验证）
- [x] 3.6 测试：job input 中 explicit `providerOptions.model` 覆盖 profile `defaultModel`
- [x] 3.7 设置合理的 timeout（30s），处理网络不可用或限流场景

## 4. 文档更新

- [x] 4.1 在 `apps/cli/README.md` 新增 "Smoke Testing" 章节
- [x] 4.2 文档包含手动 smoke 命令序列：`profile save` → `profile set-default-model` → `job submit`（使用真实文件 adapter）
- [x] 4.3 文档包含 explicit `providerOptions.model` override 示例
- [x] 4.4 文档标注所需环境变量（`IMAGEN_SMOKE_OPENAI_API_KEY` / `IMAGEN_SMOKE_OPENAI_BASE_URL` / `IMAGEN_RUN_SMOKE`）

## 5. 验证

- [x] 5.1 运行 `pnpm test` 确认 smoke 测试被跳过，不影响现有测试
- [x] 5.2 运行 `pnpm --filter @imagen-ps/cli test:smoke`（不设 env var）确认所有 smoke 测试被跳过
- [x] 5.3 （可选）设置真实 API 凭证后运行 `IMAGEN_RUN_SMOKE=1 pnpm --filter @imagen-ps/cli test:smoke` 验证端到端通过
