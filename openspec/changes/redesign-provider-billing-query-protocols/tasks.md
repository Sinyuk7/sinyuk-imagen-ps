## 1. Billing contract 重构

- [x] 1.1 删除 `packages/providers/src/contract/billing.ts` 与 `packages/providers/src/contract/config.ts` 中旧 `mode` billing shape，定义新的 source-based billing config 与 `BillingProtocolId`
- [x] 1.2 更新 `packages/providers/src/contract/provider.ts` 的 billing capability / `queryBalance()` contract，去掉按 provider descriptor 声明 protocol 的旧思路
- [x] 1.3 删除 `packages/providers/src/providers/*/descriptor.ts` 与相关 schema 中旧 `supportedModes/defaultMode/query` 结构，并让 `gemini-generate-content` 接入新的 billing config

## 2. Global protocol registry 与 provider 查询链

- [x] 2.1 新增全局 billing protocol registry，首批实现 `credits-api-key-json-v1`、`credits-token-json-v1`、`new-api-user-bearer-v1`
- [x] 2.2 抽出共享 billing transport / response parser helper，支持按 protocol 构造请求并标准化为 `ProviderBalanceSnapshot`
- [x] 2.3 重写 provider `queryBalance()` 路径，使其按 profile billing source 生成候选 protocol 并在首个成功协议处停止

## 3. Profile 保存、secret 与 hint 持久化

- [x] 3.1 重构 `packages/application` 的 billing config sanitize / normalize / validate 流程，删除旧 `billingAccessToken` 语义并引入 `billingToken`
- [x] 3.2 更新 runtime secret 解析逻辑，支持 `profile-api-key` 复用 `apiKey` 与 `billing-token` 读取 `billingToken`
- [x] 3.3 在 billing query 成功后将 `lastSuccessfulProtocolId` 写回当前 profile，并同步更新 `updatedAt`
- [x] 3.4 调整 billing cache fingerprint，确保 `lastSuccessfulProtocolId` 变化不会触发 cache invalidation

## 4. Settings UI 与 draft 改造

- [x] 4.1 删除 `apps/app` 中旧 `ProviderBillingDraft` / `BillingModeDraft` 结构，改为 source-based draft
- [x] 4.2 重写 `ProviderBillingSettings` 与 add/edit settings 页面，只暴露 `Disabled`、`Use current API key`、`Use billing token` 三种模式
- [x] 4.3 为 `Use current API key` 模式接入 `path` 字段，为 `Use billing token` 模式接入 `path`、`token`、`userId`（可选）字段
- [x] 4.4 更新 billing secret 保存、替换、移除交互，统一改用 `billingToken`

## 5. Tests 与验证

- [x] 5.1 为 protocol registry、请求构造、响应解析与 protocol fallback 顺序补充 `packages/providers` deterministic tests
- [x] 5.2 为 profile 保存、secret 解析、`lastSuccessfulProtocolId` 回写与 fingerprint 规则补充 `packages/application` tests
- [x] 5.3 为 add/edit settings billing UI、source 切换、字段校验与 token 删除/替换流程补充 `apps/app` tests
- [x] 5.4 运行与记录本次变更的 per-slice / final validation 命令
