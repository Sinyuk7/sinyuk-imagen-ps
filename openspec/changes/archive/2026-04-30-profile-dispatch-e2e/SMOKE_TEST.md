# Smoke Test Record — profile-dispatch-e2e

## 环境
- Date: 2026-04-30
- Profile: `mock-dev` (mock provider, openai-compatible family)
- CLI: `apps/cli/dist/index.js`

## 测试用例

### Profile-based job submit via CLI

```bash
node apps/cli/dist/index.js job submit provider-generate \
  '{"profileId":"mock-dev","prompt":"a red apple"}'
```

### 结果

- **status**: `completed` ✅
- **provider injection**: `provider: "profile"` 自动注入 ✅
- **output.image**: 包含合成 PNG asset ✅
- **model**: `"mock-image-v1"`（来自 mock-dev profile 的 `defaultModel`）✅
- **raw**: `{ mock: true, operation: "generate", prompt: "a red apple", model: "mock-image-v1" }`

### 验证结论

Profile dispatch 端到端链路已打通：
`CLI submit → submitJob(profileId) → auto-inject(provider: 'profile') → profile adapter → resolveProfileId → config resolver → mock provider → completed`

## 待补充

- [ ] 使用真实 openai-compatible provider（n1n.ai）验证 real image generation
- [ ] 验证 model discovery 后的 `setProfileDefaultModel` 确实影响 dispatch 的默认 model
