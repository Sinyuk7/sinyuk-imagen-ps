## 1. ProviderExtension 合同与 registry

- [ ] 1.1 为 `ProviderExtension`、secret-free `ProviderExtensionMatchContext`、`ProviderExtensionModel` 和 dormant model-status result 增加 contract tests 与 fake extension harness，覆盖字段约束和可选 `checkModelStatus()`。
- [ ] 1.2 在 `packages/providers` 实现 extension contract 与公开导出，并用中文 JSDoc 固化 providers ownership、无 Application import、`checkModelStatus()` advisory-only 的边界。
- [ ] 1.3 为 registry 增加 0/1/>1 命中、`apiFormats` 预筛选、duplicate `id` 和注册顺序不参与冲突裁决的 focused tests。
- [ ] 1.4 实现显式 `createProviderExtensionRegistry()` 与 `registerBuiltinProviderExtensions()`；builtin 集合保持为空，禁止模块顶层自注册和虚构中转数据。

## 2. Application 模型物化与持久化

- [ ] 2.1 为 Application 增加 fake repository/extension harness，覆盖 context 适配、source 全批次预校验、非法 seed 零写入和 Official Model Preset exact 物化。
- [ ] 2.2 实现 Profile 到 secret-free extension match context 的 adapter，以及共享的 seed 校验/物化 helper；复用 `saveUserModelConfig()` 的 strategy、exposure 和 matrix 规则，不复制 capability 真相。
- [ ] 2.3 为新模型加载 command 增加本地同 `modelId` 完整优先、只补写缺失项、保留 local-only、空 source、重复加载幂等和持久化失败重试测试。
- [ ] 2.4 实现新模型加载 command：解析唯一 extension，以 `(profileId, modelId)` 协调 owned models，只逐项保存缺失配置并返回持久化后的完整列表，不引入 `saveMany` 或跨 host transaction。
- [ ] 2.5 保持 setup Profile 在全部 seed 纯校验和缺失项写入完成后只 promotion 一次；ready Profile 写入中断时保留已成功项，并允许下一次按 `modelId` 补齐。

## 3. Profile Models UI 切换

- [ ] 3.1 更新 CommandsPort、runtime composition 和 UI harness，使 Profile Models mount 与显式 Load/Refresh 只调用新 command 并接收 owned model list。
- [ ] 3.2 删除 `useProviderDraftModelCatalog`、`refreshDraftProfileModels`、suggestion state/row/section/route 和相关 i18n；保留手动 Add、owned model Edit 与失败时原 rows。
- [ ] 3.3 收紧 projection：删除仅服务 suggestion 的 `discovered` 等字段，保留 Composer readiness 使用的 `ProfileModelItem.configured` 和既有 selector 行为。
- [ ] 3.4 更新 shared UI/component tests，验证补写后直接出现可编辑 owned row、无来源沿用 owned empty state、失败仅 toast 且不清空 rows，并移除 suggestion assertions。

## 4. 旧 discovery 与 cache 删除

- [ ] 4.1 从 Provider contract 和 root exports 删除 `discoverModels()`、`DiscoveredModel`，并删除 `openai-images`、`openai-chat-completions`、`gemini-generate-content` 的通用 `/models` transport/parser 与对应 tests。
- [ ] 4.2 删除 Application 的旧 Profile/draft discovery command、deprecated draft hook、`ModelDiscoveryCache` repository/runtime/reconciliation 路径及其 tests/fakes。
- [ ] 4.3 删除 Chrome IndexedDB、UXP JSON 和 host composition 中的 discovery cache store/adapter/file 初始化，更新 adapter persistence tests 证明 host 不再注册或访问该存储。
- [ ] 4.4 扫描 `defaultModels` 和 `ProviderModelInfo` 的全部消费者；仅在确认没有 execution consumer 后删除字段、类型、fixtures 和 exports，保留 Official Model Preset 与 endpoint hint exact setup route。

## 5. Dormant model-status 验收

- [ ] 5.1 增加类型级测试，证明不实现 `checkModelStatus()` 的 extension 合法，统一结果仅允许 `available | unavailable | unknown`，且失败或缺乏证据不能伪装为 `available`。
- [ ] 5.2 扫描 production `packages` 与 `apps`，确认 `.checkModelStatus(` 调用点为零、builtin 实现为零，并确认没有新增 status command、UI、cache、repository、generation/admission wiring。

## 6. 集成验证与稳定知识写回

- [ ] 6.1 运行 providers、application、app shared UI、Chrome/UXP adapter focused tests，并修复所有 extension、持久化、UI 和 host wiring 回归。
- [ ] 6.2 执行旧链零残留扫描，确认 generic `/models` discovery、draft discovery、cache 和 suggestion symbols/routes/copy 已移除，同时 endpoint hint setup 与 configured-model readiness 仍有覆盖。
- [ ] 6.3 按 ownership 将稳定边界写回 `docs/ENGINEERING_CONTEXT.md`、`docs/TESTING.md` 或匹配 module `AGENTS.md`，不记录执行日志或一次性计划。
- [ ] 6.4 运行 `pnpm check:policy`、相关 UI visual gate 和最终 `pnpm validate`，并确认 `git diff --check` 通过。
