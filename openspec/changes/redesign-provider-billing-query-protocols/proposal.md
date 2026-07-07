## Why

当前 provider profile 的 billing 查询仍围绕 `mode: 'none' | 'official' | 'new-api'` 建模，无法直接表达“复用当前 profile 的 `apiKey` 查询余额”与“使用独立 `billing token` 查询余额”这两个更贴近真实 relay 场景的配置方式，也无法把多种 billing 协议尝试与成功协议记忆沉到统一 contract 中。现在需要把 billing 查询升级成全局可扩展能力，并把每个 profile 的配置与成功协议记忆收敛到稳定数据结构里。

## What Changes

- **BREAKING** 删除现有 billing mode 结构，不兼容旧 billing 数据，也不提供迁移逻辑。
- 新增以 `source` 为中心的 profile billing 配置，UI 只保留 `Disabled`、`Use current API key`、`Use billing token` 三种用户可见状态。
- 新增全局 billing protocol registry，首批内置 `credits-api-key-json-v1`、`credits-token-json-v1`、`new-api-user-bearer-v1` 三种协议定义。
- 新增按 profile 触发的 billing protocol 尝试链：按当前 profile 的配置构建候选协议，命中即停止，只在全部失败时向用户返回错误。
- 成功命中的 protocol 写回当前 profile 的 `lastSuccessfulProtocolId`，并同步更新该 profile 的 `updatedAt`。
- 统一 app / application / providers 三层的 billing secret、校验、保存、查询与错误归并路径。

## Capabilities

### New Capabilities
- `profile-billing-query`: 定义 profile 级 billing 查询配置、全局 protocol registry、查询执行链与成功协议写回规则。

### Modified Capabilities

## Impact

- `packages/providers` 的 billing contract、provider config schema、protocol registry 与 `queryBalance()` 实现。
- `packages/application` 的 profile 保存逻辑、secret 解析、billing 刷新命令、profile 回写与 `updatedAt` 更新。
- `apps/app` 的 add/edit settings billing UI、draft 结构、校验与 secret 删除/替换交互。
- 相关 deterministic provider/application/app 测试与 billing query regression cases。
