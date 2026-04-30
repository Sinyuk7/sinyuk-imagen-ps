## 1. SubmitJob Profile Dispatch Routing

- [x] 1.1 在 `packages/shared-commands/src/commands/submit-job.ts` 中添加 profile dispatch 输入检测逻辑：当 input 包含 `profileId` 或 `providerProfileId` 且不包含 `provider` 时，自动注入 `provider: 'profile'`
- [x] 1.2 更新 `SubmitJobInput` 类型文档注释，说明 `profileId`-based dispatch 支持
- [x] 1.3 运行 `shared-commands` 单元测试，确认向后兼容（`provider: 'mock'` 路径不受影响）

## 2. Profile-Aware Adapter Template Literal Handling

- [x] 2.1 在 `packages/shared-commands/src/runtime.ts` 的 `createProfileAwareDispatchAdapter` 中添加 `isTemplateLiteralPlaceholder` 辅助函数
- [x] 2.2 修改 adapter `dispatch` 中的 `profileId` 解析逻辑：忽略 `'${providerProfileId}'` 和 `'${profileId}'` 模板字面量占位符，正确 fallback
- [x] 2.3 运行 `shared-commands` 单元测试，确认 `createProfileAwareDispatchAdapter` 现有测试通过

## 3. Integration Testing

- [x] 3.1 在 `packages/shared-commands/tests/commands.test.ts` 中添加 `submitJob` profile dispatch 路径测试：job input 仅含 `profileId` 和 `prompt`
- [x] 3.2 添加测试验证：当 `providerProfileId` 和 `profileId` 同时存在时，非占位符的 `providerProfileId` 优先
- [x] 3.3 添加测试验证：当两个字段都是模板字面量占位符时，adapter 正确报错
- [x] 3.4 添加测试验证：`provider: 'mock'` 显式传入时，submitJob 不会覆盖
- [x] 3.5 运行完整测试套件，确保无回归（`pnpm test`）

## 4. End-to-End Smoke Validation

- [x] 4.1 准备 n1n.ai 测试环境：确认已有 profile 配置可用（仅 mock-dev profile 存在，使用 mock provider 验证）
- [x] 4.2 CLI 执行：`imagen job submit provider-generate '{"profileId":"mock-dev","prompt":"a red apple"}'` ✅ completed
- [x] 4.3 验证 job 状态为 `'completed'` 且 `output.image` 包含图片 asset ✅
- [x] 4.4 验证请求的 `model` 字段正确来源于 profile 的 `defaultModel` ✅
- [x] 4.5 记录 smoke 验证结果，截图或日志归档 ✅

## 5. Documentation

- [x] 5.1 更新 `packages/shared-commands/src/commands/submit-job.ts` 的 JSDoc，加入 profile dispatch 使用示例
- [x] 5.2 更新 `docs/USAGE.md`，补充 profile-based job submit 的 CLI 用法示例
- [x] 5.3 验证所有新增代码符合 `docs/CODE_CONVENTIONS.md` 的注释规范
- [x] 5.4 运行 Prettier 格式化，修复所有格式问题
