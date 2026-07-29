## Why

远端 `/models` discovery、cache 与 runtime suggestion 只提供短暂的裸 ID，不能直接成为可执行模型配置，却扩散到 Provider transport、Application 命令、host storage 与 Settings UI。产品需要创建 Profile 时即可使用的完整默认模型配置；创建完成后，模型配置必须只属于该 Profile 的用户数据。

## What Changes

- 新增 Provider-owned `ProviderDefaultModelTemplate`：每项都是可直接初始化为完整 `UserModelConfig` 的默认数据，精确关联 `ApiFormat`、`modelId`、`wireModelId`、`baseModelId` 与 Official Model Preset capability source。
- 新建 Profile 时，Application 读取一次当前 Provider 的完整默认模板数组。非空数组经完整验证后原子写入全部默认 `UserModelConfig`，再将 Profile promotion 为 ready；空数组不阻止 Profile 配置保存，仍走既有手动首模型流程。
- 默认模板只用于 Profile 初次创建。成功初始化后，系统不持久化 template source、template version 或 catalog/user origin；所有 `UserModelConfig` 都是同一类用户数据，后续编辑、删除和新增不再读取或同步模板。
- **BREAKING** 删除通用 `Provider.discoverModels()`、远端 `/models` transport/parser、discovery cache、runtime suggestion、Settings suggestion UI 及关联 host storage。
- Profile Models 和主界面只读取持久化 `UserModelConfig`。Provider 没有默认模板时仍支持手动模型配置；endpoint hint 仅在默认模板为空时保留既有 exact Official Model Preset 路由。
- 不引入 `ProviderExtension`、`providerId` Profile 路由、持续目录同步或运行时远端 model status 查询。

## Capabilities

### New Capabilities
- `provider-local-model-catalog`: Provider 完整默认模型模板、Profile 首次初始化与手动模型配置兼容。
- `remote-model-discovery-removal`: 远端 discovery/cache/suggestion 删除后 Profile 与 UI 的稳定行为。

### Modified Capabilities

无。

## Impact

- `packages/providers`：Provider default model template contract、catalog rules、builtin descriptors 与 discovery transport 删除。
- `packages/application`：Profile setup、默认模型初始化 repository boundary、Profile model commands 与 tests。
- `apps/app`：Profile Models data flow、CommandsPort、Chrome/UXP storage adapters、UI tests。
- `docs/ENGINEERING_CONTEXT.md`、`docs/TESTING.md`、`packages/providers/ARCHITECTURE.md`、`packages/providers/TESTING.md`、`packages/providers/AGENTS.md`：更新稳定边界。
