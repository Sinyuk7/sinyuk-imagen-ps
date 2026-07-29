## 1. Provider default model templates

- [x] 1.1 在 Provider contract 定义 readonly `ProviderDefaultModelTemplate`，使每项能从同一 `ApiFormat` 的 Official Model Preset 初始化完整 `UserModelConfig`；删除 `defaultModels` 的 discovery fallback 语义。
- [x] 1.2 以 Provider routing table 固定每个 `ApiFormat` 的唯一 canonical Provider implementation，并让 registry 拒绝 mapping 不一致或同 `ApiFormat` 冲突注册；为 builtin Provider 建立明确模板 inventory。
- [x] 1.3 增加 provider contract tests，覆盖完整模板、多个 wire model 复用同一 `baseModelId`、无效模板拒绝、空数组、正常 canonical 路由与冲突注册拒绝。

## 2. Profile default model initialization

- [x] 2.1 在 Application Profile setup 创建流程读取一次 Provider 默认模板数组；非空数组经完整验证后通过原子 repository operation 初始化全部 `UserModelConfig`。
- [x] 2.2 保持模板为空时的 setup 保存与手动首模型路径；默认模型初始化成功后一次 promotion 为 ready，失败时不公开 ready Profile 或部分默认模型。
- [x] 2.3 编写 command/repository fake tests，覆盖完整初始化、模板为空、非空无效模板、原子写入失败、retry、模板初始化后用户编辑，以及既有 Profile 不自动补写新模板。

## 3. Remove generic remote discovery

- [x] 3.1 删除 `Provider.discoverModels()`、`DiscoveredModel`、三类 Provider `/models` transport/parser 与关联 provider tests。
- [x] 3.2 删除 refresh saved/draft profile model commands、CommandsPort、runtime suggestion、`ModelDiscoveryCache` types/DI 与 memory implementation。
- [x] 3.3 删除 Chrome IndexedDB `modelDiscovery` store、UXP discovery cache repository、composition injections、harness seed 与旧 cache state。

## 4. Profile model UI and compatibility

- [x] 4.1 将 Profile Models UI/hook 移除 refresh/suggestion state，仅投影持久化 `UserModelConfig`；保留空模板 Provider 的手动模型配置路径。
- [x] 4.2 更新 Settings/Profile Models、model configuration 与 Chrome harness tests：默认模板模型直接可用；空模板不拒绝配置保存；非空无效模板不公开 ready Profile 且可重试或取消；endpoint hint 仅作空模板 fallback；遗留 discovery cache 不影响 UI 或初始化。

## 5. Documentation and verification

- [x] 5.1 更新 `docs/ENGINEERING_CONTEXT.md`、`docs/TESTING.md`、`packages/providers/ARCHITECTURE.md`、`packages/providers/TESTING.md` 与 `packages/providers/AGENTS.md`，记录一次性默认模型初始化与 discovery 删除后的边界。
- [x] 5.2 运行 affected provider/application/app tests、Chrome harness、`pnpm check:policy`、`pnpm validate` 与 `pnpm release:verify`；不主动运行 Photoshop/UXP UI 验收。
