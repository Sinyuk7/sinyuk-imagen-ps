## 1. 固定产品合同、Ownership 与测试 Harness

- [x] 1.1 为 GRSAI、Gemini、GPT Image 2 建立 Provider-owned Profile template/model catalog contract，并扩展现有 Application `listProviders()` / `describeProvider()` 提供 sanitized Provider surface projection；固定 surface identity、`apiFormat`、默认 endpoint、paths、auth mode、默认 modelId 与 safe-probe visibility，先写 deterministic unit tests，UI 不直接 import `@imagen-ps/providers`，label/icon/i18n 仍由 app own。
- [x] 1.2 扩展 Provider descriptor/catalog tests，冻结 GRSAI 12 个模板、Gemini 三个官方模型且无 `nano-banana-fast`、OpenAI Images 仅 `gpt-image-2`。
- [x] 1.3 为新 Provider Picker、三种 create/edit route、字段 allowlist、多 Profile 和返回路径建立 shared UI/AppShell harness；测试先对当前旧 surface 失败。
- [x] 1.4 为新 Profile 创建直接 ready、模板初始化失败隔离、删除清理 secrets/models 和 admission 显式 modelId 建立 Application contract tests。

## 2. Provider 产品定义与静态模型

- [x] 2.1 实现三个 Provider 的 `profile-template.ts` 与 Application sanitized projection；让 app 只提交名称和 secret 输入，由通用 Application command 组装现有 `ProviderProfileInput`，不把 API Key 写入非 secret config、surface projection 或 diagnostics。
- [x] 2.2 将 Gemini `defaultModelTemplates` 收敛为 `gemini-3.1-flash-image`、`gemini-3-pro-image`、`gemini-3.1-flash-lite-image`，删除 `nano-banana-fast` 的 Gemini catalog/template 归属。
- [x] 2.3 验证 GRSAI 与 OpenAI Images descriptor inventory、request strategy 和 output capability 无需 wire 改动；修正仅与固定产品定义冲突的默认配置。
- [x] 2.4 保持 `continueProviderProfileSetup()` 与 `UserModelConfigRepository.initializeProfile()` 作为三种 Profile 的单一原子初始化路径，并删除三者可能返回模型配置页面的不可达 UI 分支。
- [x] 2.5 保持 Application 为 shared admission 唯一 owner：校验 Profile `apiFormat`、canonical implementation、显式 `modelId` 及 request strategy 一致性；页面不得绕过 Application，Provider Execution Adapter/Core 不新增重复业务分支。

## 3. Provider Vertical Slice 重组

- [x] 3.1 建立 `packages/providers/src/providers/grsai`，集中迁入 GRSAI 的 `profile-template.ts`、`config-schema.ts`、`models.ts`、`descriptor.ts`、`provider.ts` 与 submit/result polling transport；保持 `grsai-generate` implementation ID、`grsai` apiFormat、submit-once/poll/abort/remoteRef 行为不变。
- [x] 3.2 建立 `packages/providers/src/providers/gemini`，集中迁入 Gemini 的 `profile-template.ts`、`config-schema.ts`、`models.ts`、`descriptor.ts`、`provider.ts` 与 GenerateContent request/parse transport；保持 `gemini-generate-content` implementation ID 与 `x-goog-api-key` wire 行为不变。
- [x] 3.3 建立 `packages/providers/src/providers/openai-images`，集中迁入 OpenAI Images 的 `profile-template.ts`、`config-schema.ts`、`models.ts`、`descriptor.ts`、`provider.ts` 与 generation/edit codec、paid retry、response parse transport；保持 `image-endpoint` implementation ID 与 `openai-images` apiFormat 不变。
- [x] 3.4 让每个 `models.ts` 成为该 Provider modelId/wireModelId/baseModelId/capability/default model 的唯一真相源；`descriptor.defaultModelTemplates` 必须派生生成，删除 contract catalog rules、descriptor 或 app 中的重复模型数组。
- [x] 3.5 将至少两个保留 Provider 已有真实消费者且语义一致的 HTTP/retry/failover primitive 迁入 `packages/providers/src/shared/transport`，将跨 Provider capability 类型与 matrix builder 迁入 `provider catalog`；Provider-specific schema、codec、error mapping 与 polling 不得进入 shared。
- [x] 3.6 更新三个 slice 的 `index.ts`、package root barrel、builtin registry、catalog harness 与全部 import；禁止 slice 间互相 import、Application 深引 `providers/*/transport`、app 直接 import `@imagen-ps/providers`。
- [x] 3.7 将 Provider tests 镜像整理到 `tests/providers/{grsai,gemini,openai-images}`，共享 primitive 放 `tests/shared`，registry contract 放 `tests/registry`；移动 fixture 时保持 deterministic、mock-only、零真实 API 调用。

## 4. 专用 Profile UI Feature

