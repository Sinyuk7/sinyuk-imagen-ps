## Context

当前 `Provider.discoverModels()` 调用远端 `/models`，Application 将裸 ID 放入 profile discovery cache，再由 Settings UI 维护 runtime suggestion。裸 ID 没有稳定 request strategy、输出矩阵或 capability，且 endpoint 经常不支持模型列举。

`UserModelConfig` 已是 Profile 的唯一可执行模型事实。新 Profile 已使用内部 `setup` 状态隔离首个模型完成前的数据；该状态可作为默认模型初始化期间的内部持久化边界。

## Goals / Non-Goals

**Goals:**

- Provider 提供当前完整默认模型模板数组，数组可为空。
- 创建 Profile 时一次性将非空模板数组初始化为全部完整 `UserModelConfig`，成功后再公开 ready Profile。
- 成功初始化后只保留用户数据；不保留模板来源、版本、origin 或持续关系。
- 删除通用 remote discovery/cache/suggestion 链路；Profile 与 UI 仅读取持久化模型配置。
- 保留无默认模板 Provider 的手动首模型流程。

**Non-Goals:**

- 不提供候选目录、Refresh、持续 catalog sync、旧 Profile 自动补写或模板覆盖用户编辑。
- 不把 `ProviderDefaultModelTemplate`、source、version 或 origin 写入 Profile、Task、History 或 host storage。
- 不引入 `ProviderExtension`、Profile `providerId` 路由、remote model status 或远端任务生命周期。
- 不修改 Provider async execution contract、余额或 Job/UI 生命周期。

## Decisions

### 1. 模板是一次性 Profile 默认数据，不是第二份模型状态

Provider 声明完整 `ProviderDefaultModelTemplate[]`。模板由 `modelId`、`wireModelId`、`baseModelId` 与 `ApiFormat` 构成，并由 `baseModelId` 的 Official Model Preset 唯一确定 request strategy、默认 exposure 与 output matrix。一个 Provider 可为多个不同 wire model 复用同一 `baseModelId`，从而让一组已配置模型直接可用。

Application 在新 Profile 创建时读取该数组一次。成功后只存 `UserModelConfig`；不存 template source、template version、catalog/user origin，也不在任何后续路径重新读取模板。用户编辑、删除与手动新增配置均只操作用户数据。

### 2. Profile 创建以默认模型初始化决定 ready 边界

创建先保存内部 setup Profile。默认模板非空时，Application 先完整验证所有模板，再通过一个原子 repository operation 初始化全部 `UserModelConfig`；只有该 operation 成功后才 promotion 为 ready。初始化失败不产生部分默认模型，也不公开 ready Profile。

默认模板为空不是 Profile 配置错误：setup Profile 已保存，创建流程进入现有手动模型配置页面；用户保存首个模型后沿用既有 promotion 行为。这样“没有模板”不阻塞配置保存，也不会生成没有模型的可用 Profile。

### 3. 默认初始化没有同步、合并或回写语义

默认模板只适用于创建中的空 Profile，不适用于 ready Profile。因此不需要 local-first merge、模板版本、并发用户编辑保护、旧 Profile 补写或启动同步。原子初始化只需在 setup Profile 内确保“全部默认模型或一个也没有”；retry 在成功前可安全重试，成功后不再执行。

### 4. 模板来源封装在 Provider，产品不消费 discovery

本 change 的 builtin Provider 使用仓库审查的本地 authored 模板。未来特定 Provider 可以在其内部将远端信息归一化为同一份完整模板数组，但这不得恢复通用 `discoverModels`、裸 ID、runtime suggestion 或 discovery cache。Application 与 UI 只消费完整模板数组或空数组。

### 5. canonical Provider 唯一决定模板

`packages/providers` 的 Provider routing table 是 `ApiFormat -> ProviderImplementationId` 的唯一 authority；每个受支持 `ApiFormat` 恰有一个 canonical Provider implementation。registry 在注册时验证 descriptor 与该 mapping 一致，并拒绝同一 `ApiFormat` 的冲突 implementation。创建 Profile、默认模板解析和执行均使用该 routing table；系统不得按注册顺序选择，也不得使用另一 Provider 的模板。若需要一个 `ApiFormat` 对应多个 implementation，必须在后续 change 中引入显式持久化路由，不能在本 change 中猜测。

### 6. endpoint hint 仅服务于没有默认模板的 Provider

存在非空默认模板时，完整默认模板是新 Profile 唯一自动初始化来源。只有模板数组为空时，既有 endpoint hint 的 exact Official Model Preset 路由才可自动创建首个模型；未匹配时转入手动配置。该规则消除两套自动创建模型逻辑的冲突。

## Risks / Trade-offs

- [默认模板过时] → 仅影响未来新 Profile；既有 Profile 不会被悄然修改，用户可手动维护。
- [默认模型初始化失败] → setup Profile 不公开；原子 operation 不留下部分模型，可重试或取消创建。
- [Provider 没有模板] → 配置保存成功，但用户必须手动完成首个模型后才能生成。
- [删除 discovery 影响 Settings] → UI 仅读持久化 rows；遗留 cache 被忽略而非迁移。
- [多个 implementation 共用 ApiFormat] → 拒绝隐式路由；后续需要显式 identity 才能支持。

## Migration Plan

1. 定义完整默认模板 contract、canonical Provider 解析与 builtin 模板 inventory；无模板的 Provider 显式返回空数组。
2. 在 Profile setup 创建流程增加原子默认模型初始化；保留空模板的手动首模型路径。
3. 切换 Profile Models、主界面与 UI ports 为 persisted-only 模型数据。
4. 删除 generic discovery transport、cache、suggestion、storage 和关联测试；通过 host adapter harness 证明遗留 cache 无效。
5. 更新工程上下文与测试规则。无生产数据迁移；既有 Profile 不做自动补写。

## Open Questions

无。