- [x] 4.1 建立 `apps/app/src/shared/ui/features/provider-profiles`，实现 `provider-picker-page.tsx` 与 `routes.ts`；使用现有 Settings list-row/paging primitive 且只呈现 GRSAI、Gemini、GPT Image 2，`routes.ts` 不承载 protocol config。
- [x] 4.2 在 `features/provider-profiles/shared` 实现只拥有名称、API Key、key visibility、Save/Cancel 的 `profile-form.tsx` 与无业务判断的 `profile-page-frame.tsx`，支持 edit mode 的 Delete/secret replacement/removal。
- [x] 4.3 在 `features/provider-profiles/grsai` 实现 GRSAI create/edit page；只消费 Application sanitized projection，不显示 endpoint、paths、billing、system instruction、模型配置或无依据的 Test Connection。
- [x] 4.4 在 `features/provider-profiles/gemini` 实现 Gemini create/edit page；只消费 Application sanitized projection，并仅依据 `ProviderDescriptor.connectivity.connectionTest` 的投影显示 Test Connection，不按 `apiFormat` 自行判断。
- [x] 4.5 在 `features/provider-profiles/openai-images` 实现 OpenAI Images create/edit page；只消费 Application sanitized projection，不显示隐藏 wire config 或 `safe_probe_unsupported` Test Connection。
- [x] 4.6 更新 AppShell/settings route：`+` 进入 Picker，Picker 进入对应 create page，Profile row 按内部 identity 进入对应 edit page，成功保存/删除返回 Provider list 并显示 toast；AppShell 不内联 Provider-specific 表单分支。
- [x] 4.7 将 UI tests 镜像到 `features/provider-profiles` 的 Picker、shared 与三个 Provider 子目录；更新 i18n、UXP-safe styles、UI catalog 和 visual baselines，覆盖窄/宽 viewport、长 Profile 名称、API Key visibility、busy/error 与空列表状态。

## 5. 主生成模型体验

- [x] 5.1 更新 Profile/model controller：仅在当前 selection 缺失或无效时写入 Provider catalog 的显式默认 modelId，不覆盖仍有效的用户 selection，不在 app 复制静态模型数组。
- [x] 5.2 对单模型 OpenAI Images Profile 投影静态 `gpt-image-2` 当前值，不要求用户打开单选项菜单；GRSAI/Gemini 继续提供静态模型切换。
- [x] 5.3 保留 `ModelGenerationPreference` 的尺寸、比例、格式 persistence 与 capability fallback，并以 Composer/readiness tests 证明删除模型编辑 UI 不影响生成。
- [x] 5.4 保持 Provider admission、connection/profile tests 要求显式 `modelId`，验证 backend 不恢复首模型 repository fallback。

## 6. 删除旧 Provider Surface

- [x] 6.1 从 AppShell 删除 `profile-models`、`model-configuration` 和旧通用 provider-new/detail route state、editor seed、return-view 与 setup outcome 导航。
- [x] 6.2 删除 `ProfileModelsPage`、`ModelConfigurationPage`、helpers、专属 styles/tests，以及 app-facing model create/edit/delete commands 与 ports；保留内部 `UserModelConfig` initialization/resolution owner。
- [x] 6.3 删除通用 `SettingsAddPage`、通用 `SettingsDetailPage`、`ProviderProfileEditor` 和无人使用的 advanced path/billing/auth/system-instruction UI sections 与 tests。
- [x] 6.4 删除 endpoint import/detection、measurement 和仅服务旧 surface 的 hooks/commands/fakes；逐项用 CodeGraph、`rg` 和 TypeScript build 确认没有非删除 owner 后再删文件。
- [x] 6.5 从 `ApiFormat`、builtin registry、Provider exports 与 catalog 移除 `openai-chat-completions` / `chat-image`，删除其 provider、transport 和专属 tests，同时证明 prompt optimization 与 `openai-images` 不受影响。
- [x] 6.6 清理失效 i18n keys、icons、CSS selectors、test fixtures、Chrome/UXP repository bindings 和 exports；不得删除 Profile repository、Secret Storage、`ModelGenerationPreference`、History、placement 或 ComfyUI owner。

## 7. 验证与 Canonical Writeback

- [x] 7.1 运行 `pnpm --filter @imagen-ps/providers test` 与 catalog harness，验证三个 builtin、静态模型、GRSAI async、Gemini/OpenAI Images request/parse 和 `chat-image` removal。
- [x] 7.2 使用 CodeGraph、`rg`、barrel export 检查与 providers TypeScript build 验证：三个 Provider ownership 集中、无 slice 间 import、无 app -> providers 直连、无旧目录 import、无重复模型/Profile 常量、无无人使用 transport。
- [x] 7.3 运行 `pnpm --filter @imagen-ps/application test`，验证 sanitized projection、Profile ready/init/delete、explicit model admission、async manager 和共享 backend 合同。
- [x] 7.4 运行 `pnpm --filter @imagen-ps/app test:ui`、`test:chrome`、`test:uxp`、`test:visual`、`build:chrome` 与 `build:uxp`；不得主动控制 Photoshop 或 UXP Developer Tool。
- [x] 7.5 从空 Profile/Model storage 运行 `pnpm check:policy` 与 `pnpm validate`，确认无 legacy migration/reset code、无陈旧 route/export 和无跨包边界回归。
- [x] 7.6 将稳定的 Provider vertical-slice ownership、产品 surface、静态模型只读边界和保留的执行链写回 `docs/ENGINEERING_CONTEXT.md`；若 package 规则需要同步，更新 `packages/providers/AGENTS.md`；若测试权威发生变化，同步更新 `docs/TESTING.md`。
